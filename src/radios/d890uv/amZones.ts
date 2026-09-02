import { decodeWideCharString } from './structures';

/**
 * Zones over the AM airband table.
 *
 * A separate zone system from the main one, with its own numbering: an AM zone
 * holds AM channel indices, never channel numbers. Confirmed on hardware
 * 2026-08-31 against a radio with one zone set.
 *
 *   +0x00  name, UTF-16LE, NUL-terminated
 *   +0x20  u16 LE — current channel (see D890AmZone.currentChannel)
 *   +0x22  members, u16 LE each, 0xFFFF-terminated
 *
 * The dump that settled it read "AMZONETEST" with members 1 and 2, against an
 * AM table of AM-001 / TEST1 / TEST2 at indices 0/1/2 — and the radio's owner
 * confirmed the zone contains TEST1 and TEST2. That is what fixes +0x20 as a
 * separate field rather than a third member: reading members from +0x20 would
 * have produced three, including a channel the zone does not hold.
 */
export const D890_AM_ZONES = {
  ADDRESS: 0x3888000,
  /**
   * Presence mask, SET = PRESENT. Lives in the AM mask block at 0x3884xxx
   * rather than beside the zone records.
   *
   * CONFIRMED 2026-09-01 from the vendor CPS's serial capture: request #2379
   * reads `01` here, and request #5206 then reads exactly 128 bytes at
   * 0x3888000 — one record, matching the single AM zone on the radio.
   */
  MASK: 0x3884400,
  STRIDE: 0x80,
  /** The CPS's AM Zone node shows 16 rows. */
  SLOTS: 16,
  NAME_BYTES: 0x20,
  CURRENT_AT: 0x20,
  MEMBERS_AT: 0x22,
} as const;

/** 0xFFFF ends the member list, exactly as in the main zone table. */
const NO_MEMBER = 0xffff;

export interface D890AmZone {
  index: number;
  name: string;
  /** AM channel indices, zero-based into the AM airband table. */
  members: number[];
  /**
   * Raw `CurWorkCH`. Stored as the radio stores it and NOT resolved here.
   *
   * The main zone table's A/B channels are POSITIONS within that zone's member
   * list rather than channel numbers, and this field sits in the same place in
   * an analogous record — but that has not been confirmed for AM zones, and
   * guessing wrong would name the wrong channel. The caller decides.
   */
  currentChannel: number;
}

/** Parse one 0x80-byte slot, or null when the slot is unused. */
export function parseAmZone(bytes: Uint8Array, index: number): D890AmZone | null {
  // An unused slot is erased flash. Checking the name is enough: a zone with no
  // name is not something the CPS can create.
  const name = decodeWideCharString(bytes.subarray(0, D890_AM_ZONES.NAME_BYTES), 16);
  if (!name) return null;

  const members: number[] = [];
  for (let at = D890_AM_ZONES.MEMBERS_AT; at + 1 < bytes.length; at += 2) {
    const value = (bytes[at] ?? 0) | ((bytes[at + 1] ?? 0) << 8);
    if (value === NO_MEMBER) break;
    members.push(value);
  }

  return {
    index,
    name,
    members,
    currentChannel: (bytes[D890_AM_ZONES.CURRENT_AT] ?? 0)
      | ((bytes[D890_AM_ZONES.CURRENT_AT + 1] ?? 0) << 8),
  };
}

/**
 * Parse a whole contiguous table dump, dropping unused slots.
 *
 * NOT the live read path any more — that asks the presence mask at
 * `D890_AM_ZONES.MASK` and fetches only the slots it names, so it never has a
 * full-table buffer to hand. This stays for the inputs that ARE contiguous: a
 * region dump from Diagnostics, and anything a write path has to reason about
 * as a whole table.
 */
export function parseAmZoneTable(bytes: Uint8Array): D890AmZone[] {
  const out: D890AmZone[] = [];
  for (let i = 0; i < D890_AM_ZONES.SLOTS; i += 1) {
    const start = i * D890_AM_ZONES.STRIDE;
    if (start + D890_AM_ZONES.STRIDE > bytes.length) break;
    const zone = parseAmZone(bytes.subarray(start, start + D890_AM_ZONES.STRIDE), i);
    if (zone) out.push(zone);
  }
  return out;
}
