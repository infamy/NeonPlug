import { describe, it, expect } from 'vitest';
import {
  parseAutoRepeaterOffsets,
  encodeAutoRepeaterOffsets,
  AUTO_REPEATER_UNIT_HZ,
  D890_AUTO_REPEATER,
} from '../../src/radios/d890uv/autoRepeater';

/**
 * The unit is 10 Hz, and that is the whole point of this test.
 *
 * CONFIRMED ON HARDWARE 2026-09-03: 5 MHz and 0.6 MHz set in the vendor CPS
 * wrote `20 a1 07 00` (500000) and `60 ea 00 00` (60000) — u32 LE, 10 Hz per
 * count. Nothing else in this driver uses that scale: channel frequencies are
 * BCD and the GPS/roaming tables have their own. Reusing a frequency helper
 * here without checking would be off by a factor of ten or a thousand.
 */
const bytes = (...v: number[]) => {
  const b = new Uint8Array(D890_AUTO_REPEATER.SLOTS * 4);
  v.forEach((x, i) => {
    b[i * 4] = x & 0xff; b[i * 4 + 1] = (x >>> 8) & 0xff;
    b[i * 4 + 2] = (x >>> 16) & 0xff; b[i * 4 + 3] = (x >>> 24) & 0xff;
  });
  return b;
};

describe('auto-repeater offsets', () => {
  it('decodes the captured hardware bytes to 5 MHz and 0.6 MHz', () => {
    const b = new Uint8Array(D890_AUTO_REPEATER.SLOTS * 4);
    b.set([0x20, 0xa1, 0x07, 0x00, 0x60, 0xea, 0x00, 0x00], 0);
    const out = parseAutoRepeaterOffsets(b);
    expect(out[0]).toBeCloseTo(5.0, 6);
    expect(out[1]).toBeCloseTo(0.6, 6);
  });

  it('holds 250 slots, matching the CPS', () => {
    expect(D890_AUTO_REPEATER.SLOTS * D890_AUTO_REPEATER.STRIDE).toBe(0x3e8);
    expect(parseAutoRepeaterOffsets(bytes())).toHaveLength(250);
  });

  it('treats an empty slot as no offset, not 0 MHz', () => {
    const b = new Uint8Array(D890_AUTO_REPEATER.SLOTS * 4).fill(0xff);
    expect(parseAutoRepeaterOffsets(b)[0]).toBeNull();
    expect(parseAutoRepeaterOffsets(bytes(0))[0]).toBeNull();
  });

  it('round-trips', () => {
    const b = bytes(500000, 60000, 1000000);
    expect(Array.from(encodeAutoRepeaterOffsets(b, parseAutoRepeaterOffsets(b))))
      .toEqual(Array.from(b));
  });

  it('patches — slots the caller omits keep their bytes', () => {
    const b = bytes(500000, 60000);
    const out = encodeAutoRepeaterOffsets(b, [7.6]);
    // Assert the round trip rather than a hand-computed hex byte — doing that
    // arithmetic in your head is how this test was wrong the first time.
    expect(parseAutoRepeaterOffsets(out)[0]).toBeCloseTo(7.6, 6);
    // Slot 1 was not supplied, so its bytes must be untouched.
    expect(Array.from(out.subarray(4, 8))).toEqual([0x60, 0xea, 0x00, 0x00]);
    expect(parseAutoRepeaterOffsets(out)[1]).toBeCloseTo(0.6, 6);
  });

  it('the unit is documented as 10 Hz', () => {
    expect(AUTO_REPEATER_UNIT_HZ).toBe(10);
    // 5 MHz at 10 Hz per count is 500000 — the exact captured value.
    expect((5 * 1_000_000) / AUTO_REPEATER_UNIT_HZ).toBe(500000);
  });
});
