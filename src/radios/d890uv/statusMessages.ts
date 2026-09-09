/**
 * Hot-key status messages — the canned texts the radio can send from a key.
 *
 * DECODED 2026-09-07 offline, by diffing two serial captures taken either side
 * of a deliberate CPS edit (`7x2_missingdataread.txt` ->
 * `7x2_missingdataread_after.txt`). No new hardware time was needed: the region
 * was already being fetched by the preserve pass, so the bytes were sitting in
 * captures we had.
 *
 * Layout, all within the region at 0x3700000:
 *
 *   0x3700100 + slot*0x40   UTF-16LE, NUL-terminated, up to 32 characters
 *   0x3701500               presence bitmask, bit N = slot N holds a message
 *
 * The mask is what makes this certain rather than plausible. Before the edit it
 * read 0x01 with slot 0 holding "Status Message 1"; after two messages were
 * added it read 0x07 with slots 0, 1 and 2 holding text. Bits and occupied
 * slots agreed exactly in both captures, which a coincidence of layout would
 * not produce.
 */

export const D890_STATUS_MESSAGES = {
  /** First slot. The 0x100 bytes below it are a separate, unidentified table. */
  BASE: 0x3700100,
  STRIDE: 0x40,
  /**
   * 32 UTF-16 units, and a full slot carries NO terminator.
   *
   * Proven by the capture: "There is also a Status Message 1" is exactly 32
   * characters and fills 0x3700180..0x37001bf to the last byte, with slot 3
   * starting immediately after. Reserving a NUL and reading 31 would silently
   * clip the last character of every full message.
   */
  MAX_CHARS: 32,
  /** Bit per slot; bit N is slot N. */
  MASK: 0x3701500,
  /**
   * 32, MEASURED from the vendor CPS grid 2026-09-08 (Hot Key dialog ->
   * State Information tab).
   *
   * This was 60 until then — a bound derived from the layout, since slots start
   * at 0x3700100 and the next known table begins at 0x3701000. The address space
   * genuinely has room for 60; the radio only offers 32. A layout bound is an
   * upper limit, never a capacity, and reading 60 would have walked 28 slots of
   * whatever follows the real table.
   */
  MAX_SLOTS: 32,
} as const;

/** Offset of a slot within a buffer that starts at the region base 0x3700000. */
export function statusMessageOffset(slot: number): number {
  return D890_STATUS_MESSAGES.BASE - 0x3700000 + slot * D890_STATUS_MESSAGES.STRIDE;
}

/** Decode one slot's text. Empty string when the slot holds nothing. */
export function parseStatusMessage(region: Uint8Array, slot: number): string {
  const at = statusMessageOffset(slot);
  let out = '';
  for (let i = 0; i < D890_STATUS_MESSAGES.STRIDE - 1; i += 2) {
    const unit = (region[at + i] ?? 0) | ((region[at + i + 1] ?? 0) << 8);
    // 0xFFFF is erased flash, 0x0000 the terminator; neither is a character.
    if (unit === 0 || unit === 0xffff) break;
    out += String.fromCharCode(unit);
  }
  return out;
}

/** Which slots the presence mask says are in use. */
export function occupiedStatusSlots(region: Uint8Array): number[] {
  const base = D890_STATUS_MESSAGES.MASK - 0x3700000;
  const out: number[] = [];
  for (let slot = 0; slot < D890_STATUS_MESSAGES.MAX_SLOTS; slot += 1) {
    const byte = region[base + (slot >> 3)] ?? 0;
    // An all-0xFF mask is erased flash, not 60 messages.
    if (byte === 0xff) continue;
    if (byte >> (slot & 7) & 1) out.push(slot);
  }
  return out;
}

/**
 * Every status message the radio holds.
 *
 * Driven by the MASK, not by "does the slot have text". They agreed in both
 * captures, but the mask is what the radio consults — a slot with stale text
 * and a clear bit is not a message.
 */
export interface D890StatusMessage {
  /** Slot index. Stable — the mask addresses slots, and nothing compacts them. */
  slot: number;
  text: string;
}

export function parseStatusMessages(region: Uint8Array): D890StatusMessage[] {
  return occupiedStatusSlots(region).map((slot) => ({
    slot,
    text: parseStatusMessage(region, slot),
  }));
}

/**
 * Write one slot's text and set its presence bit, patching the region.
 *
 * PATCHES, never rebuilds: everything outside the slot and its mask bit is the
 * radio's own bytes. That matters more here than usual — the 0x1530 region also
 * holds the hot keys, so building it would destroy all 18 of them.
 *
 * A full slot carries NO terminator. "There is also a Status Message 1" is
 * exactly 32 characters and fills its 0x40 to the last byte, so reserving a NUL
 * would silently clip the last character of every full message.
 */
export function encodeStatusMessage(
  region: Uint8Array,
  slot: number,
  text: string
): Uint8Array {
  if (slot < 0 || slot >= D890_STATUS_MESSAGES.MAX_SLOTS) {
    throw new Error(
      `Status message slot ${slot} is outside 0..${D890_STATUS_MESSAGES.MAX_SLOTS - 1}`
    );
  }
  const out = Uint8Array.from(region);
  const at = statusMessageOffset(slot);
  if (at + D890_STATUS_MESSAGES.STRIDE > out.length) {
    throw new Error('Status message region is shorter than the slot it must hold');
  }

  const clipped = Array.from(text).slice(0, D890_STATUS_MESSAGES.MAX_CHARS);
  out.fill(0, at, at + D890_STATUS_MESSAGES.STRIDE);
  clipped.forEach((ch, i) => {
    const code = ch.charCodeAt(0);
    out[at + i * 2] = code & 0xff;
    out[at + i * 2 + 1] = (code >> 8) & 0xff;
  });

  // The mask is what the radio consults, so it has to move with the text.
  const maskAt = D890_STATUS_MESSAGES.MASK - 0x3700000 + (slot >> 3);
  const bit = 1 << (slot & 7);
  // An erased mask byte is 0xFF; setting a bit in it would mark 8 slots present.
  const current = out[maskAt] === 0xff ? 0 : (out[maskAt] ?? 0);
  out[maskAt] = clipped.length > 0 ? current | bit : current & ~bit & 0xff;
  return out;
}
