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
   * CONFIRMED ON HARDWARE 2026-09-01 — the AM zone still lists its members when
   * read through this path. Found in the vendor CPS's capture first: request #2379
   * reads `01` here, and request #5206 then reads exactly 128 bytes at
   * 0x3888000 — one record, matching the single AM zone on the radio.
   */
  MASK: 0x3884400,
  STRIDE: 0x80,
  /** The CPS's AM Zone node shows 16 rows. */
  SLOTS: 16,
  NAME_BYTES: 0x20,
  /**
   * "A Channel" in the CPS's AM Zone table — an ABSOLUTE index into the AM
   * airband table. CONFIRMED ON HARDWARE 2026-09-03 by diffing a vendor CPS
   * write: this u16 went 0x06 -> 0x00 on zone 1 and 0x0d -> 0x00 on zone 2,
   * exactly matching the CPS showing "CZBB TWR" (index 0) for every zone.
   * There is no B channel — the CPS shows one column, unlike the main zone
   * table's A and B.
   */
  CURRENT_AT: 0x20,
  MEMBERS_AT: 0x22,
  /**
   * One past the last member byte — the list is 32 entries, NOT the 47 that
   * `(STRIDE - MEMBERS_AT) / 2` implies.
   *
   * CONFIRMED ON HARDWARE 2026-09-03. The vendor CPS fills 0xFF from the member
   * terminator up to 0x61 and then switches to 0x00 at 0x62, on every zone —
   * a boundary it would have no reason to draw if members ran to the end of the
   * record. Computing capacity from STRIDE let a zone with 32+ members write
   * into 0x62-0x7f, which the radio uses for something else.
   */
  MEMBERS_END: 0x62,
  /**
   * "A Channel" — a POSITION within the zone's own member list, one u16 per
   * zone slot. NOT in the zone record, and NOT an AM channel index.
   *
   * CONFIRMED ON HARDWARE 2026-09-03 from the vendor CPS's own write frames:
   * with A Channel set to CZBB A/D / CYVR APP / Air-Air 123.45 this table held
   * `05 00 06 00 0f 00` — positions 5, 6 and 15 in zones of 6, 7 and 16
   * members. Changing all three moved it to `03 00 04 00 0e 00`.
   *
   * The same convention the MAIN zone table uses for its A/B channels, which is
   * why `CURRENT_AT` inside the record — an absolute index — is a different
   * field entirely.
   */
  A_CHANNEL_TABLE: 0x3884600,
  A_CHANNEL_STRIDE: 2,
  /**
   * `AmChannelList_CH_Scan` — one u32 bitmap per zone, a bit per MEMBER
   * POSITION, set = included in scan.
   *
   * CONFIRMED ON HARDWARE 2026-09-03 from the same write capture:
   * `3f 00 00 00 | 7f 00 00 00 | ff ff 00 00` against zones of 6, 7 and 16
   * members — exactly 6, 7 and 16 bits set, matching the CPS's own "Zone
   * Channels" column.
   *
   * Per (zone, member), NOT per channel: one AM channel in two zones can be
   * scanned in one and not the other, which is why this cannot be a column on
   * the AM channel table the way FM's flat scan mask is.
   */
  SCAN_TABLE: 0x3884800,
  SCAN_STRIDE: 4,
  /**
   * 0x62-0x7f: thirty bytes we do not model. Zero in every record seen so far,
   * both before and after a vendor write. Not the AM scan list — a full read
   * diff across a vendor write found no scan field anywhere in the 156 KB this
   * driver reads, and the AM zone tails were zero throughout.
   */
  UNMODELLED_AT: 0x62,
} as const;

/** 0xFFFF ends the member list, exactly as in the main zone table. */
const NO_MEMBER = 0xffff;

export interface D890AmZone {
  index: number;
  name: string;
  /** AM channel indices, zero-based into the AM airband table. */
  members: number[];
  /**
   * Raw `CurWorkCH` — an ABSOLUTE index into the AM airband table.
   *
   * NOT a position within this zone's member list, which is how the main zone
   * table's A/B channels work. That difference was an open question until
   * hardware settled it on 2026-09-03: a radio whose AM channels occupied
   * indices 3-31, with three zones all carrying `currentChannel: 0`, displayed
   * "AM-001" — the leftover name in the deleted record at index 0. A position
   * would have selected the zone's first member and shown "CZBB TWR".
   *
   * So it must name a channel that actually exists AND belongs to this zone.
   * Pointing it at a deleted slot does not fail loudly; the radio shows
   * whatever bytes are still lying in that record.
   */
  currentChannel: number;
  /**
   * "A Channel" as the CPS shows it — an index into `members`, not into the AM
   * channel table. Undefined when its table was not read.
   */
  aChannel?: number;
  /**
   * Which members are included in scan, aligned to `members` by position.
   * Undefined when the scan table was not read.
   */
  scan?: boolean[];
}

