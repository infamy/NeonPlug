/**
 * Talk group writing — banking, index base, and the guard that refuses.
 *
 * Talk groups were editable in the Digital tab and silently discarded on write
 * for as long as this driver has existed, behind THREE independent faults:
 *
 *   1. `buildD890CodeplugTables` never passed the table, so `maskedTable`
 *      returned immediately and the region went out verbatim.
 *   2. The planner addressed records flat while `talkgroupAddress()` banks them
 *      at 1000. Below 1000 the two agree, which is why it looked fine.
 *   3. `QuickContact.index` is 1-based off a read; the planner keys 0-based
 *      slots.
 *
 * Fixing only the first is the dangerous outcome: on a codeplug under 1000
 * entries it appears to work while writing every record one slot high. These
 * tests exist so that cannot happen quietly again.
 *
 * ⚠️ No talk group write has ever reached a radio.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { planCodeplugWrite } from '../../src/radios/d890uv/codeplugWrite';
import { tableRecordAddress } from '../../src/radios/d890uv/writePlan';
import { D890_MASKED_TABLES } from '../../src/radios/d890uv/tableWrite';
import { D890_ADDR } from '../../src/radios/d890uv/constants';
import {
  parseChannel, parseZone, talkgroupAddress, D890_TALKGROUPS_PER_BANK,
} from '../../src/radios/d890uv/structures';
import { useRadioStore } from '../../src/store/radioStore';
import { useQuickContactsStore } from '../../src/store/quickContactsStore';
import { d890Talkgroups } from '../../src/services/d890WriteInput';
import type { Channel } from '../../src/models/Channel';
import type { QuickContact } from '../../src/models/QuickContact';

const DIR = join(__dirname, '../fixtures/d890uv');
const REAL_MASK = new Uint8Array(readFileSync(join(DIR, 'channel-mask-512.bin')));
const rec = (i: number) => new Uint8Array(readFileSync(join(DIR, `channel-${i}.bin`)));

const tg = (slot: number, name: string): QuickContact => ({
  index: slot, offset: 0, name, contactNumber: 200000 + slot,
  callType: 4, hasHeader: false, flag: 0, rawData: new Uint8Array(0),
});

/** A codeplug write whose only table is the talk groups given. */
function setup(talkgroups: QuickContact[], neededSlots: number[]) {
  const channels: Channel[] = [];
  const originals = new Map<number, Uint8Array>();
  for (let i = 0; i < 4; i += 1) {
    const bytes = rec(i);
    channels.push(parseChannel(bytes, i).channel);
    originals.set(i + 1, bytes);
  }
  const readLog = new Map<number, Uint8Array>();
  const zoneMask = new Uint8Array(D890_ADDR.ZONE_SET_SIZE);
  zoneMask[0] |= 1;
  readLog.set(D890_ADDR.ZONE_SET, zoneMask);
  const members = new Uint8Array(D890_ADDR.ZONE_CHANNELS_STRIDE);
  members[2] = 0xff; members[3] = 0xff;
  const name = new Uint8Array(D890_ADDR.ZONE_NAME_STRIDE);
  name[0] = 0x5a; name[2] = 0x31;
  readLog.set(D890_ADDR.ZONE_CHANNELS, members);
  readLog.set(D890_ADDR.ZONE_NAMES, name);

  // The talkgroup presence mask is INVERTED: a set bit means empty.
  readLog.set(D890_ADDR.TALKGROUP_SET, new Uint8Array(1264).fill(0xff));
  // Every record the span touches must have been read — at its BANKED address.
  for (const slot of neededSlots) {
    readLog.set(talkgroupAddress(slot), new Uint8Array(D890_ADDR.TALKGROUP_STRIDE));
  }

  return {
    channels, zones: [parseZone(name, members, 0)], zoneSlots: [0], readLog,
    writeUnmodelledVerbatim: false as const,
    channelInput: {
      originals, originalMask: REAL_MASK,
      counts: { DMRTalkGroups: talkgroups.length, ScanList: 2,
        DMRReceiveGroupCallList: 1, RadioIDList: 4, AESEncryptionCode: 2 },
      referencingTables: [],
    },
    tables: { talkgroups },
  };
}

