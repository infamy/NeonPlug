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

/**
 * The slot table is a u16, split column-wise across two byte arrays.
 *
 * RESOLVED 2026-09-08 without a capture, from eleven states both sides already
 * held: 0x3800100 is 0x00 at exactly the slots where 0x3800000 holds a valid
 * index, and 0xFF at exactly the slots where 0x3800000 is 0xFF. They have never
 * once disagreed.
 *
 * So the pair is one little-endian u16 slot index per slot — low bytes at
 * 0x3800000, high bytes at 0x3800100 — with 0xFFFF for absent. The high byte is
 * 0x00 for every present slot because every index is below 256, and this radio
 * caps the book at 128 rows, so a non-zero high byte is UNREACHABLE here.
 *
 * That is why the obvious experiment could never have worked: varying a
 * per-entry attribute cannot move it. An existing capture already rules out Ack
 * and Type, which differ between rows while the high bytes stay 00 00 00 00.
 *
 * ⚠️ A WRITER MUST STILL EMIT IT: 0x00 for present slots, 0xFF for absent. A
 * present slot left with 0xFF in the high byte is index 0xFF00 + n, which is
 * not a slot that exists.
 *
 * Inference from consistent states plus a structural argument, not a direct
 * measurement — nobody has seen a non-zero high byte because on this radio
 * nothing can produce one. Falsifiable: a table of this shape with more than
 * 255 entries would show one.
 */
export const D890_ANALOG_ADDRESS_BOOK = {
  BASE: 0x3801000,
  STRIDE: 0x40,
  /**
   * ⚠️ One byte per slot, and NOT a bitmask — 0xFF is unused, and the two used
   * slots read 0x00 and 0x01, i.e. their own index.
   *
   * RESOLVED ON HARDWARE 2026-09-08: **deletion COMPACTS the records and
   * renumbers this table**, so it is the compacted-list reading.
   *
   * CONFIRMED AGAIN 2026-09-09, this time by a NeonPlug write rather than the
   * CPS: adding an entry then deleting the FIRST one renumbered the survivors
   * to slots 0 and 1 exactly as modelled. The delisted record's bytes stay in
   * flash and the reader no longer even fetches that slot.
   *
   * ⭐ AND THE RADIO'S OWN MENU DISPLAYED THE BOOK CORRECTLY afterwards. That is
   * a stronger class of evidence than a read-back: a read-back only proves our
   * decoder agrees with our encoder, while the radio rendering the entries
   * proves its FIRMWARE parses what we wrote. Prefer this check for any region
   * that is visible on the radio. A slot index is
   * therefore NOT a stable identifier — anything that remembers "the contact in
   * slot 3" is wrong the moment an earlier entry is deleted.
   *
   * The code below was already written to survive either answer: it tests only
   * "is the byte 0xFF", never the value. Keep it that way.
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

/** BCD-pack `count` digits, high nibble first, into 4 bytes. */
function packDigits(digits: string): Uint8Array {
  const out = new Uint8Array(4);
  for (let i = 0; i < digits.length && i < D890_ANALOG_ADDRESS_BOOK.MAX_DIGITS; i += 1) {
    const value = digits.charCodeAt(i) - 48;
    const byte = i >> 1;
    out[byte] = i % 2 === 0 ? (value << 4) | (out[byte] & 0x0f) : (out[byte] & 0xf0) | value;
  }
  return out;
}

/**
 * Write one record, patching the original.
 *
 * The DIGIT COUNT at +0x07 is load-bearing and written from the string length,
 * not guessed: `12 34 50 00` is "12345" at count 5 and "123450" at count 6, and
 * the trailing zero nibble is indistinguishable from a real digit without it.
 */
export function encodeAnalogContact(
  original: Uint8Array,
  offset: number,
  contact: Pick<D890AnalogContact, 'digits' | 'name'>
): Uint8Array {
  const digits = contact.digits.replace(/\D/g, '').slice(0, D890_ANALOG_ADDRESS_BOOK.MAX_DIGITS);
  if (digits.length === 0) throw new Error('An analog contact needs at least one digit');
  const out = Uint8Array.from(original);

  out.set(packDigits(digits), offset);
  out[offset + 0x04] = 0;
  out[offset + 0x05] = 0;
  out[offset + 0x06] = 0;
  out[offset + 0x07] = digits.length;

  const name = Array.from(contact.name).slice(0, D890_ANALOG_ADDRESS_BOOK.MAX_NAME_CHARS);
  out.fill(0, offset + 0x08, offset + D890_ANALOG_ADDRESS_BOOK.STRIDE);
  name.forEach((ch, i) => {
    const code = ch.charCodeAt(0);
    out[offset + 0x08 + i * 2] = code & 0xff;
    out[offset + 0x08 + i * 2 + 1] = (code >> 8) & 0xff;
  });
  return out;
}

/**
 * Build both halves of the slot table for a set of occupied slots.
 *
 * Returns `[low, high]` — the same u16 index split column-wise, `0xFFFF` for
 * absent. The high half is all `0x00` for present slots on this radio because
 * every index is below 256, but it MUST still be written: a present slot left
 * with `0xFF` there is index `0xFF00 + n`, which is not a slot that exists.
 *
 * ⚠️ Deleting an entry COMPACTS and renumbers this book, unlike the SMS store.
 * A caller that wants to delete slot k must renumber the survivors, not just
 * clear k.
 */
export function encodeAnalogSlotTable(occupied: readonly number[]): [Uint8Array, Uint8Array] {
  const low = new Uint8Array(128).fill(0xff);
  const high = new Uint8Array(128).fill(0xff);
  occupied.forEach((slot, position) => {
    if (slot < 0 || slot >= 128) throw new Error(`Analog address book slot ${slot} is out of range`);
    low[position] = slot & 0xff;
    high[position] = (slot >> 8) & 0xff;
  });
  return [low, high];
}
