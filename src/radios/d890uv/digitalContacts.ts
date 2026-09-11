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
   * The database header — count and end pointer — at its own address, well
   * below the banks.
   *
   * FOUND 2026-09-07 in `7x2_read_contacts.txt`. Of 85 read runs in that
   * capture, only two are outside the banks, and the CPS issues both BEFORE it
   * starts walking: 0x04f80020 (16 bytes, all 0xFF) and this one.
   *
   * This is what makes a write tractable. Without it, "how does the radio know
   * how many contacts there are" had no answer, and removing contacts would
   * have meant blanking 16 MB of trailing banks.
   */
  HEADER: 0x07000000,
  HEADER_SIZE: 16,
  /**
   * First bank. The CPS walks 83 of these at 0x80000 stride, reading 200,000
   * bytes of each — 16.4 MB over about a million frames, which is why this is
   * never part of a codeplug read.
   */
  /**
   * The record INDEX: one 8-byte `(key, offset)` entry per contact, ascending
   * by key, BANKED like the records.
   *
   * FOUND 2026-09-10 in the vendor's 1,005-contact upload — the region nothing
   * knew about; without it the records are on the radio and unreachable. Its
   * LAYOUT at scale came from the 500,000-contact upload the same night: 256,000
   * bytes (32,000 entries) at the start of every 0x80000, 16 banks for 500,000.
   * That keeps each bank below the flash-management marker at 0x3fbf0 of its
   * 0x40000 unit — an unbanked index runs into it after 32,637 entries.
   *
   * `key = bcdAsHex(dmrId) << 1`; `offset` is the record's position in the whole
   * record stream. See `digitalContactWrite.ts`.
   */
  INDEX: 0x07080000,
  INDEX_BANK_BYTES: 256000,
  INDEX_BANK_ENTRIES: 32000,
  INDEX_BANK_STRIDE: 0x80000,
  /** Index banks the vendor used for 500,000 contacts — room for 512,000. */
  INDEX_BANKS: 16,
  BASE: 0x07900000,
  BANK_STRIDE: 0x80000,
  /** Bytes of each bank that actually hold records. */
  BANK_BYTES: 200000,
  /**
   * Record banks this driver will write: the furthest ANY write has reached.
   *
   * The vendor's own 500,000-contact upload on 2026-09-10 put its header's end
   * address in bank 277, so the region runs at least that far. Where it stops
   * beyond is unknown, and a write past it would be guessing an address. (This
   * was 83 — where the 163,467-contact reference database happened to end — and
   * the read probed exactly that many, so a larger database would have been
   * read short. The read now takes its extent from the header.)
   */
  RECORD_BANKS_MAX: 278,
  /**
   * The radio's rated capacity, 500,000 contacts.
   *
   * A UI bound only. The database is limited by BYTES — records are variable
   * length — so there is no fixed record count, and
   * `planDigitalContactWrite` is the authority.
   *
   * This exists because `getRadioInfo` reported `TALK_GROUPS_MAX` (10,000)
   * here, the limit of an entirely different table, and the Contacts tab
   * slices a download to it: a full RadioID download would have been cut to a
   * sixteenth of itself, silently, before a byte was planned.
   */
  MAX_CONTACTS: 500000,
} as const;

/**
 * The 8 bytes at +0x08, and what they are not.
 *
 * One sample exists — `00 00 00 00 00 00 00 00`, alongside count 163,467 and
 * end pointer 0x0a201e1c — so nothing here is settled. What CAN be said is
 * which meanings are excluded, because every quantity this database could
 * plausibly describe is nonzero in that same sample:
 *
 *   byte length of the records   16,407,708   not zero -> not here
 *   friends flagged (0x1000)              2   not zero -> not here
 *   populated bank count                 83   not zero -> not here
 *   base / tail / span addresses    various   not zero -> not here
 *
 * So it is not a length, and not a friend count — the two most natural guesses.
 *
 * MOST LIKELY: padding forced by the frame size. This radio's writes are always
 * 16-byte payloads and are never negotiated (see writeDryRun.ts), so an 8-byte
 * header cannot be written at all — the smallest thing anyone can put at this
 * address is one 16-byte frame. Two u32 fields plus 8 bytes of slack is exactly
 * what that constraint produces, and the CPS read exactly 16 bytes here.
 *
 * STILL OPEN, and the only structurally tidy alternative: a SECOND
 * (count, endAddress) pair for a second database that is currently empty. That
 * would read all-zero for the same reason a blank contact header does.
 *
 * SETTLED 2026-09-10 — PADDING. The test this note set for itself has been
 * run: a vendor CPS upload of 1,005 contacts wrote count 1,005 and end pointer
 * 0x079171de here, and left the second 8 bytes ZERO. Two databases differing by
 * two orders of magnitude, both zero, so it is not a second (count, endAddress)
 * pair and not any quantity that scales with the list.
 */
