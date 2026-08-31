import { D890_ADDR } from './constants';

/**
 * DA-7X2 AM airband and FM broadcast channels.
 *
 * This radio keeps these OUTSIDE the main channel list — separate tables, and in
 * the AM case a separate zone list too. They are receive-only bands the radio
 * supports alongside its TX bands, and the vendor CPS gives each its own grid.
 *
 * Both tables share a record shape, confirmed by dumping a radio 2026-08-30:
 *
 *     +0x00  4 bytes  frequency, BCD digits
 *     +0x04  UTF-16LE name ("AM-001", "FM-001" as factory defaults)
 *
 * ⚠️ THE TWO BANDS USE DIFFERENT FREQUENCY SCALES. This is not a mistake and
 * must not be "tidied" into one constant:
 *
 *     AM airband   BCD x 10 Hz    10 80 00 00 -> 10800000 -> 108.00000 MHz
 *     FM broadcast BCD x 100 Hz   01 08 00 00 -> 01080000 -> 108.0000  MHz
 *
 * Both defaults land on 108 MHz — the airband floor and the FM ceiling — which
 * is what made the two scales hard to separate from one capture. The operator
 * confirmed both readings against the vendor CPS. The reason is physical: the
 * airband needs 8.33/25 kHz steps, FM broadcast only 100 kHz, so FM can afford
 * the coarser unit and buys a wider range with the same four bytes.
 */

export type D890BroadcastBand = 'am' | 'fm';

export const D890_BROADCAST = {
  am: {
    label: 'AM Airband',
    data: D890_ADDR.AM_AIR_DATA,
    /** Hz per BCD count. */
    freqUnitHz: 10,
  },
  fm: {
    label: 'FM Broadcast',
    data: D890_ADDR.FM_BROADCAST_DATA,
    freqUnitHz: 100,
  },
} as const;

export interface D890BroadcastChannel {
  index: number;
  name: string;
  /** MHz, or null when the record carries no usable frequency. */
  frequency: number | null;
}

/**
 * Decode 4 BCD bytes to their digit value.
 *
 * Returns null on any non-decimal nibble — 0xFF padding decodes to nothing
 * rather than to a bogus frequency, which matters because an unused slot on this
 * radio is erased flash, not zeros.
 */
export function decodeBcd4(bytes: Uint8Array, offset = 0): number | null {
  let value = 0;
  for (let i = 0; i < 4; i += 1) {
    const b = bytes[offset + i] ?? 0xff;
    const hi = b >> 4;
    const lo = b & 0x0f;
    if (hi > 9 || lo > 9) return null;
    value = value * 100 + hi * 10 + lo;
  }
  return value;
}

/** UTF-16LE name, stopping at NUL or at 0xFFFF erased padding. */
function readName(bytes: Uint8Array, offset: number, maxChars: number): string {
  let out = '';
  for (let i = 0; i < maxChars; i += 1) {
    const c = (bytes[offset + i * 2] ?? 0) | ((bytes[offset + i * 2 + 1] ?? 0) << 8);
    if (c === 0 || c === 0xffff) break;
    out += String.fromCharCode(c);
  }
  return out;
}

/** Decode one AM or FM record. */
export function parseBroadcastChannel(
  bytes: Uint8Array,
  index: number,
  band: D890BroadcastBand
): D890BroadcastChannel {
  const raw = decodeBcd4(bytes, 0);
  const unit = D890_BROADCAST[band].freqUnitHz;
  return {
    index,
    name: readName(bytes, 0x04, D890_ADDR.BROADCAST_NAME_CHARS),
    frequency: raw === null ? null : (raw * unit) / 1e6,
  };
}

/** True when a slot holds nothing: no name and no decodable frequency. */
export function isVacantBroadcastChannel(ch: D890BroadcastChannel): boolean {
  return ch.name === '' && ch.frequency === null;
}
