/**
 * The preserve pass must write back everything the session READ.
 *
 * This is a regression test for real data loss. On 2026-09-09 a NeonPlug write
 * destroyed 994 of a radio's 1,010 talk groups. The radio was fine, the reads
 * were fine, the addresses were right; the write simply put back six records.
 *
 * The cause was that the preserve pass walked `VENDOR_WRITE_RUNS` — the vendor
 * CPS's own captured write session, which reads as authoritative and is, for
 * the radio it was captured from. That radio held SIX talk groups, so the run
 * list says `0x3A00000, 1200 bytes`. This radio held 1,010. Writing into the
 * block erased it, and 198,800 bytes had nothing to restore them.
 *
 * The vendor is not doing something different in kind. In the SAME capture it
 * writes the talk group locator at its full fixed 40,000 bytes and the presence
 * mask at its full 1,264 — those are fixed tables — and 1,200 bytes of RECORDS,
 * because that radio had six. Its write is CONTENT-SIZED. Freezing all 74 run
 * lengths turned a content-sized rule into a fixed one, and the difference only
 * shows up on a radio holding more than the captured one did.
 *
 * The read log is that same rule derived from the radio in front of us.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { planCodeplugWrite, describeCoverage } from '../../src/radios/d890uv/codeplugWrite';
import { D890_ADDR } from '../../src/radios/d890uv/constants';
import { parseChannel, parseZone, talkgroupAddress } from '../../src/radios/d890uv/structures';
import { D890_MEMORY_MAP } from '../../src/radios/d890uv/recordLayout';
import type { Channel } from '../../src/models/Channel';

const DIR = join(__dirname, '../fixtures/d890uv');
const REAL_MASK = new Uint8Array(readFileSync(join(DIR, 'channel-mask-512.bin')));
const rec = (i: number) => new Uint8Array(readFileSync(join(DIR, `channel-${i}.bin`)));

/** A talk group record with recognisable, non-0xFF content. */
function talkgroupRecord(slot: number): Uint8Array {
  const b = new Uint8Array(D890_ADDR.TALKGROUP_STRIDE);
  b[0] = 0x01;
  b[2] = 0x00; b[3] = 0x20; b[4] = (slot >> 8) & 0xff; b[5] = slot & 0xff;
  b[6] = 0x54; b[8] = 0x47; // "TG" in UTF-16LE
  return b;
}

/**
 * A read log holding `count` talk groups — i.e. a radio with more of them than
 * the vendor capture's six.
 */
function setup(talkgroupCount: number) {
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

  // The reader fetches one record per occupied slot, at its banked address.
  for (let slot = 0; slot < talkgroupCount; slot += 1) {
    readLog.set(talkgroupAddress(slot), talkgroupRecord(slot));
  }

  return {
    channels, zones: [parseZone(name, members, 0)], zoneSlots: [0], readLog,
    channelInput: {
      originals, originalMask: REAL_MASK,
      counts: { DMRTalkGroups: talkgroupCount, ScanList: 2,
        DMRReceiveGroupCallList: 1, RadioIDList: 4, AESEncryptionCode: 2 },
      referencingTables: [],
    },
  };
}

/** Bytes of the read log the plan would not send back. */
function unwritten(input: ReturnType<typeof setup>) {
  const plan = planCodeplugWrite(input);
  const touched = new Set<number>();
  for (const f of plan.frames) for (let i = 0; i < f.data.length; i += 1) touched.add(f.address + i);
  let missing = 0;
  for (const [start, bytes] of input.readLog) {
    for (let i = 0; i < bytes.length; i += 1) if (!touched.has(start + i)) missing += 1;
  }
  return { plan, missing };
}

describe('the preserve pass writes back what was read', () => {
  it('writes back EVERY byte of a 1,010-talkgroup read', () => {
    // The exact shape of the radio that lost data: far more talk groups than
    // the vendor capture's six, spanning the 1000-record bank boundary.
    const { missing } = unwritten(setup(1010));
    expect(missing).toBe(0);
  });

  it('reaches records the vendor run list never covered', () => {
    // 0x3A00000's captured run is 1200 bytes — six records. Slot 499 sits at
    // 0x3A185D8, far outside it, and is exactly the record that came back 0xFF
    // from the radio after the write.
    const { plan } = unwritten(setup(1010));
    const at = talkgroupAddress(499);
    const frame = plan.frames.find((f) => f.address === at - (at % 0x10));
    expect(frame).toBeDefined();
  });

  it('reaches the second bank, which no vendor run mentions at all', () => {
    // Slots 1000-1009 survived the incident ONLY because nothing had written
    // into their block. They were read and not preserved, so any write landing
    // there would have taken them too.
    const { plan } = unwritten(setup(1010));
    const at = talkgroupAddress(1004);
    expect(plan.frames.some((f) => f.address === at - (at % 0x10))).toBe(true);
  });

  it('scales with the radio, not with the capture', () => {
    // Six talk groups and 1,010 both write back completely. A fixed run list
    // can only be right for one of them.
    expect(unwritten(setup(6)).missing).toBe(0);
    expect(unwritten(setup(1010)).missing).toBe(0);
    expect(unwritten(setup(1010)).plan.frames.length)
      .toBeGreaterThan(unwritten(setup(6)).plan.frames.length);
  });

  it('never invents a byte the session did not read', () => {
    // The other half of the rule. Every frame must come from the read log.
    const input = setup(1010);
    const { plan } = unwritten(input);
    const readable = new Set<number>();
    for (const [start, bytes] of input.readLog) {
      for (let i = 0; i < bytes.length; i += 1) readable.add(start + i);
    }
    const verbatim = plan.frames.filter((f) => f.what === 'unchanged');
    expect(verbatim.length).toBeGreaterThan(0);
    for (const f of verbatim) {
      for (let i = 0; i < f.data.length; i += 1) expect(readable.has(f.address + i)).toBe(true);
    }
  });
});

