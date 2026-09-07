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
   * ⚠️ A BOUND FROM THE LAYOUT, NOT A CONFIRMED CAPACITY. Slots start at
   * 0x3700100 and the next known table begins at 0x3701000, which leaves room
   * for 60. The vendor CPS's own limit was never observed — the sweep covered
   * the Optional Setting dialog only, and the Hot Key node is not in it. Only
   * three slots have ever been seen in use.
   */
  MAX_SLOTS: (0x1000 - 0x100) / 0x40,
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
export function parseStatusMessages(region: Uint8Array): { slot: number; text: string }[] {
  return occupiedStatusSlots(region).map((slot) => ({
    slot,
    text: parseStatusMessage(region, slot),
  }));
}
