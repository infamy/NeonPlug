/**
 * The writer must agree with the reader about where record N lives.
 *
 * This is the bug class that destroyed 994 talk groups on 2026-09-09: the
 * reader banked, the write planner did not, and above the first bank the two
 * pointed at different addresses. Talk groups were fixed then; SCAN LISTS were
 * not, and nobody noticed because the radios in front of us held two.
 *
 * `scanListAddress()` banks every 32 lists, 0x80000 apart. The write spec had
 * no bank until 2026-09-11, so a radio holding 40 scan lists would have had
 * list 33 planned at 0x2104000 while the radio keeps it at 0x2180000 — bytes
 * sent to an address the session never read, on a radio that ACKs a write
 * without echoing it.
 *
 * Rather than test the one table that was wrong, this pins EVERY table with a
 * reader address helper against the planner's own addressing, across each bank
 * boundary. A new table is one line here, and a banked table added without a
 * `bank:` fails immediately.
 */

import { describe, it, expect } from 'vitest';
import { D890_MASKED_TABLES } from '../../src/radios/d890uv/tableWrite';
import { tableRecordAddress } from '../../src/radios/d890uv/writePlan';
import {
  scanListAddress, talkgroupAddress, radioIdAddress, rxGroupAddress,
  roamingChannelAddress, channelAddresses,
} from '../../src/radios/d890uv/structures';

/** Indices chosen to straddle every bank boundary any of these tables has. */
const PROBES = [0, 1, 19, 20, 31, 32, 33, 63, 64, 99, 127, 128, 129, 255, 999, 1000, 1001, 1999, 2000];

const TABLES: [keyof typeof D890_MASKED_TABLES, (i: number) => number][] = [
  ['scanLists', scanListAddress],
  ['talkgroups', talkgroupAddress],
  ['radioIds', radioIdAddress],
  ['rxGroups', rxGroupAddress],
  ['roamingChannels', roamingChannelAddress],
];

describe('the write planner addresses records where the reader finds them', () => {
  for (const [key, readerAddress] of TABLES) {
    const spec = D890_MASKED_TABLES[key];
    it(`${spec.label}: every slot the table can hold`, () => {
      const probes = PROBES.filter((i) => i < spec.slots);
      expect(probes.length).toBeGreaterThan(0);
      for (const index of probes) {
        expect(
          { index, at: `0x${tableRecordAddress(spec, index).toString(16)}` }
        ).toEqual(
          { index, at: `0x${readerAddress(index).toString(16)}` }
        );
      }
    });
  }

  it('scan lists specifically cross their 32-per-block boundary', () => {
    // The regression, stated as itself: flat addressing would put list 33 in
    // the first block. It lives in the second.
    const spec = D890_MASKED_TABLES.scanLists;
    expect(tableRecordAddress(spec, 32)).not.toBe(spec.dataAddress + 32 * spec.stride);
    expect(tableRecordAddress(spec, 32)).toBe(scanListAddress(32));
  });

  it('channels agree too, though they use their own planner', () => {
    // planChannelWrite calls channelAddresses() directly, so this is a check
    // that the reader helper itself still banks at 128.
    expect(channelAddresses(128).primary).not.toBe(channelAddresses(0).primary + 128 * 0x80);
    expect(channelAddresses(128).primary).toBe(channelAddresses(127).primary + 0x80000 - 127 * 0x80);
  });
});
