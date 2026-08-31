import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  decodeOccupancyMask,
  encodeOccupancyMask,
  encodeOccupancyMaskFromIndices,
  occupiedIndices,
} from '../../src/radios/d890uv/structures';

/**
 * Presence masks, and the encoder a write path needs.
 *
 * The vendor CPS DERIVES masks when writing rather than copying back what it
 * read — that was the main result of the write-set analysis. So a writer must be
 * able to rebuild a mask exactly, and the strongest available check is that
 * decoding a real mask off a radio and re-encoding it reproduces the bytes.
 */
const DIR = join(__dirname, '../fixtures/d890uv');
const load = (f: string) => new Uint8Array(readFileSync(join(DIR, f)));

describe('DA-7X2 occupancy masks round-trip against real radio bytes', () => {
  for (const [name, file, slots] of [
    ['channels', 'channel-set.bin', 256],
    ['zones', 'zone-set.bin', 250],
    ['scan lists', 'scanlist-set.bin', 250],
    ['roaming channels', 'roaming-channel-set.bin', 250],
  ] as const) {
    it(`rebuilds the ${name} mask byte for byte`, () => {
      const real = load(file);
      const occupancy = decodeOccupancyMask(real, Math.min(slots, real.length * 8));
      const rebuilt = encodeOccupancyMask(occupancy, real.length);
      expect(Array.from(rebuilt)).toEqual(Array.from(real));
    });
  }

  it('rebuilds the INVERTED talkgroup mask, where polarity is the whole trick', () => {
    // The talkgroup mask is inverted: a CLEAR bit means present. Encoding it with
    // normal polarity would mark every talkgroup absent and every empty slot
    // occupied — the most complete corruption available from one wrong boolean.
    const real = load('talkgroup-set.bin');
    const occupancy = decodeOccupancyMask(real, real.length * 8, true);
    expect(Array.from(encodeOccupancyMask(occupancy, real.length, true))).toEqual(Array.from(real));
    // and the wrong polarity does NOT reproduce it
    expect(Array.from(encodeOccupancyMask(occupancy, real.length, false))).not.toEqual(
      Array.from(real),
    );
  });
});

describe('mask encoding rules a writer depends on', () => {
  it('pads beyond the occupancy list with "absent", honouring polarity', () => {
    // A zero-filled tail on an INVERTED mask claims every unlisted slot is
    // present. That is why byteLength is the region size and padding is not
    // simply zero.
    expect(Array.from(encodeOccupancyMask([true], 4))).toEqual([0x01, 0, 0, 0]);
    expect(Array.from(encodeOccupancyMask([true], 4, true))).toEqual([0xfe, 0xff, 0xff, 0xff]);
  });

  it('is the exact inverse of the decoder for an arbitrary pattern', () => {
    const occupancy = Array.from({ length: 100 }, (_, i) => i % 7 === 0 || i % 11 === 3);
    for (const inverted of [false, true]) {
      const bytes = encodeOccupancyMask(occupancy, 16, inverted);
      expect(decodeOccupancyMask(bytes, occupancy.length, inverted)).toEqual(occupancy);
    }
  });

  it('builds from indices, which is how a writer will actually call it', () => {
    const mask = encodeOccupancyMaskFromIndices([0, 3, 8, 15], 16, 2);
    expect(occupiedIndices(decodeOccupancyMask(mask, 16))).toEqual([0, 3, 8, 15]);
    expect(Array.from(mask)).toEqual([0b00001001, 0b10000001]);
  });

  it('ignores out-of-range indices rather than corrupting a neighbouring byte', () => {
    // A stale reference to a deleted record must not silently set a bit in
    // whatever region follows the mask.
    const mask = encodeOccupancyMaskFromIndices([0, 999, -1], 16, 2);
    expect(Array.from(mask)).toEqual([0x01, 0x00]);
  });
});
