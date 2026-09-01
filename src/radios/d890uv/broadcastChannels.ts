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
 * ⚠️ THE TWO BANDS DIFFER IN BOTH SCALE AND FIELD WIDTH. Verified against the
 * vendor's write and read marshallers 2026-08-31:
 *
 *     AM airband   4 BCD bytes  +0x00..+0x03   MHz x 100000 (10 Hz)
 *     FM broadcast 3 BCD bytes  +0x00..+0x02   MHz x 100     (10 kHz)
 *
 * FM byte +0x03 is SKIPPED by both marshallers — the writer steps `add 3` then
 * `add 1` past it. Reading four bytes for FM appeared to work because the only
 * captured record is the 108.000 MHz factory default, whose +0x03 is zero. On a
 * record where that byte holds anything else the four-byte reading is wrong:
 * 98.30 MHz stored as `00 98 30` with `0x55` left over at +0x03 decodes as
 * 98.3055 MHz.
 *
 * The scales are physical, not arbitrary: the airband needs 8.33/25 kHz steps,
 * FM broadcast only 100 kHz.
 *
 * Evidence: FM `sub_00595E70` formats `freq * 100.0` (constant 0x00401E68) and
 * the reader divides by the same; AM `sub_007F6A00` uses 100000.0 (0x00401E80).
 */

export type D890BroadcastBand = 'am' | 'fm';

export const D890_BROADCAST = {
  am: {
    label: 'AM Airband',
    data: 0x3880000,
    /** VFO record, outside the numbered channels and with no mask bit. */
    vfo: 0x3884000,
    /** Present mask, one bit per channel. */
    mask: 0x3884200,
    channels: 256,
    stride: 0x40,
    /** BCD digit bytes carrying the frequency. */
    freqBytes: 4,
    /** Divide the BCD value by this to get MHz. */
    freqDivisor: 100000,
  },
  fm: {
    label: 'FM Broadcast',
    data: 0x3400000,
    vfo: 0x3402000,
    mask: 0x3402040,
    /** Second mask: channels included in scan ("Add"). */
    scanMask: 0x3402050,
    channels: 100,
    stride: 0x40,
    freqBytes: 3,
    freqDivisor: 100,
  },
} as const;

export interface D890BroadcastChannel {
  index: number;
  name: string;
  /** MHz, or null when the record carries no usable frequency. */
  frequency: number | null;
  /**
   * Included when scanning this band — the vendor's `Scan` column, CPS "Add".
   *
   * Undefined where we cannot know rather than false: FM keeps it in a flat mask
   * we read, but AM's lives in `AmChannelList_CH_Scan`, keyed by AM zone, inside
   * the AM zone table we do not read yet. Defaulting AM to false would assert
   * every airband memory is excluded from scan, which we have not established.
   */
  scanAdd?: boolean;
}

/**
 * Decode 4 BCD bytes to their digit value.
 *
 * Returns null on any non-decimal nibble — 0xFF padding decodes to nothing
 * rather than to a bogus frequency, which matters because an unused slot on this
 * radio is erased flash, not zeros.
 */
export function decodeBcd(bytes: Uint8Array, offset: number, length: number): number | null {
  let value = 0;
  for (let i = 0; i < length; i += 1) {
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
  const spec = D890_BROADCAST[band];
  const raw = decodeBcd(bytes, 0, spec.freqBytes);
  return {
    index,
    // 34 bytes = 17 units, but the radio's own limit is 16 characters.
    name: readName(bytes, 0x04, 16),
    // A decoded 0 is "no frequency stored", not a channel at 0 Hz. An unused
    // slot on this radio is usually erased 0xFF, which decodes to null — but
    // some are zero-filled instead, and all-zero bytes are perfectly valid BCD.
    // Neither band can hold 0: AM airband is 108-137 MHz and FM broadcast
    // 64-108 MHz. Treating it as null here means a nameless zero slot is vacant
    // and a NAMED one renders "—" rather than a confident 0.0000 MHz.
    frequency: raw === null || raw === 0 ? null : raw / spec.freqDivisor,
  };
}

/** Address of channel `index` in a band's table. */
export function broadcastChannelAddress(band: D890BroadcastBand, index: number): number {
  return D890_BROADCAST[band].data + index * D890_BROADCAST[band].stride;
}

/** True when a slot holds nothing: no name and no decodable frequency. */
export function isVacantBroadcastChannel(ch: D890BroadcastChannel): boolean {
  return ch.name === '' && ch.frequency === null;
}
