/**
 * The analog (DTMF) address book — named DTMF numbers.
 *
 * DECODED 2026-09-07 offline from the same before/after capture pair as
 * `statusMessages.ts`, by adding one entry in the vendor CPS and diffing.
 *
 *   0x3801000 + slot*0x40   the records
 *   0x3800000 + slot        a byte per slot, NOT a bitmask (see below)
 *
 * Record layout, from two real records:
 *
 *   +0x00  4 bytes   DTMF digits, packed BCD, high nibble first
 *   +0x04  3 bytes   zero in both samples, meaning unknown
 *   +0x07  1 byte    how many of those digits are real
 *   +0x08  UTF-16LE  name, NUL-terminated
 *
 * The digit count is what pins the BCD reading. Record 0 is `12 34 50 00` with
 * count 5 -> "12345", and record 1 is `65 43 21 00` with count 6 -> "654321".
 * Without the count, `12 34 50 00` could equally be a six-digit "123450", and
 * the trailing zero nibble is indistinguishable from a real 0.
 */

export const D890_ANALOG_ADDRESS_BOOK = {
  BASE: 0x3801000,
  STRIDE: 0x40,
  /**
   * ⚠️ One byte per slot, and NOT a bitmask — 0xFF is unused, and the two used
   * slots read 0x00 and 0x01, i.e. their own index.
   *
   * That makes this ambiguous on the evidence available: `table[i] === i` is
   * equally consistent with a per-slot presence byte and with a COMPACTED LIST
   * of used slot numbers. The two differ the moment a slot is deleted out of
   * order — deleting slot 0 leaves `ff 01` under one reading and `01 ff` under
   * the other. Until that is observed, treat a slot as used when its byte is
   * neither 0xFF nor absent, which is right under both readings for the
   * append-only case, and do not rely on the byte's VALUE.
   */
  SLOT_TABLE: 0x3800000,
  /** A parallel byte table 0x100 above, all zero for both used slots. Unknown. */
  SECOND_TABLE: 0x3800100,
  /** 0x40 bytes minus the 8-byte head, as UTF-16, less the NUL. */
  MAX_NAME_CHARS: (0x40 - 0x08) / 2 - 1,
  MAX_DIGITS: 8,
} as const;

export interface D890AnalogContact {
  slot: number;
  /** DTMF digits as written, e.g. "654321". Not a number — leading zeros count. */
  digits: string;
  name: string;
}

/**
 * Decode a record at `offset` within a buffer starting at the table base.
 *
 * Returns null for an erased or empty record rather than a contact with no
 * digits, so a caller cannot accidentally write one back.
 */
export function parseAnalogContact(
  bytes: Uint8Array,
  offset: number,
  slot: number
): D890AnalogContact | null {
  const count = bytes[offset + 0x07] ?? 0xff;
  if (count === 0 || count > D890_ANALOG_ADDRESS_BOOK.MAX_DIGITS) return null;

  let digits = '';
  for (let i = 0; i < count; i += 1) {
    const byte = bytes[offset + (i >> 1)] ?? 0;
    const nibble = i % 2 === 0 ? byte >> 4 : byte & 0x0f;
    if (nibble > 9) return null;
    digits += String(nibble);
  }

  let name = '';
  for (let i = 0x08; i < D890_ANALOG_ADDRESS_BOOK.STRIDE - 1; i += 2) {
    const unit = (bytes[offset + i] ?? 0) | ((bytes[offset + i + 1] ?? 0) << 8);
    if (unit === 0 || unit === 0xffff) break;
    name += String.fromCharCode(unit);
  }
  return { slot, digits, name };
}

/** Every record in a buffer that starts at `D890_ANALOG_ADDRESS_BOOK.BASE`. */
export function parseAnalogAddressBook(bytes: Uint8Array): D890AnalogContact[] {
  const out: D890AnalogContact[] = [];
  const slots = Math.floor(bytes.length / D890_ANALOG_ADDRESS_BOOK.STRIDE);
  for (let slot = 0; slot < slots; slot += 1) {
    const contact = parseAnalogContact(
      bytes,
      slot * D890_ANALOG_ADDRESS_BOOK.STRIDE,
      slot
    );
    if (contact) out.push(contact);
  }
  return out;
}