export interface D890ContactHeader {
  /** Number of records in the database. */
  count: number;
  /** Address one past the last record — NOT a length. */
  endAddress: number;
}

/**
 * Parse the 16-byte header at `D890_DIGITAL_CONTACTS.HEADER`.
 *
 * Both fields are u32 LE. CONFIRMED twice over from one capture: the count read
 * 163,467, which is exactly the number of records our own walker finds in the
 * same capture; and the end pointer 0x0a201e1c predicts the CPS's final read
 * length to the byte — it fetched ceil(7708/16)*16 = 7712 bytes of the tail
 * bank, stopping at the pointer rounded up to a frame boundary. The last bytes
 * before it are `S t a t e s \0`, the Country field of the final record.
 */
export function parseDigitalContactHeader(bytes: Uint8Array): D890ContactHeader | null {
  if (bytes.length < 8) return null;
  const u32 = (at: number) =>
    ((bytes[at] ?? 0) |
      ((bytes[at + 1] ?? 0) << 8) |
      ((bytes[at + 2] ?? 0) << 16) |
      ((bytes[at + 3] ?? 0) << 24)) >>> 0;
  const count = u32(0);
  const endAddress = u32(4);
  // An erased or absent header is not a database of 4 billion contacts.
  if (count === 0xffffffff || endAddress === 0xffffffff) return null;
  if (endAddress !== 0 && endAddress < D890_DIGITAL_CONTACTS.BASE) return null;
  return { count, endAddress };
}

/**
 * Build the 16-byte header, patching the original so the 8 bytes past the two
 * known fields stay the radio's own.
 *
 * ⚠️ NOTHING HAS EVER WRITTEN THIS BLOCK. The header was recovered from a READ
 * capture, which evidences the read and nothing else — never-write and
 * never-read are separate claims. That a contact write would need these two
 * fields updated is inference from how the CPS *reads* them, not evidence that
 * writing them is safe or sufficient. A write capture of the vendor CPS
 * uploading a contact list is what would settle it.
 */
export function encodeDigitalContactHeader(
  original: Uint8Array,
  header: D890ContactHeader
): Uint8Array {
  const out = Uint8Array.from(
    original.length >= D890_DIGITAL_CONTACTS.HEADER_SIZE
      ? original
      : new Uint8Array(D890_DIGITAL_CONTACTS.HEADER_SIZE)
  );
  const put = (at: number, value: number) => {
    out[at] = value & 0xff;
    out[at + 1] = (value >>> 8) & 0xff;
    out[at + 2] = (value >>> 16) & 0xff;
    out[at + 3] = (value >>> 24) & 0xff;
  };
  put(0, header.count);
  put(4, header.endAddress);
  return out;
}

