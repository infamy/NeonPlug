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

/**
 * Scan list — a 0x200 record with the vendor's own defaults for the fields the
 * shared model cannot describe.
 *
 * HARDWARE-DERIVED, and confirmed twice from independent codeplugs. A new scan
 * list was created in the vendor CPS on 2026-09-10 and written to the radio
 * (`7x2_slreadaddwrite.txt`); its record is byte-for-byte:
 *
 *   0x00: 00 03 ff ff ff ff 05 00 1a 00 1f 00 20 00 <name…>
 *   0x30: <members…> ff ff ff … ff
 *   0x94: 04 00 00 00 00 … 00
 *
 * The same values appear in `SL Alpha`, the untouched list present in the very
 * first reads of this radio — which is what those numbers always were, though
 * they were mistaken for a deliberate sweep until this capture named them.
 *
 * Four of these could not be derived any other way, and are the reason adding a
 * scan list was refused until now: look-back A (5) and B (26), dropout delay
 * (31) and revert channel (4). Zero is NOT a safe stand-in for any of them —
 * they are timers in deciseconds, and a 0-decisecond look-back is not a setting
 * the radio offers.
 *
 * Two more are worth stating because they are counter-intuitive:
 *
 *   - **Both priority channels default to 0xffff (Off), while `prioritySelect`
 *     defaults to 3.** Whatever byte 0x01 means, it is NOT a pair of "this
 *     priority is in use" bits — the vendor's own default sets it to 3 with
 *     both priorities off. It is carried here verbatim and never derived.
 *   - **The member array is 0xFF-filled**, unlike the zero tail from 0x98. The
 *     encoder writes members plus one terminator and leaves the rest, so the
 *     fill is what a short list's unused entries end up holding.
 */
export function blankScanList(): Uint8Array {
  const rec = new Uint8Array(D890_ADDR.SCAN_LIST_STRIDE);
  const u16 = (at: number, v: number) => {
    rec[at] = v & 0xff;
    rec[at + 1] = (v >> 8) & 0xff;
  };
  rec[0x00] = 0x00; // scan mode
  rec[0x01] = 0x03; // prioritySelect — the vendor's default, meaning unknown
  u16(0x02, 0xffff); // priority channel 1: Off
  u16(0x04, 0xffff); // priority channel 2: Off
  u16(0x06, 5); // look-back time A, deciseconds
  u16(0x08, 26); // look-back time B
  u16(0x0a, 31); // dropout delay
  u16(0x0c, 32); // dwell time
  // 0x0e-0x2d name, 0x2e-0x2f zero: left as the zeros above.
  rec.fill(0xff, 0x30, 0x94); // member array: 50 u16, all "empty"
  rec[0x94] = 4; // revert channel
  // 0x95-0x97 holds and 0x98-0x1ff are zero on every record ever captured.
  return rec;
}

/**
 * The same defaults as `blankScanList`, in decoded form.
 *
 * `blankScanList` is the bytes an ADD is built on; this is what the write input
 * hands the encoder for the fields the shared `ScanList` cannot carry. They are
 * one capture, expressed twice, so they must not drift — `blankScanList` is the
 * authority and the round-trip test pins them together.
 */
export const D890_SCAN_LIST_DEFAULTS = {
  scanMode: 0,
  prioritySelect: 3,
  priorityChannel1Raw: 0xffff,
  priorityChannel2Raw: 0xffff,
  lookBackTimeA: 5,
  lookBackTimeB: 26,
  dropoutDelay: 31,
  dwellTime: 32,
  revertChannel: 4,
  digitalGroupHold: 0,
  digitalPriorityHold: 0,
  analogHold: 0,
} as const;
