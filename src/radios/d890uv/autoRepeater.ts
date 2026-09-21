/**
 * Auto-repeater offset frequencies.
 *
 * A flat table of 250 offsets the radio can apply automatically when a channel
 * falls in a repeater band. The CPS shows 250 slots and this table is exactly
 * 250 * 4 bytes.
 *
 * CONFIRMED ON HARDWARE 2026-09-03: setting the first two offsets to 5 MHz and
 * 0.6 MHz in the vendor CPS wrote
 *
 *     20 a1 07 00   -> u32 LE 500000  -> 5.0 MHz
 *     60 ea 00 00   -> u32 LE  60000  -> 0.6 MHz
 *
 * so the unit is **10 Hz**, little-endian, same as nothing else in this driver —
 * channel frequencies are BCD, and the roaming/GPS tables use their own scales.
 * Do not reuse a frequency helper here without checking its units.
 *
 * ⚠️ **What SELECTS a slot is not known.** An earlier note here claimed the
 * settings `autoRepeater1Uhf` / `autoRepeater1Vhf` were u8 indices into this
 * table. They are not: the CPS's Auto repeater tab shows both as Off/on-style
 * dropdowns, and the guess came only from `max: 255` next to a 250-slot table —
 * a coincidence, not evidence. Auto-repeater is a VFO feature there (Auto
 * Repeater A/B enable it per VFO, with min/max frequency windows per band), and
 * nothing on that tab obviously picks a slot.
 *
 * The slot NUMBER is still the record's identity, so gaps are kept and nothing
 * is renumbered — that part does not depend on knowing the consumer.
 */

import { D890_ADDR } from './constants';

/** 10 Hz per count — see the confirming bytes above. */
export const AUTO_REPEATER_UNIT_HZ = 10;

export const D890_AUTO_REPEATER = {
  ADDRESS: D890_ADDR.AUTO_REPEATER_DATA,
  /** 250 slots, 4 bytes each = 0x3e8. */
  SLOTS: 250,
  STRIDE: 4,
} as const;

/**
 * Decode the table to MHz.
 *
 * An all-0xFF or all-zero slot is "no offset" rather than 0 MHz, and comes back
 * as null so an unused slot cannot be mistaken for a deliberate zero.
 */
export function parseAutoRepeaterOffsets(bytes: Uint8Array): (number | null)[] {
  const out: (number | null)[] = [];
  for (let i = 0; i < D890_AUTO_REPEATER.SLOTS; i += 1) {
    const at = i * D890_AUTO_REPEATER.STRIDE;
    if (at + 3 >= bytes.length) break;
    const raw =
      ((bytes[at] ?? 0) |
        ((bytes[at + 1] ?? 0) << 8) |
        ((bytes[at + 2] ?? 0) << 16) |
        ((bytes[at + 3] ?? 0) << 24)) >>> 0;
    out.push(raw === 0 || raw === 0xffffffff ? null : (raw * AUTO_REPEATER_UNIT_HZ) / 1_000_000);
  }
  return out;
}

/** Encode back, patched so slots the caller does not supply keep their bytes. */
export function encodeAutoRepeaterOffsets(
  original: Uint8Array,
  offsets: readonly (number | null)[]
): Uint8Array {
  const out = Uint8Array.from(original);
  offsets.forEach((mhz, i) => {
    if (i >= D890_AUTO_REPEATER.SLOTS) return;
    const at = i * D890_AUTO_REPEATER.STRIDE;
    if (at + 3 >= out.length) return;
    // null means "no offset". Zero is what the radio holds for an unused slot,
    // so writing zero is how the field is cleared — 0xFFFFFFFF is only ever
    // seen on erased flash, never written by the vendor.
    const raw = mhz === null ? 0 : Math.round((mhz * 1_000_000) / AUTO_REPEATER_UNIT_HZ);
    out[at] = raw & 0xff;
    out[at + 1] = (raw >>> 8) & 0xff;
    out[at + 2] = (raw >>> 16) & 0xff;
    out[at + 3] = (raw >>> 24) & 0xff;
  });
  return out;
}