/**
 * Maximum characters per field. **EXCEEDING ONE CORRUPTS THE RECORD.**
 *
 * MEASURED THE HARD WAY 2026-09-10. These were first dismissed as a CPS
 * CSV-import quirk, because the vendor cut `city` to 15 on import while this
 * radio's own database holds a 16-character province — so the writer was built
 * NOT to truncate. Writing 200 contacts with a 16-character city then produced
 * a database the CPS read as 137 entries with fields sliding into the wrong
 * columns: `"Playa Del Carmen"` came back as `"Playa Del Carme"` and the
 * leftover `n` started the next field, shifting the rest of the record.
 *
 * So the reader takes AT MOST this many characters and then continues from
 * there rather than from the NUL — a field that overruns does not merely get
 * clipped, it desynchronises everything after it.
 *
 * The values are what a real radio database actually contains, across 3,827
 * records sampled from two banks 16 MB apart. `name`, `city` and `province`
 * show the pile-up at a ceiling that truncation produces — 29 records at
 * exactly 16, 199 at exactly 15, 32 at exactly 16 — so those three are the
 * format's limits and not an accident of the data.
 *
 * ⚠️ `callSign` and `country` show NO such pile-up: their longest observed
 * values are 13 and 14, which are floors rather than proven ceilings. They are
 * capped there because every limit here should be a length the radio is known
 * to store. Raise them if a longer one is ever read off a radio — a clipped
 * country name is recoverable, a desynchronised database is not.
 */
export const D890_CONTACT_FIELD_MAX = {
  name: 16,
  city: 15,
  callSign: 13,
  province: 16,
  country: 14,
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
/**
 * The bytes of one contact record, exactly as the radio stores them.
 *
 * MEASURED 2026-09-10 against the vendor's own contact download: a record is
 * the leading u16, four BCD bytes, and **SIX** NUL-terminated UTF-16LE strings
 * — not five. The sixth is empty in all 1,906 records sampled across the first
 * 256 KB, which is why the parser reads five and the walker then steps over
 * "padding" it never explained. It was never padding: it is a field, always
 * blank, and a record that omits it is two bytes short and puts every record
 * after it out of alignment.
 *
 * `flags` carries the bits this driver does not model, so it is preserved
 * rather than rebuilt; only the MyFriend bit is taken from the model, so
 * toggling that in a UI actually reaches the wire.
 *
 * The ID re-encodes exactly despite being parsed to a number: four BCD bytes
 * hold eight digits, and zero-padding to eight restores the leading zeros that
 * `30233` lost. DMR IDs genuinely vary in length after their country prefix.
 */
export function encodeDigitalContact(contact: D890DigitalContact): Uint8Array {
  // Truncated, NOT because it is tidy but because the reader stops at the limit
  // and carries on from there — an overrun field shifts every field after it.
  // See `D890_CONTACT_FIELD_MAX`.
  const cut = (value: string, max: number) => (value ?? '').slice(0, max);
  const strings = [
    cut(contact.name, D890_CONTACT_FIELD_MAX.name),
    cut(contact.city, D890_CONTACT_FIELD_MAX.city),
    cut(contact.callSign, D890_CONTACT_FIELD_MAX.callSign),
    cut(contact.province, D890_CONTACT_FIELD_MAX.province),
    cut(contact.country, D890_CONTACT_FIELD_MAX.country),
    // The always-blank sixth field. See above — omitting it corrupts the bank.
    '',
  ];
  let size = 6;
  for (const str of strings) size += str.length * 2 + 2;

  const out = new Uint8Array(size);
  const flags = contact.isFriend
    ? contact.flags | D890_CONTACT_FRIEND_FLAG
    : contact.flags & ~D890_CONTACT_FRIEND_FLAG & 0xffff;
  out[0] = flags & 0xff;
  out[1] = (flags >> 8) & 0xff;

  const digits = String(Math.trunc(contact.dmrId)).padStart(8, '0');
  if (digits.length > 8) {
    throw new Error(
      `DMR ID ${contact.dmrId} needs ${digits.length} digits; the record holds 8`
    );
  }
  for (let i = 0; i < 4; i += 1) {
    out[2 + i] = (Number(digits[i * 2]) << 4) | Number(digits[i * 2 + 1]);
  }

  let at = 6;
  for (const str of strings) {
    for (let i = 0; i < str.length; i += 1) {
      const unit = str.charCodeAt(i);
      out[at] = unit & 0xff;
      out[at + 1] = (unit >> 8) & 0xff;
      at += 2;
    }
    at += 2; // NUL terminator, already zero
  }
  return out;
}

/** Every record back to back, the way a bank stores them. */
export function encodeDigitalContactBank(contacts: readonly D890DigitalContact[]): Uint8Array {
  const parts = contacts.map(encodeDigitalContact);
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

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