describe('talkgroup record addressing', () => {
  it('banks at 1000 — slot 1004 lands in bank 1, not off the end of bank 0', () => {
    // The falsifiable part: a flat writer puts slot 1000 at 0x3A30D40, which
    // reads 0xFF on hardware and is never written by the vendor. So a banking
    // bug lands the bytes somewhere provably wrong, not somewhere plausible.
    expect(tableRecordAddress(D890_MASKED_TABLES.talkgroups, 1004)).toBe(0x3a80320);
    expect(tableRecordAddress(D890_MASKED_TABLES.talkgroups, 999)).toBe(0x3a30c78);
    expect(tableRecordAddress(D890_MASKED_TABLES.talkgroups, 1000)).toBe(0x3a80000);
    // …and agrees with the READER, which is the disagreement that caused this.
    for (const slot of [0, 1, 999, 1000, 1004, 2500]) {
      expect(tableRecordAddress(D890_MASKED_TABLES.talkgroups, slot))
        .toBe(talkgroupAddress(slot));
    }
  });

  it('is flat for an unbanked table', () => {
    const spec = D890_MASKED_TABLES.amChannels;
    expect(tableRecordAddress(spec, 3)).toBe(spec.dataAddress + 3 * spec.stride);
  });
});

describe('planning a banked talkgroup write', () => {
  it('writes a bank-1 record at its banked address and never at the flat one', () => {
    const plan = planCodeplugWrite(setup([tg(1004, 'RT bank1')], [1004, 1005]));
    const addresses = plan.frames.map((f) => f.address);
    expect(addresses).toContain(0x3a80320);
    // 0x3A30D40 is where a flat planner would have put slot 1000.
    expect(addresses.some((a) => a >= 0x3a30d40 && a < 0x3a30e00)).toBe(false);
  });

  it('plans each bank as its own span rather than one across the boundary', () => {
    // Spanning the boundary would be ~half a megabyte of mostly nothing.
    const plan = planCodeplugWrite(
      setup([tg(999, 'last of bank 0'), tg(1004, 'in bank 1')], [998, 999, 1004, 1005])
    );
    const tgFrames = plan.frames.filter((f) => f.address >= 0x3a00000 && f.address < 0x3b00000);
    expect(tgFrames.length).toBeLessThan(64);
    // Slot 999's RECORD is at 0x3A30C78 — eight bytes into a frame, because the
    // 0xC8 stride does not divide 16. Its FRAME is the boundary below it, which
    // is exactly why this table needs a span planner and not a per-record one.
    expect(tgFrames.some((f) => f.address === 0x3a30c70)).toBe(true);
    expect(tgFrames.some((f) => f.address === 0x3a80320)).toBe(true);
  });

  it('refuses when a record the span covers was never read', () => {
    // Slot 1005 shares a frame with 1004: the stride is 0xC8, so records do not
    // start on frame boundaries and one frame carries bytes from two records.
    expect(() => planCodeplugWrite(setup([tg(1004, 'x')], [1004])))
      .toThrow(/never read/);
  });

  it('recomputes the inverted presence mask for the slots it writes', () => {
    const plan = planCodeplugWrite(setup([tg(1004, 'x')], [1004, 1005]));
    const maskFrame = plan.frames.find(
      (f) => f.address === D890_ADDR.TALKGROUP_SET + Math.floor(1004 / 8 / 0x10) * 0x10
    );
    expect(maskFrame).toBeDefined();
    // Inverted: a CLEAR bit means present.
    const byteInFrame = Math.floor(1004 / 8) % 0x10;
    expect((maskFrame!.data[byteInFrame] >> (1004 % 8)) & 1).toBe(0);
  });
});