/** Parse one 0x80-byte slot, or null when the slot is unused. */
export function parseAmZone(bytes: Uint8Array, index: number): D890AmZone | null {
  // An unused slot is erased flash. Checking the name is enough: a zone with no
  // name is not something the CPS can create.
  const name = decodeWideCharString(bytes.subarray(0, D890_AM_ZONES.NAME_BYTES), 16);
  if (!name) return null;

  const members: number[] = [];
  const membersEnd = Math.min(D890_AM_ZONES.MEMBERS_END, bytes.length);
  for (let at = D890_AM_ZONES.MEMBERS_AT; at + 1 < membersEnd; at += 2) {
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

/**
 * Decode the A Channel and scan tables onto zones already parsed from records.
 *
 * Both are indexed by ZONE SLOT and their values are MEMBER POSITIONS, so they
 * only mean anything alongside the zone whose members they refer to — hence
 * folding them in here rather than exposing two loose arrays.
 *
 * A value past the end of a zone's members is dropped rather than clamped: it
 * means the tables and the records disagree, and silently picking a different
 * channel would hide that.
 */
export function applyAmZoneTables(
  zones: readonly D890AmZone[],
  aChannelTable: Uint8Array | undefined,
  scanTable: Uint8Array | undefined
): D890AmZone[] {
  return zones.map((zone) => {
    const out: D890AmZone = { ...zone };
    const aAt = zone.index * D890_AM_ZONES.A_CHANNEL_STRIDE;
    if (aChannelTable && aAt + 1 < aChannelTable.length) {
      const pos = (aChannelTable[aAt] ?? 0) | ((aChannelTable[aAt + 1] ?? 0) << 8);
      if (pos < zone.members.length) out.aChannel = pos;
    }
    const sAt = zone.index * D890_AM_ZONES.SCAN_STRIDE;
    if (scanTable && sAt + 3 < scanTable.length) {
      const bits =
        ((scanTable[sAt] ?? 0) |
          ((scanTable[sAt + 1] ?? 0) << 8) |
          ((scanTable[sAt + 2] ?? 0) << 16) |
          ((scanTable[sAt + 3] ?? 0) << 24)) >>> 0;
      out.scan = zone.members.map((_, i) => ((bits >>> i) & 1) === 1);
    }
    return out;
  });
}

/** Encode the A Channel table — patched, so slots for zones we do not hold survive. */
export function encodeAmZoneAChannels(
  original: Uint8Array,
  zones: readonly D890AmZone[]
): Uint8Array {
  const out = Uint8Array.from(original);
  for (const zone of zones) {
    if (zone.aChannel === undefined) continue;
    const at = zone.index * D890_AM_ZONES.A_CHANNEL_STRIDE;
    if (at + 1 >= out.length) continue;
    out[at] = zone.aChannel & 0xff;
    out[at + 1] = (zone.aChannel >> 8) & 0xff;
  }
  return out;
}

/** Encode the per-zone scan bitmaps. Patched for the same reason. */
export function encodeAmZoneScan(
  original: Uint8Array,
  zones: readonly D890AmZone[]
): Uint8Array {
  const out = Uint8Array.from(original);
  for (const zone of zones) {
    if (!zone.scan) continue;
    const at = zone.index * D890_AM_ZONES.SCAN_STRIDE;
    if (at + 3 >= out.length) continue;
    // Only bits for positions this zone actually has. A bit above the member
    // count would claim a member that is not there.
    let bits = 0;
    zone.members.forEach((_, i) => {
      if (i < 32 && zone.scan?.[i]) bits |= 1 << i;
    });
    bits >>>= 0;
    out[at] = bits & 0xff;
    out[at + 1] = (bits >>> 8) & 0xff;
    out[at + 2] = (bits >>> 16) & 0xff;
    out[at + 3] = (bits >>> 24) & 0xff;
  }
  return out;
}
