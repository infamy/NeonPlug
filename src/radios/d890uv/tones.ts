import { decodeWideCharString } from './structures';

/**
 * 5-Tone and 2-Tone signalling tables.
 *
 * Both mappings come from a controlled before/after diff on real hardware
 * (2026-08-31): one entry was added to each table in the vendor CPS, written to
 * the radio, and the same 16 KB span re-read. Everything below is what actually
 * changed — not a reading of the vendor schema.
 */
export const D890_TONES = {
  fiveTone: {
    address: 0x3480000,
    /** Proven by the added entry landing exactly here. */
    stride: 0x40,
    /** Structural. The vendor CPS's own list length is not known. */
    slots: 100,
  },
  twoTone: {
    address: 0x3482000,
    stride: 0x20,
    slots: 24,
  },
} as const;

export interface D890FiveTone {
  index: number;
  /** Digits as written, e.g. "1234567890ABCDE". */
  digits: string;
}

export interface D890TwoTone {
  index: number;
  name: string;
  /** Hz. */
  firstTone: number;
  secondTone: number;
}

/**
 * One 5-Tone entry.
 *
 * `+0x02` is the digit COUNT and `+0x04` onwards are the digits packed two per
 * byte, high nibble first. Both samples agree: count 0x0e with 7 bytes of
 * digits, and count 0x08 with 4. That the count predicts the length in two
 * independent records is what makes this a mapping rather than a guess.
 *
 * `+0x03` held 0x46 in both and is NOT decoded — one repeated value across two
 * records says nothing about what the byte means.
 */
export function parseFiveTone(bytes: Uint8Array, index: number): D890FiveTone | null {
  const count = bytes[0x02] ?? 0;
  // An unused slot is erased flash. A count of 0 is equally "no entry", and a
  // count past the record cannot be honoured, so both are absent rather than
  // truncated silently.
  if (count === 0 || count === 0xff || count > (bytes.length - 0x04) * 2) return null;

  let digits = '';
  for (let i = 0; i < count; i += 1) {
    const byte = bytes[0x04 + (i >> 1)] ?? 0;
    const nibble = i % 2 === 0 ? byte >> 4 : byte & 0x0f;
    digits += nibble.toString(16).toUpperCase();
  }
  return { index, digits };
}

/**
 * One 2-Tone entry.
 *
 * Both tones are u16 LE in tenths of a hertz; the name is UTF-16LE at `+0x08`.
 * The name is directly observed ("sample2"); the tone scaling is INFERRED from
 * the two samples landing on plausible 2-Tone frequencies (288.0 / 3106.0 and
 * 321.7 / 928.1 Hz) and from the vendor declaring `FirstTone`/`SecondTone` as
 * floating point. A different divisor would still decode, so treat the exact
 * values as unconfirmed until one is set to a known frequency.
 */
export function parseTwoTone(bytes: Uint8Array, index: number): D890TwoTone | null {
  const first = (bytes[0x00] ?? 0) | ((bytes[0x01] ?? 0) << 8);
  const second = (bytes[0x02] ?? 0) | ((bytes[0x03] ?? 0) << 8);
  if (first === 0 || first === 0xffff) return null;
  return {
    index,
    name: decodeWideCharString(bytes.subarray(0x08, 0x28), 16),
    firstTone: first / 10,
    secondTone: second / 10,
  };
}