describe('talk groups COMPACT — position is the slot', () => {
  // MEASURED from the vendor CPS on 2026-09-10 by clearing one row and diffing
  // the write it produced against the restored state:
  //
  //     slot 500   TG0501 -> TG0502     500 records shifted down by one
  //     slot 1008  TG1009 -> TG1010
  //     slot 1009  TG1010 -> (empty)    the LAST slot is what is freed
  //     locator[1009]  0x3f1 -> 0xffffffff
  //
  // The table always occupies 0..N-1 with no holes. That is also why the
  // locator is an identity table in every capture — not a rule to preserve, a
  // consequence of the table being unable to have holes.
  //
  // The previous implementation kept survivors on their read slots and punched
  // a hole. It read back byte-perfect and left the radio reporting 1010 talk
  // groups and CRASHING on the deleted one.
  beforeEach(() => {
    useRadioStore.setState({ tables: {} });
    useQuickContactsStore.setState({ contacts: [], contactsLoaded: false });
  });

  it('writes entry i to slot i, whatever index the store carries', () => {
    // The store hands out 1-based positions and renumbers on delete; neither
    // matters now, because position IS the slot.
    useQuickContactsStore.setState({
      contacts: [tg(7, 'a'), tg(9, 'b'), tg(3, 'c')], contactsLoaded: true,
    });
    expect(d890Talkgroups()!.map((c) => c.index)).toEqual([0, 1, 2]);
  });

  it('after a delete the survivors shift down — no hole is left', () => {
    // Three talk groups, the middle one removed. The radio must end up with two
    // occupying slots 0 and 1, not 0 and 2.
    useQuickContactsStore.setState({
      contacts: [tg(1, 'first'), tg(3, 'third')], contactsLoaded: true,
    });
    const out = d890Talkgroups()!;
    expect(out.map((c) => c.index)).toEqual([0, 1]);
    expect(out.map((c) => c.name)).toEqual(['first', 'third']);
  });

  it('an added talk group lands on the end', () => {
    useQuickContactsStore.setState({
      contacts: [tg(1, 'a'), tg(2, 'b'), tg(3, 'new')], contactsLoaded: true,
    });
    expect(d890Talkgroups()!.map((c) => c.index)).toEqual([0, 1, 2]);
  });

  it('a delete is no longer refused HERE — the guard moved to the references', () => {
    // d890Talkgroups only places records, and compaction makes that trivial:
    // entry i to slot i. The dangerous half of a delete is that channels and
    // receive groups reference talk groups BY SLOT, so the refusal lives in
    // d890RenumberedChannels, where those references are actually in hand.
    useRadioStore.setState({
      tables: { writeOriginals: { talkgroupCountAtRead: 3 } as never },
    });
    useQuickContactsStore.setState({
      contacts: [tg(1, 'a'), tg(2, 'b')], contactsLoaded: true,
    });
    expect(d890Talkgroups()!.map((c) => c.index)).toEqual([0, 1]);
  });

  it('ALLOWS an add — a new entry lands on the end and shifts nothing', () => {
    useRadioStore.setState({
      tables: { writeOriginals: { talkgroupCountAtRead: 2 } as never },
    });
    useQuickContactsStore.setState({
      contacts: [tg(1, 'a'), tg(2, 'b'), tg(3, 'new')], contactsLoaded: true,
    });
    expect(d890Talkgroups()!.map((c) => c.index)).toEqual([0, 1, 2]);
  });

  it('needs nothing staged — there is no identity to preserve', () => {
    // No read log, no slot map. Compaction makes both unnecessary, which is why
    // the uid apparatus built for this was removed.
    useQuickContactsStore.setState({ contacts: [tg(1, 'a')], contactsLoaded: true });
    expect(d890Talkgroups()!.map((c) => c.index)).toEqual([0]);
  });
});

/**
 * The locator at 0x3900000.
 *
 * One u32 per slot, and the radio uses it to LOCATE a record. V is the SLOT
 * INDEX, never a packed 0..N-1 — with contiguous talk groups the two coincide,
 * which is why every capture looks like an identity table and why leaving this
 * unwired was survivable while only EDITS were possible. A delete puts a hole in
 * the mask and they diverge immediately.
 */
