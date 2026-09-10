/**
 * Receive groups reaching the write plan.
 *
 * The last table to be wired, and the one that took longest, because its
 * presence mask address was disputed. `D890_ADDR.RX_GROUP_SET` (0x3701510) was
 * believed to collide with a hot key mask and read zero on a radio that held two
 * lists, so writing it risked destroying a neighbouring table.
 *
 * SETTLED ON HARDWARE 2026-09-10 by two vendor CPS captures:
 *
 *   - Creating two groups changed EXACTLY ONE BYTE in a 500 KB write —
 *     0x3701510, 0x00 to 0x03 — while 0x3701500 (the real hot key / status
 *     bitmask) stayed 0f. Two were added rather than one because a mask goes
 *     0x03 to 0x0f while a COUNT goes 0x02 to 0x04.
 *   - Deleting the group in slot 0 moved the mask to 0x02 and rewrote ONLY
 *     slot 1, whose 288 bytes came back byte-for-byte identical. A delete
 *     leaves a HOLE.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { d890RxGroups } from '../../src/services/d890WriteInput';
import { useRXGroupsStore } from '../../src/store/rxGroupsStore';
import { applyRxGroupToRecord } from '../../src/radios/d890uv/tableWrite';
import { blankRxGroup } from '../../src/radios/d890uv/blankRecords';
import { D890_ADDR } from '../../src/radios/d890uv/constants';
import type { RXGroup } from '../../src/models/RXGroup';

/** The vendor's own `RX Group Delta` record: 47 members and a name. */
const VENDOR = new Uint8Array(
  readFileSync(join(__dirname, '../fixtures/d890uv/rxgroup-vendor.bin'))
);

const VENDOR_MEMBERS = [
  8, 164, 378, 393, 394, 395, 396, 397, 398, 399, 400, 401, 402, 403, 404,
  440, 441, 442, 443, 444, 445, 446, 447, 448, 449, 450, 451, 452, 453, 454,
  455, 456, 457, 458, 459, 460, 461, 462, 463, 464, 465, 466, 467, 468, 469,
  470, 471,
];

const group = (index: number, name: string, members: number[]): RXGroup =>
  ({ index, name, talkGroupIndices: members } as RXGroup);

beforeEach(() => useRXGroupsStore.setState({ groups: [], selectedGroup: null }));

describe('a receive group record we build', () => {
  it('matches the vendor CPS byte for byte, over the 0x120 it writes', () => {
    const ours = applyRxGroupToRecord(blankRxGroup(), group(1, 'RX Group Delta', VENDOR_MEMBERS));
    expect(Array.from(ours.subarray(0, 0x120))).toEqual(Array.from(VENDOR));
  });

  it('leaves 0x120-0x1ff at 0xFF, which is what a populated record holds', () => {
    // The vendor writes 288 bytes and stops. A NeonPlug read of the radio shows
    // both populated records reading 0xFF for the whole span from 0x120.
    const ours = applyRxGroupToRecord(blankRxGroup(), group(1, 'x', [1]));
    expect(ours.length).toBe(D890_ADDR.RX_GROUP_STRIDE);
    expect([...new Set(ours.subarray(0x120))]).toEqual([0xff]);
  });

  it('terminates the member list with the u32 sentinel', () => {
    const ours = applyRxGroupToRecord(blankRxGroup(), group(0, 'x', [12, 34]));
    expect(Array.from(ours.subarray(0, 12))).toEqual(
      [12, 0, 0, 0, 34, 0, 0, 0, 0xff, 0xff, 0xff, 0xff]
    );
  });
});

describe('d890RxGroups — the store path', () => {
  it('passes each group through on its own slot, holes and all', () => {
    useRXGroupsStore.setState({ groups: [group(0, 'A', [1]), group(3, 'D', [2])] });
    expect(d890RxGroups()!.map((g) => g.index)).toEqual([0, 3]);
  });

  it('DELETE leaves a hole — the survivor keeps its slot', () => {
    // Measured: deleting slot 0 of {0,1} left the mask at 0x02 and rewrote only
    // slot 1. Renumbering here would write slot 1's record into slot 0 and
    // silently repoint every channel naming it.
    useRXGroupsStore.setState({ groups: [group(0, 'A', [1]), group(1, 'B', [2])] });
    useRXGroupsStore.getState().deleteGroup(0);
    expect(d890RxGroups()!.map((g) => [g.index, g.name])).toEqual([[1, 'B']]);
  });

  it('ADD takes the lowest free slot, reusing a hole', () => {
    useRXGroupsStore.setState({ groups: [group(0, 'A', [1]), group(2, 'C', [2])] });
    useRXGroupsStore.getState().addGroup({ name: 'new', talkGroupIndices: [3] } as RXGroup);
    expect(d890RxGroups()!.map((g) => g.index).sort((a, b) => a - b)).toEqual([0, 1, 2]);
  });

  it('returns undefined when the radio holds none', () => {
    expect(d890RxGroups()).toBeUndefined();
  });
});
