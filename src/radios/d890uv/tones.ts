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
    /**
     * Presence mask, one bit per slot, SET = PRESENT.
     *
     * CONFIRMED ON HARDWARE 2026-09-01 — read off a radio through this path,
     * with both tone lists still showing their entries. Found in the vendor
     * CPS's serial capture first: request #221
     * reads this address and gets `03`, and request #5088 then reads exactly
     * 128 bytes at 0x3480000 — two records. Popcount matches record count, and
     * the mask is read first. Same shape as the AM airband mask.
     */
    mask: 0x3481900,
    /** Proven by the added entry landing exactly here. */
    stride: 0x40,
    /**
     * 100 — CONFIRMED by where the table stops. Slot 100 would begin at
     * 0x3481900, and those bytes hold a different shape entirely (timing-like
     * values, probably the 5-Tone settings; the vendor schema has several
     * 5-tone tables). Reading past 100 would decode that as tone records.
     */
    slots: 100,
  },
  twoTone: {
    address: 0x3482000,
    /**
     * Presence mask — CPS request #297 reads `03` here, then two records.
     * CONFIRMED ON HARDWARE 2026-09-01 through this driver's own read.
     */
    mask: 0x3482800,
    stride: 0x20,
    /**
     * 32, not the 24 first guessed — CONFIRMED by the boundary. Slot 32 begins
     * at 0x3482400, and those bytes repeat slot 0 verbatim, so that is a second
     * 2-tone table rather than more of this one (the schema has three).
     */
    slots: 32,
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
/**
 * The 2-Tone name field: `+0x08` to the end of the 32-byte record.
 *
 * 24 bytes, i.e. 12 UTF-16 characters — NOT the 16 this parser used to ask for.
 * It read `subarray(0x08, 0x28)`, which runs 8 bytes past the record; JS clamps
 * a subarray silently so the read looked fine, and the mistake only surfaced
 * when the encoder tried to WRITE 32 bytes into 24 and threw. Exported so the
 * encoder cannot drift from the parser again.
 */
export const TWO_TONE_NAME_AT = 0x08;
export const TWO_TONE_NAME_BYTES = D890_TONES.twoTone.stride - TWO_TONE_NAME_AT;

export function parseTwoTone(bytes: Uint8Array, index: number): D890TwoTone | null {
  const first = (bytes[0x00] ?? 0) | ((bytes[0x01] ?? 0) << 8);
  const second = (bytes[0x02] ?? 0) | ((bytes[0x03] ?? 0) << 8);
  if (first === 0 || first === 0xffff) return null;
  return {
    index,
    name: decodeWideCharString(
      bytes.subarray(TWO_TONE_NAME_AT, TWO_TONE_NAME_AT + TWO_TONE_NAME_BYTES),
      TWO_TONE_NAME_BYTES / 2
    ),
    firstTone: first / 10,
    secondTone: second / 10,
  };
}