describe('talk group locator', () => {
  const LOC = 0x3900000;

  function withLocator(contacts: QuickContact[], neededSlots: number[]) {
    const base = setup(contacts, neededSlots);
    base.readLog.set(LOC, new Uint8Array(10000 * 4).fill(0xff));
    return base;
  }

  const entryAt = (plan: ReturnType<typeof planCodeplugWrite>, slot: number) => {
    const at = LOC + slot * 4;
    const frame = plan.frames.find((f) => f.address === at - (at % 0x10));
    if (!frame) return null;
    const o = at - frame.address;
    return ((frame.data[o]! | (frame.data[o+1]! << 8) |
             (frame.data[o+2]! << 16) | (frame.data[o+3]! << 24)) >>> 0);
  };

  it('writes V = the slot index for present slots', () => {
    const plan = planCodeplugWrite(withLocator([tg(1004, 'x')], [1004, 1005]));
    expect(entryAt(plan, 1004)).toBe(1004);
  });

  it('retires an absent slot to 0xFFFFFFFF, leaving a HOLE not a packed list', () => {
    // Slots 0 and 2 present, 1 deleted. A packed writer would emit 0 and 1 and
    // send the radio to the wrong record for the survivor.
    const plan = planCodeplugWrite(
      withLocator([tg(0, 'a'), tg(2, 'c')], [0, 1, 2, 3])
    );
    expect(entryAt(plan, 0)).toBe(0);
    expect(entryAt(plan, 1)).toBe(0xffffffff);
    expect(entryAt(plan, 2)).toBe(2);
  });

  it('writes the full 40,000 bytes, as the vendor does', () => {
    const plan = planCodeplugWrite(withLocator([tg(1, 'a')], [0, 1]));
    const region = plan.written.find((w) => w.region === 'talk group locator');
    expect(region?.bytes).toBe(10000 * 4);
  });

  it('is skipped, not invented, when the locator was never read', () => {
    const plan = planCodeplugWrite(setup([tg(1, 'a')], [0, 1]));
    expect(plan.skipped.map((r) => r.region)).toContain('talk group locator');
  });
});

/**
 * Reading talk groups in contiguous runs.
 *
 * A per-record read asks for `alignRead(0xC8)` = 208 bytes against a 200-byte
 * stride, so it overshoots by 8 and starts mid-frame. On the 1,010-talkgroup
 * radio that left two HALF-READ 16-byte frames — one at the end of each bank —
 * which the write path then refuses to preserve, because completing them would
 * mean inventing the bytes it never read. Run reads are aligned outward at both
 * ends, so every frame they touch is whole.
 */
describe('talkgroup read spans', () => {
  const STRIDE = 0xc8;
  const ALIGN = 0x10;

  /** The spans `readQuickContacts` would request for a set of occupied slots. */
  function spansFor(present: number[]) {
    const runs: number[][] = [];
    for (const index of present) {
      const cur = runs[runs.length - 1];
      const ok = cur !== undefined && index === cur[cur.length - 1]! + 1 &&
        Math.floor(index / D890_TALKGROUPS_PER_BANK) ===
        Math.floor(cur[cur.length - 1]! / D890_TALKGROUPS_PER_BANK);
      if (ok) cur!.push(index); else runs.push([index]);
    }
    return runs.map((run) => {
      const from = talkgroupAddress(run[0]!);
      const to = talkgroupAddress(run[run.length - 1]!) + STRIDE;
      const start = from - (from % ALIGN);
      const end = Math.ceil(to / ALIGN) * ALIGN;
      return { start, length: end - start };
    });
  }

  it('produces frame-aligned spans, so no frame is left half-read', () => {
    const present = Array.from({ length: 1010 }, (_, i) => i);
    for (const s of spansFor(present)) {
      expect(s.start % ALIGN).toBe(0);
      expect(s.length % ALIGN).toBe(0);
    }
  });

  it('splits at the bank boundary — banks share no frame', () => {
    const spans = spansFor(Array.from({ length: 1010 }, (_, i) => i));
    expect(spans).toHaveLength(2);
    expect(spans[0].start).toBe(0x3a00000);
    expect(spans[1].start).toBe(0x3a80000);
  });

  it('breaks at gaps rather than spanning them', () => {
    // A single span from slot 0 to slot 9,999 would pull 2 MB to fetch two
    // records. Sparse tables must stay cheap.
    const spans = spansFor([0, 9999]);
    expect(spans).toHaveLength(2);
    expect(spans[0].length).toBeLessThan(0x100);
    expect(spans[1].length).toBeLessThan(0x100);
  });

  it('covers every occupied record inside its own span', () => {
    const present = [0, 1, 2, 500, 501, 999, 1000, 1009];
    const spans = spansFor(present);
    for (const index of present) {
      const at = talkgroupAddress(index);
      const covering = spans.find((s) => at >= s.start && at + STRIDE <= s.start + s.length);
      expect(covering, `slot ${index} is not inside any span`).toBeDefined();
    }
  });
});
