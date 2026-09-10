/**
 * DMR radio IDs reaching the write plan.
 *
 * `DMRRadioID.index` IS the hardware slot — `readDMRRadioIDs` walks the presence
 * mask and hands each occupied slot to `parseRadioId` — and `dmrRadioIdsStore`
 * renumbers on neither add nor delete. So an edit needs no slot map, unlike scan
 * lists, receive groups and quick messages.
 *
 * DELETE is refused, and the reason is an UNKNOWN rather than a known fault.
 * Two masked tables on this radio disagree about what removing an entry does:
 * zones leave a hole (hardware, 2026-09-03) and talk groups compact (vendor CPS,
 * 2026-09-10). Channels reference radio IDs by index, so guessing wrong points
 * every channel above the deletion at the wrong ID — in a codeplug that reads
 * back clean.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { planCodeplugWrite } from '../../src/radios/d890uv/codeplugWrite';
import { D890_ADDR } from '../../src/radios/d890uv/constants';
import { parseChannel, parseZone, radioIdAddress } from '../../src/radios/d890uv/structures';
import type { Channel } from '../../src/models/Channel';
import type { DMRRadioID } from '../../src/models/DMRRadioID';
import { d890RadioIds } from '../../src/services/d890WriteInput';
import { findDanglingReferences } from '../../src/radios/d890uv/references';
import { useRadioStore } from '../../src/store/radioStore';
import { useDMRRadioIDsStore } from '../../src/store/dmrRadioIdsStore';

const DIR = join(__dirname, '../fixtures/d890uv');
const REAL_MASK = new Uint8Array(readFileSync(join(DIR, 'channel-mask-512.bin')));
const rec = (i: number) => new Uint8Array(readFileSync(join(DIR, `channel-${i}.bin`)));

const rid = (slot: number, name: string, value: number): DMRRadioID => ({
  index: slot, name, dmrId: String(value), dmrIdValue: value,
  dmrIdBytes: new Uint8Array([0, 0, 0]),
} as DMRRadioID);

function setup(radioIds: DMRRadioID[], readSlots: number[]) {
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
  readLog.set(D890_ADDR.RADIO_ID_SET, new Uint8Array(D890_ADDR.RADIO_ID_SET_SIZE));
  for (const slot of readSlots) {
    readLog.set(radioIdAddress(slot), new Uint8Array(D890_ADDR.RADIO_ID_STRIDE));
  }
  return {
    channels, zones: [parseZone(name, members, 0)], zoneSlots: [0], readLog,
    writeUnmodelledVerbatim: false as const,
    channelInput: {
      originals, originalMask: REAL_MASK,
      counts: { DMRTalkGroups: 6, ScanList: 2, DMRReceiveGroupCallList: 1,
        RadioIDList: radioIds.length, AESEncryptionCode: 2 },
      referencingTables: [],
    },
    tables: { radioIds },
  };
}

/** The 4 BCD bytes of the ID written to a given slot. */
const idBytesAt = (plan: ReturnType<typeof planCodeplugWrite>, slot: number) => {
  const at = radioIdAddress(slot);
  const frame = plan.frames.find((f) => f.address === at - (at % 0x10));
  return frame ? Array.from(frame.data.subarray(at % 0x10, (at % 0x10) + 4)) : null;
};

describe('radio IDs reach the plan', () => {
  it('writes each ID to the slot its index names', () => {
    const plan = planCodeplugWrite(setup([rid(2, 'RID Two', 47)], [0, 1, 2]));
    // Slot 2, not list position 0 — index IS the hardware slot.
    expect(idBytesAt(plan, 2)).toEqual([0x00, 0x00, 0x00, 0x47]);
  });

  it('honours a HOLE in the slot set rather than packing entries down', () => {
    // Slots 0 and 3 occupied, 1 and 2 empty. Writing by list position would put
    // the second ID in slot 1 and silently repoint every channel using it.
    const plan = planCodeplugWrite(setup([rid(0, 'A', 1), rid(3, 'D', 4)], [0, 1, 2, 3]));
    expect(idBytesAt(plan, 0)).toEqual([0x00, 0x00, 0x00, 0x01]);
    expect(idBytesAt(plan, 3)).toEqual([0x00, 0x00, 0x00, 0x04]);
    expect(idBytesAt(plan, 1)).toBeNull();
  });

  it('recomputes the presence mask from the entries', () => {
    const plan = planCodeplugWrite(setup([rid(0, 'A', 1), rid(3, 'D', 4)], [0, 1, 2, 3]));
    const maskFrame = plan.frames.find((f) => f.address === D890_ADDR.RADIO_ID_SET);
    expect(maskFrame).toBeDefined();
    expect(maskFrame!.data[0] & 0b1111).toBe(0b1001);
  });

  it('REFUSES a slot the session never read rather than inventing one', () => {
    // Stronger than skipping: a radio ID record has no known blank to build
    // from, so an unread slot cannot be written at all and the plan says so
    // instead of quietly dropping the entry.
    expect(() => planCodeplugWrite(setup([rid(9, 'far', 9)], [0])))
      .toThrow(/never read from the radio/);
  });
});

