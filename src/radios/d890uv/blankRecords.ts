/**
 * What a NEW record starts from, when the radio has never held one.
 *
 * Every encoder here patches the bytes the radio gave us, which works for an
 * edit and has nothing to say about an ADD: the read is mask-first, so an
 * unoccupied slot is never fetched and there is no original to patch. Until
 * 2026-09-03 that surfaced as `Refusing to write ... it was never read from the
 * radio` on any newly added channel — the rule working exactly as designed, on
 * a case it cannot serve.
 *
 * These templates come from the vendor's own write capture (`WriteTo7x2.txt`,
 * 8,389 frames), not from a guess. Two things that capture settles:
 *
 *   1. **The vendor never writes a blank slot.** 107 of 128 channel slots,
 *      sparse; 8 of 8 zones; 1 of 1 AM and FM. It writes occupied slots only.
 *      So there is no "vendor blank" to copy — a new record is BUILT, and these
 *      are the baselines it is built on.
 *   2. **The fill byte is not the same for every table**, which is why this is a
 *      per-record constant rather than one shared `new Uint8Array(n)`.
 *
 * A blank is only ever the STARTING point: the caller applies its encoder on
 * top, so every field the driver models is set from the user's data. What these
 * define is what lands in the bytes nobody sets.
 */

import { D890_ADDR, D890_LIMITS } from './constants';
import { D890_BROADCAST } from './broadcastChannels';
import { D890_AM_ZONES } from './amZones';

const filled = (size: number, value: number) => new Uint8Array(size).fill(value);

/**
 * AM airband / FM broadcast channel — all zeros.
 *
 * HARDWARE-DERIVED. The vendor's AM slot 0 reads:
 *   `10 80 00 00 | 41 00 4d 00 2d 00 30 00 30 00 31 00 | 00 … 00`
 * BCD frequency at 0x00, UTF-16LE name at 0x04, and **every remaining byte to
 * 0x3f is zero**. FM slot 0 is identical in shape. There is no third field, so
 * this record is fully accounted for: frequency + name + zeros.
 */
export const blankBroadcastChannel = (band: 'am' | 'fm'): Uint8Array =>
  filled(D890_BROADCAST[band].stride, 0x00);

/**
 * Zone membership — all 0xFF.
 *
 * HARDWARE-DERIVED, and deliberately NOT zeros. The vendor's zone 0 membership
 * record reads `00 00 | ff ff | ff … ff` for its full 0x200: one u16 member,
 * the 0xFFFF terminator, then 0xFF to the end. Zero-filling instead would leave
 * a list of channel index 0 repeated 254 times behind the terminator — harmless
 * only while the terminator is believed, which is not a bet worth taking on a
 * record the radio walks.
 *
 * An empty new zone is therefore just the terminator, which this already is.
 */
export const blankZoneMembers = (): Uint8Array =>
  filled(D890_ADDR.ZONE_CHANNELS_STRIDE, 0xff);

/**
 * Zone name — zeros, and only as wide as the vendor writes.
 *
 * HARDWARE-DERIVED. The vendor sends just the FIRST 0x20 of the 0x40 name
 * record (`5a 00 31 00 …` then zero padding) and never writes 0x20-0x3f at all.
 * `ZONE_NAME_WRITE_BYTES` already encodes that width for edits; this matches it
 * so an added zone writes exactly what an edited one does.
 */
export const blankZoneName = (): Uint8Array =>
  filled(D890_LIMITS.NAME_MAX_CHARS * 2, 0x00);

/**
 * AM zone — zeros, with the member terminator set.
 *
 * The 0x80 record is fully accounted for by the layout: name at 0x00-0x1f,
 * current channel at 0x20-0x21, members from 0x22 to the end. Nothing is left
 * over, which is why this one can be built with confidence even though the
 * vendor capture contains no AM zone write to copy.
 *
 * The terminator is explicit rather than implied by the fill: members are
 * 0xFFFF-terminated but the name and current-channel fields are zero-based, so
 * neither a 0x00 nor a 0xFF fill is right for the whole record.
 */
export const blankAmZone = (): Uint8Array => {
  const out = filled(D890_AM_ZONES.STRIDE, 0x00);
  // 0xFF across the whole member area, matching what the vendor CPS writes —
  // confirmed by diffing a real vendor write on 2026-09-03. Above MEMBERS_END
  // it stays zero, which is also what the vendor leaves there.
  for (let i = D890_AM_ZONES.MEMBERS_AT; i < D890_AM_ZONES.MEMBERS_END; i += 1) out[i] = 0xff;
  return out;
};

/**
 * The main channel record has NO blank template, on purpose.
 *
 * Roughly 40% of its 0x80 bytes are not decoded by this driver, and unlike
 * every record above, the vendor capture cannot supply them: it writes only
 * occupied slots, so no capture anywhere contains an unused channel record.
 * Building one from zeros would set ~50 bytes of unknown meaning to a value
 * nothing has ever observed on this radio.
 *
 * The evidence needed is a diagnostic dump of a never-used slot — e.g. channel
 * 201 at 0x1082400. Until then, adding a channel is refused rather than guessed.
 * See `DA7X2-NEEDS-CONFIRMING.md`.
 */
export const CHANNEL_BLANK_IS_UNKNOWN = true;
