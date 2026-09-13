import { describe, it, expect } from 'vitest';
import {
  decodeOccupancyMask,
  occupiedIndices,
  consecutiveRuns,
  range,
} from '../../src/radios/d890uv/structures';
import { D890_BROADCAST } from '../../src/radios/d890uv/broadcastChannels';
import { D890_TONES } from '../../src/radios/d890uv/tones';
import { D890_AM_ZONES } from '../../src/radios/d890uv/amZones';

/**
 * Byte-for-byte from the vendor CPS's own serial capture of a codeplug read
 * (`7x2_read_new.txt`, parsed with tools/parse-serial-capture.mjs) against a
 * radio holding three AM airband channels and one FM channel.
 *
 * The capture settles what this driver had recorded as unverified:
 *
 *  - request #2377 asks for 0x3884200, and the reply is the AM presence mask
 *  - requests #5192-5203 then ask for exactly 192 bytes at 0x3880000 — twelve
 *    16-byte frames, i.e. records 0, 1 and 2 and no more
 *
 * So the CPS reads the mask FIRST and then reads only the slots it names, the
 * polarity is SET = PRESENT, and the mask lives at the address
 * `D890_BROADCAST` declares — not `recordLayout.ts`'s 0x3884000, which the CPS
 * reads as a 64-byte record (the AM VFO). That is why three earlier read
 * attempts at 0x3884000 "returned nothing" when treated as a mask.
 */
const AM_MASK_FROM_RADIO = new Uint8Array(32);
AM_MASK_FROM_RADIO[0] = 0x07;

const FM_PRESENT_FROM_RADIO = new Uint8Array(16);
FM_PRESENT_FROM_RADIO[0] = 0x01;

const FM_SCAN_FROM_RADIO = new Uint8Array(16);
FM_SCAN_FROM_RADIO[0] = 0x01;

describe('broadcast presence masks (bytes captured from a real radio)', () => {
  it('reads three AM channels from 0x07, matching the CPS 192-byte record read', () => {
    const present = occupiedIndices(
      decodeOccupancyMask(AM_MASK_FROM_RADIO, D890_BROADCAST.am.channels)
    );
    expect(present).toEqual([0, 1, 2]);
    // What the driver will now ask the radio for, against the CPS's 192.
    expect(present.length * D890_BROADCAST.am.stride).toBe(192);
  });

  it('reads one FM channel, with its scan flag set', () => {
    const fm = D890_BROADCAST.fm;
    expect(occupiedIndices(decodeOccupancyMask(FM_PRESENT_FROM_RADIO, fm.channels))).toEqual([0]);
    expect(decodeOccupancyMask(FM_SCAN_FROM_RADIO, fm.channels)[0]).toBe(true);
  });

  it('treats an erased 0xFF mask as everything present', () => {
    // The safety property: a blank flash region must degrade to reading the
    // whole table, which is what the driver did before masks were trusted.
    const erased = new Uint8Array(32).fill(0xff);
    expect(
      occupiedIndices(decodeOccupancyMask(erased, D890_BROADCAST.am.channels))
    ).toHaveLength(D890_BROADCAST.am.channels);
  });

  it('reads far fewer bytes than the whole table', () => {
    const am = D890_BROADCAST.am;
    const whole = am.channels * am.stride;
    const masked = 32 + 3 * am.stride;
    expect(whole).toBe(16384);
    expect(masked).toBe(224);
    expect(whole / masked).toBeGreaterThan(70);
  });
});

/**
 * The same mask-first shape, for the other three tables it was found on. Bytes
 * and record counts are from the same capture; the mask is always read before
 * the records, and its popcount always equals the number of records fetched.
 */
describe('other masked tables (same capture)', () => {
  const cases = [
    { table: '5-Tone',     mask: 0x03, slots: 100, stride: 0x40, cpsBytes: 128, expect: [0, 1] },
    { table: '2-Tone',     mask: 0x03, slots: 32,  stride: 0x20, cpsBytes: 64,  expect: [0, 1] },
    { table: 'AM zones',   mask: 0x01, slots: 16,  stride: 0x80, cpsBytes: 128, expect: [0] },
  ];

  for (const c of cases) {
    it(`${c.table}: mask 0x${c.mask.toString(16).padStart(2, '0')} matches the ${c.cpsBytes} bytes the CPS read`, () => {
      const bytes = new Uint8Array(16);
      bytes[0] = c.mask;
      const present = occupiedIndices(decodeOccupancyMask(bytes, c.slots));
      expect(present).toEqual(c.expect);
      expect(present.length * c.stride).toBe(c.cpsBytes);
    });
  }

  it('declares the confirmed mask addresses', () => {
    expect(D890_TONES.fiveTone.mask).toBe(0x3481900);
    expect(D890_TONES.twoTone.mask).toBe(0x3482800);
    expect(D890_AM_ZONES.MASK).toBe(0x3884400);
    expect(D890_BROADCAST.am.mask).toBe(0x3884200);
  });
});

describe('consecutiveRuns', () => {
  it('coalesces a contiguous block into one read', () => {
    // The common case, and what the CPS does: 0,1,2 is ONE 192-byte request.
    expect(consecutiveRuns([0, 1, 2])).toEqual([{ start: 0, count: 3 }]);
  });

  it('splits a gap into separate reads', () => {
    expect(consecutiveRuns([0, 1, 200])).toEqual([
      { start: 0, count: 2 },
      { start: 200, count: 1 },
    ]);
  });

  it('handles an empty list and a single slot', () => {
    expect(consecutiveRuns([])).toEqual([]);
    expect(consecutiveRuns([7])).toEqual([{ start: 7, count: 1 }]);
  });

  it('covers every index exactly once for the read-everything fallback', () => {
    const runs = consecutiveRuns(range(256));
    expect(runs).toEqual([{ start: 0, count: 256 }]);
  });
});