describe('d890RadioIds — the store path', () => {
  beforeEach(() => {
    useRadioStore.setState({ tables: {} });
    useDMRRadioIDsStore.setState({ radioIds: [], radioIdsLoaded: false });
  });

  const stage = (slots: number[]) =>
    useRadioStore.setState({
      tables: { writeOriginals: { radioIdSlotsAtRead: slots } as never },
    });

  it('passes each ID through on its own slot, holes and all', () => {
    stage([0, 3]);
    useDMRRadioIDsStore.setState({
      radioIds: [rid(0, 'A', 1), rid(3, 'D', 4)], radioIdsLoaded: true,
    });
    expect(d890RadioIds()!.map((r) => r.index)).toEqual([0, 3]);
  });

  it('DELETE leaves a hole — survivors keep their slots', () => {
    // Measured 2026-09-10: deleting radio ID slot 2 of 0-3 left the read
    // fetching 0x3680000 (slots 0-1) and 0x36800c0 (slot 3). Nothing shifted,
    // so channels referencing slot 3 still resolve and need no renumbering.
    stage([0, 1, 2, 3]);
    useDMRRadioIDsStore.setState({
      radioIds: [rid(0, 'A', 1), rid(1, 'B', 2), rid(3, 'D', 4)], radioIdsLoaded: true,
    });
    expect(d890RadioIds()!.map((r) => r.index)).toEqual([0, 1, 3]);
  });

  it('ALLOWS an edit — same slots, changed contents', () => {
    stage([0, 1]);
    useDMRRadioIDsStore.setState({
      radioIds: [rid(0, 'renamed', 99), rid(1, 'B', 2)], radioIdsLoaded: true,
    });
    expect(d890RadioIds()!.map((r) => r.name)).toEqual(['renamed', 'B']);
  });

  it('ALLOWS an add on a free slot', () => {
    stage([0, 1]);
    useDMRRadioIDsStore.setState({
      radioIds: [rid(0, 'A', 1), rid(1, 'B', 2), rid(2, 'new', 3)], radioIdsLoaded: true,
    });
    expect(d890RadioIds()!.map((r) => r.index)).toEqual([0, 1, 2]);
  });

  it('passes through untouched when nothing was staged', () => {
    useDMRRadioIDsStore.setState({ radioIds: [rid(5, 'A', 1)], radioIdsLoaded: true });
    expect(d890RadioIds()!.map((r) => r.index)).toEqual([5]);
  });
});

/**
 * The dangling-reference gate has to understand holes.
 *
 * It was count-based: a reference of N was out of range when N exceeded the
 * number of entries. That is only equivalent to "does this slot exist" for a
 * CONTIGUOUS table, and radio IDs and scan lists are not — deleting radio ID
 * slot 2 of 0-3 leaves three entries occupying slots 0, 1 and 3, and a count of
 * 3 would refuse a channel referencing slot 3.
 */
describe('findDanglingReferences with holes', () => {
  const counts = {
    DMRTalkGroups: 6, ScanList: 2, DMRReceiveGroupCallList: 1,
    RadioIDList: 3, AESEncryptionCode: 2,
  };
  const chan = (n: number, radioIdIndex: number) =>
    ({ number: n, name: `CH${n}`, dmrRadioIdIndex: radioIdIndex } as Channel);

  it('accepts a reference to a high slot when the slot set says it exists', () => {
    // Slots 0, 1 and 3 occupied. The count is 3, so a count-based check calls
    // slot 3 out of range and refuses a perfectly valid write.
    const out = findDanglingReferences([chan(1, 3)], counts, {
      RadioIDList: new Set([0, 1, 3]),
    });
    expect(out).toEqual([]);
  });

  it('still catches a reference to the HOLE itself', () => {
    const out = findDanglingReferences([chan(1, 2)], counts, {
      RadioIDList: new Set([0, 1, 3]),
    });
    expect(out.map((d) => d.reason)).toEqual(['out-of-range']);
  });

  it('falls back to the count for a table with no slot set', () => {
    // Talk groups compact, so a count and a slot set say the same thing and the
    // count is the simpler truth.
    const out = findDanglingReferences(
      [{ number: 1, name: 'CH1', contactId: 99 } as Channel], counts, {}
    );
    expect(out.map((d) => d.reason)).toEqual(['out-of-range']);
  });
});
