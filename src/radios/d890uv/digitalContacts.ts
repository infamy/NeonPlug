/**
 * The DMR contact database — what the CPS calls the Digital Contact List, and
 * the source of its Friends List.
 *
 * Format recovered 2026-08-31 from a serial capture of the vendor CPS reading
 * its own contact list, cross-checked against static analysis of the CPS:
 *
 *   [flags u16 LE][DMR ID: 4 bytes BCD][Name\0][City\0][Callsign\0][Prov\0][Country\0]
 *
 * Records are PACKED and VARIABLE LENGTH — the strings are NUL-terminated, not
 * fixed-width — so a record is only reachable by walking forward from the start
 * of a bank. There is no stride and no index to seek with.
 *
 * THE FRIENDS LIST IS NOT A SEPARATE TABLE. `MyFriend` is bit 0x1000 of the
 * leading u16, and the CPS's Friends List node is a filtered view of this same
 * database. Confirmed by counting: of 163,467 records in the captured database,
 * exactly two carry the bit, and they are exactly the two the radio's owner sees
 * in that node.
 */

/** Bit 0x1000 of a record's leading u16 — the vendor's `MyFriend` column. */
export const D890_CONTACT_FRIEND_FLAG = 0x1000;

export const D890_DIGITAL_CONTACTS = {
  /**
   * First bank. The CPS walks 83 of these at 0x80000 stride, reading 200,000
   * bytes of each — 16.4 MB over about a million frames, which is why this is
   * never part of a codeplug read.
   */
  BASE: 0x07900000,
  BANK_STRIDE: 0x80000,
  /** Bytes of each bank that actually hold records. */
  BANK_BYTES: 200000,
  BANKS: 83,
} as const;

export interface D890DigitalContact {
  /** DMR ID. Not fixed-width: 30233 and 3027042 are both real, both valid. */
  dmrId: number;
  name: string;
  city: string;
  callSign: string;
  province: string;
  country: string;
  /** The vendor's MyFriend flag — this contact is in the Friends List. */
  isFriend: boolean;
  /** Raw leading u16, kept so a writer can preserve bits we do not model. */
  flags: number;
}

/** Read a NUL-terminated UTF-16LE string. Returns null if it is not one. */
function readString(bytes: Uint8Array, start: number): { value: string; next: number } | null {
  let out = '';
  let i = start;
  while (i + 1 < bytes.length) {
    const unit = (bytes[i] ?? 0) | ((bytes[i + 1] ?? 0) << 8);
    i += 2;
    if (unit === 0) return { value: out, next: i };
    // Latin plus Latin Extended-A covers every name seen in the database.
    // Anything else means we are not aligned on a real string.
    if (unit < 0x20 || unit > 0x24f) return null;
    out += String.fromCharCode(unit);
  }
  return null;
}

/** Four BCD bytes as one decimal number, leading zeros stripped. */
function decodeBcdId(bytes: Uint8Array, start: number): number | null {
  let value = 0;
  for (let i = 0; i < 4; i += 1) {
    const byte = bytes[start + i] ?? 0;
    const high = byte >> 4;
    const low = byte & 0x0f;
    if (high > 9 || low > 9) return null;
    value = value * 100 + high * 10 + low;
  }
  return value;
}

/**
 * Parse one record at `offset`, or null if nothing valid starts there.
 *
 * Requires a name AND a callsign: a record with neither is not a contact, and
 * accepting one would let the walker latch onto padding and drift out of
 * alignment for the rest of the bank.
 */
export function parseDigitalContact(
  bytes: Uint8Array,
  offset: number
): { contact: D890DigitalContact; next: number } | null {
  const flags = (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8);
  const dmrId = decodeBcdId(bytes, offset + 2);
  if (dmrId === null) return null;

  let cursor = offset + 6;
  const fields: string[] = [];
  for (let i = 0; i < 5; i += 1) {
    const read = readString(bytes, cursor);
    if (!read) return null;
    fields.push(read.value);
    cursor = read.next;
  }
  const [name, city, callSign, province, country] = fields;
  if (!name || !callSign) return null;

  return {
    contact: {
      dmrId,
      name,
      city,
      callSign,
      province,
      country,
      isFriend: (flags & D890_CONTACT_FRIEND_FLAG) !== 0,
      flags,
    },
    next: cursor,
  };
}

/**
 * Walk a bank, returning every record it holds.
 *
 * Advances two bytes at a time when a record does not parse — the strings are
 * UTF-16 and every record seen starts on an even offset, so odd positions are
 * never record starts and stepping by one only invites CJK-looking garbage.
 */
export function parseDigitalContactBank(bytes: Uint8Array): D890DigitalContact[] {
  const out: D890DigitalContact[] = [];
  let offset = 0;
  while (offset < bytes.length - 12) {
    const parsed = parseDigitalContact(bytes, offset);
    if (parsed) {
      out.push(parsed.contact);
      offset = parsed.next + (parsed.next % 2);
      // Skip the zero padding between records.
      while (offset < bytes.length - 12 && bytes[offset] === 0 && bytes[offset + 1] === 0
             && bytes[offset + 2] === 0 && bytes[offset + 3] === 0) {
        offset += 2;
      }
    } else {
      offset += 2;
    }
  }
  return out;
}

/** True when a bank holds nothing — the signal to stop reading further banks. */
export function isEmptyContactBank(bytes: Uint8Array): boolean {
  return bytes.every((b) => b === 0x00 || b === 0xff);
}
