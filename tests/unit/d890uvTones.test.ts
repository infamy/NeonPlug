import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseFiveTone, parseTwoTone, D890_TONES } from '../../src/radios/d890uv/tones';

/**
 * 16 KB read from 0x3480000 on a real DA-7X2, 2026-08-31, AFTER one 5-Tone and
 * one 2-Tone entry were added in the vendor CPS and written to the radio.
 *
 * These offsets are not transcribed from anywhere — they are the bytes that
 * changed between that read and an identical read taken before the edit.
 */
const DUMP = new Uint8Array(
  readFileSync(join(__dirname, '../fixtures/d890uv/tones-0x3480000.bin'))
);
const at = (address: number, size: number) =>
  DUMP.subarray(address - 0x3480000, address - 0x3480000 + size);

describe('DA-7X2 5-Tone', () => {
  it('reads the pre-existing 14-digit entry', () => {
    expect(parseFiveTone(at(0x3480000, 0x40), 0)).toEqual({
      index: 0,
      digits: '123456789ABCDE',
    });
    expect(parseFiveTone(at(0x3480000, 0x40), 0)!.digits).toHaveLength(0x0e);
  });

  it('reads the entry added for this capture', () => {
    // The whole point of the diff: this slot was 0xFF before the edit.
    expect(parseFiveTone(at(0x3480040, 0x40), 1)).toEqual({ index: 1, digits: '12345678' });
  });

  it('takes its length from the count byte, which two records agree on', () => {
    // Count 0x0e -> 14 digits and 0x08 -> 8. A fixed-length reading would be
    // wrong for one of them, which is exactly why the count byte is the
    // mapping: it predicts the length in both records independently.
    expect(at(0x3480000, 4)[0x02]).toBe(0x0e);
    expect(at(0x3480040, 4)[0x02]).toBe(0x08);
    expect(parseFiveTone(at(0x3480040, 0x40), 1)!.digits).toHaveLength(8);
  });

  it('proves the 0x40 stride — the added entry landed exactly one stride on', () => {
    expect(0x3480000 + D890_TONES.fiveTone.stride).toBe(0x3480040);
  });

  it('treats erased and zero-count slots as absent', () => {
    expect(parseFiveTone(new Uint8Array(0x40).fill(0xff), 9)).toBeNull();
    expect(parseFiveTone(new Uint8Array(0x40), 9)).toBeNull();
  });
});

describe('DA-7X2 2-Tone', () => {
  it('reads the name of the entry added for this capture', () => {
    // "sample2" is directly visible in the bytes as UTF-16LE, so the name
    // offset is observed rather than inferred.
    expect(parseTwoTone(at(0x3482020, 0x20), 1)!.name).toBe('sample2');
  });

  it('decodes both tones as u16 LE tenths of a hertz', () => {
    const added = parseTwoTone(at(0x3482020, 0x20), 1)!;
    expect(added.firstTone).toBeCloseTo(288.0, 1);
    expect(added.secondTone).toBeCloseTo(3106.0, 1);
    const existing = parseTwoTone(at(0x3482000, 0x20), 0)!;
    expect(existing.firstTone).toBeCloseTo(321.7, 1);
    expect(existing.secondTone).toBeCloseTo(928.1, 1);
  });

  it('proves the 0x20 stride', () => {
    expect(0x3482000 + D890_TONES.twoTone.stride).toBe(0x3482020);
  });

  it('treats an erased slot as absent', () => {
    expect(parseTwoTone(new Uint8Array(0x20).fill(0xff), 5)).toBeNull();
  });
});