describe('the preserve pass respects neverWrite', () => {
  it('covers every region recordLayout flags neverWrite', () => {
    // `codeplugWrite` declares its forbidden ranges from `constants` so the
    // annotated memory map stays out of the bundle (+67 KB otherwise, and the
    // deployed page is the offline app). This is what stops the two drifting:
    // flag a region `neverWrite` in recordLayout without adding it there, and
    // the preserve pass would happily write it back.
    const flagged = D890_MEMORY_MAP.filter((r) => r.neverWrite);
    expect(flagged.length).toBeGreaterThan(0);
    for (const region of flagged) {
      const input = setup(6);
      input.readLog.set(region.address, new Uint8Array(region.size ?? 0x10).fill(0xab));
      const plan = planCodeplugWrite(input);
      const touched = plan.frames.filter(
        (f) => f.address >= region.address && f.address < region.address + (region.size ?? 0x10)
      );
      expect(touched, `${region.name} is flagged neverWrite but the plan writes it`).toEqual([]);
    }
  });

  it('refuses to write Local info even when it is in the read log', () => {
    // The opposite failure to the one this change fixes. Widening the pass from
    // "what the vendor writes" to "everything we read" is what stops the
    // under-write, and it is exactly what could start writing somewhere we have
    // no business writing. `Local info` is the radio identifying itself.
    //
    // It does not reach the log today only because `negotiateReadLength` uses
    // `readChunk`, which does not log — an accident of which method reads it.
    // This pins the flag instead.
    const input = setup(6);
    input.readLog.set(D890_ADDR.LOCAL_INFO, new Uint8Array(D890_ADDR.LOCAL_INFO_SIZE).fill(0xab));
    const plan = planCodeplugWrite(input);
    const touched = plan.frames.filter(
      (f) => f.address >= D890_ADDR.LOCAL_INFO &&
             f.address < D890_ADDR.LOCAL_INFO + D890_ADDR.LOCAL_INFO_SIZE
    );
    expect(touched).toEqual([]);
  });

  it('still writes back everything else in the same read', () => {
    // The exclusion must be surgical, not a reason to drop neighbours.
    const input = setup(6);
    input.readLog.set(D890_ADDR.LOCAL_INFO, new Uint8Array(D890_ADDR.LOCAL_INFO_SIZE).fill(0xab));
    const plan = planCodeplugWrite(input);
    const touched = new Set<number>();
    for (const f of plan.frames) for (let i = 0; i < f.data.length; i += 1) touched.add(f.address + i);
    let missing = 0;
    for (const [start, bytes] of input.readLog) {
      if (start === D890_ADDR.LOCAL_INFO) continue;
      for (let i = 0; i < bytes.length; i += 1) if (!touched.has(start + i)) missing += 1;
    }
    expect(missing).toBe(0);
  });
});

describe('describeCoverage surfaces the exposure', () => {
  it('reports 0 bytes read-but-not-written once the read log drives the pass', () => {
    const input = setup(1010);
    const plan = planCodeplugWrite(input);
    const coverage = describeCoverage(plan, input.readLog);
    expect(coverage.bytesReadNotWritten).toBe(0);
    expect(coverage.readNotWrittenByBlock).toEqual([]);
  });

  it('would have counted the loss — percentOfVendorBytes cannot', () => {
    // With the preserve pass off, the plan writes only the modelled tables.
    // percentOfVendorBytes measures against the CAPTURE and stays high; the new
    // number measures against THIS radio and goes straight up. That gap is the
    // whole reason the old report could read 102% while dropping 61%.
    const input = setup(1010);
    const plan = planCodeplugWrite({ ...input, writeUnmodelledVerbatim: false });
    const coverage = describeCoverage(plan, input.readLog);
    expect(coverage.bytesReadNotWritten).toBeGreaterThan(190_000);
    const worst = coverage.readNotWrittenByBlock[0];
    expect(worst.block).toBe(0x3a00000);
  });
});
