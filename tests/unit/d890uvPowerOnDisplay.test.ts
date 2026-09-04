import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parsePowerOnDisplay, D890_POWER_ON } from '../../src/radios/d890uv/powerOnDisplay';

/**
 * Real bytes from 0x3500900 on a DA-7X2, captured 2026-08-29. The vendor CPS's
 * Power-on tab showed WELCOME / ANYTONE / 12345678 for this same radio, so the
 * decode is checked against the vendor's own rendering, not just against itself.
 */
const BYTES = new Uint8Array(
  readFileSync(join(__dirname, '../fixtures/d890uv/power-on-display.bin'))
);

describe('DA-7X2 power-on display', () => {
  it('matches what the CPS showed for the same radio', () => {
    expect(parsePowerOnDisplay(BYTES)).toEqual({
      line1: 'WELCOME',
      line2: 'ANYTONE',
      password: '12345678',
    });
  });

  it('reads the password as ASCII, not UTF-16 like the two lines', () => {
    // The mixed encoding is the trap here: 0x3500900 and 0x3500920 are UTF-16LE
    // ("W\0E\0L\0..."), while 0x3500940 is plain bytes ("12345678"). Decoding
    // the password as wide characters yields a two-character string of CJK.
    expect(Array.from(BYTES.subarray(0x00, 0x04))).toEqual([0x57, 0x00, 0x45, 0x00]);
    expect(Array.from(BYTES.subarray(0x40, 0x44))).toEqual([0x31, 0x32, 0x33, 0x34]);
  });

  it('stops at the declared 14 characters, not the 16 the field could hold', () => {
    // 0x20 bytes is 16 UTF-16 units, but the vendor declares varchar(14) and the
    // CPS draws 14 boxes. Decoding 16 would surface characters the CPS cannot
    // produce and a write could not round-trip.
    const full = new Uint8Array(BYTES);
    for (let i = 0; i < 16; i += 1) { full[i * 2] = 0x41 + i; full[i * 2 + 1] = 0; }
    expect(parsePowerOnDisplay(full).line1).toBe('ABCDEFGHIJKLMN');
    expect(parsePowerOnDisplay(full).line1).toHaveLength(D890_POWER_ON.TEXT_CHARS);
  });

  it('treats an erased field as empty rather than as 0xFF glyphs', () => {
    const erased = new Uint8Array(D890_POWER_ON.SPAN).fill(0xff);
    expect(parsePowerOnDisplay(erased)).toEqual({ line1: '', line2: '', password: '' });
  });
});
