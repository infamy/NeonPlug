/**
 * MDC1200 address book — the radio's named MDC unit IDs.
 *
 * The vendor labels the tables "MDC1200" but calls the feature QDC1200
 * internally (`23000=QDC1200 Setting` in the CPS language file); both names
 * refer to this.
 *
 * DECODED 2026-09-07 with no hardware session: two records captured either side
 * of a CPS edit, read back against a screenshot of the CPS grid that produced
 * them.
 *
 *   No.  Call Type      Private ID  Group ID  Type     Ack
 *   1    Private Call   1111                  SEL CAL  Off
 *   2    Group Call                 222       SEL CAL  Off
 *
 *   0x4a00000  00 00 00 00 00 00 11 11  then zeros
 *   0x4a00040  00 01 00 00 22 02 00 00  then zeros
 *
 * ⚠️ THE ID IS A PLAIN LITTLE-ENDIAN uint16. This was decoded as byte-swapped
 * BCD on 2026-09-07 and CORRECTED on 2026-09-08 by a controlled write on real
 * hardware: writing 1234 stores `d2 04`, and 0x04D2 = 1234. No BCD reading
 * produces that.
 *
 * How the wrong answer looked right. The only two values available on 09-07
 * were 1111 (`11 11`) and a second entry read as 222 (`22 02`). 1111 is a
 * palindrome and fits every candidate encoding. `22 02` read as BCD digits
 * looks like "2202", and taking the high pair from the second byte gives
 * "0222" — close enough to a believed 222 to seem confirmed. It is in fact 546
 * (0x0222), and BCD gives the wrong number for every value that is not
 * coincidentally palindromic.
 *
 * The lesson is the one the capture protocol already states: a discriminating
 * value settles an encoding, and a value that merely *fits* proves nothing.
 * 1234 discriminates; 1111 never could.
 */

/** Records are 0x40 apart; the CPS writes only the first 0x30 of each. */
/**
 * The slot table is a u16, split column-wise across two byte arrays.
 *
 * RESOLVED 2026-09-08 without a capture, from eleven states both sides already
 * held: 0x4980100 is 0x00 at exactly the slots where 0x4980000 holds a valid
 * index, and 0xFF at exactly the slots where 0x4980000 is 0xFF. They have never
 * once disagreed.
 *
 * So the pair is one little-endian u16 slot index per slot — low bytes at
 * 0x4980000, high bytes at 0x4980100 — with 0xFFFF for absent. The high byte is
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
export const D890_MDC1200 = {
  CONTACTS: 0x4a00000,
  /** One byte per slot, 0xFF unused. Its length is where 128 slots comes from. */
  CONTACTS_SLOT_TABLE: 0x4980000,
  STRIDE: 0x40,
  BODY: 0x30,
  SLOTS: 128,
  /** The encode list, and its presence word 100 * 0x40 above it. */
  ENCODE: 0x3702000,
  ENCODE_PRESENCE: 0x3703900,
  ENCODE_SLOTS: 100,
} as const;

/**
 * Call Type at +0x01. All three are now confirmed on hardware — a radio read on
 * 2026-09-09 held a slot with call type 2 named "MDCALL", which had until then
 * been only a column in the vendor CSV.
 */
export const MDC_CALL_TYPE = { PRIVATE: 0, GROUP: 1, ALL: 2 } as const;

export interface D890Mdc1200Contact {
  slot: number;
  /** +0x01 'Attr' in the vendor CSV: 0 Private, 1 Group, 2 All Call. */
  callType: number;
  /** +0x00. 5 = ALARM, the 6th entry of the Type list, so the list is 0-based. */
  type: number;
  /** +0x02. 1 = On. */
  ack: number;
  /** The ID in use, from whichever of Group/Private the call type selects. */
  id: number;
  name: string;
}

/**
 * Decode a little-endian uint16 ID.
 *
 * Never returns null: every 16-bit pattern is a legal ID, including 0. An
 * unpopulated field reads `00 00`, which is indistinguishable from a real 0, so
 * emptiness must be decided from the slot table — not from the value here.
 */
export function decodeMdcId(low: number, high: number): number {
  return ((low & 0xff) | ((high & 0xff) << 8)) >>> 0;
}

/** Inverse of `decodeMdcId`, as the two bytes in the order they are stored. */
export function encodeMdcId(id: number): [number, number] {
  const clamped = Math.max(0, Math.min(0xffff, Math.trunc(id)));
  return [clamped & 0xff, (clamped >> 8) & 0xff];
}

export function parseMdc1200Contact(
  bytes: Uint8Array,
  offset: number,
  slot: number
): D890Mdc1200Contact | null {
  if (offset + D890_MDC1200.BODY > bytes.length) return null;
  const callType = bytes[offset + 0x01] ?? 0xff;
  if (callType === 0xff) return null;

  // Group ID and Private ID are SEPARATE fields at fixed offsets, not one field
  // that moves: the CPS declares 23013 Private Call ID and 23014 Group Call ID,
  // and populates only the one the Call Type selects.
  const at = callType === MDC_CALL_TYPE.GROUP ? offset + 0x04 : offset + 0x06;
  const id = decodeMdcId(bytes[at] ?? 0, bytes[at + 1] ?? 0);
  const type = bytes[offset + 0x00] ?? 0;
  const ack = bytes[offset + 0x02] ?? 0;

  let name = '';
  for (let i = 0x08; i < D890_MDC1200.BODY - 1; i += 2) {
    const unit = (bytes[offset + i] ?? 0) | ((bytes[offset + i + 1] ?? 0) << 8);
    if (unit === 0 || unit === 0xffff) break;
    name += String.fromCharCode(unit);
  }
  return { slot, callType, type, ack, id, name };
}

/**
 * Which contact slots the slot table says are in use.
 *
 * ⚠️ Uses only "is it 0xFF", never the VALUE. Both observed slots hold their own
 * index, which fits a per-slot presence byte AND a compacted list of used slot
 * numbers equally well; deleting a slot out of order would tell them apart and
 * has never been captured. The same ambiguity applies to the analog address
 * book table at 0x3800000, and one capture would settle both.
 */
export function occupiedMdcSlots(slotTable: Uint8Array): number[] {
  const out: number[] = [];
  for (let i = 0; i < Math.min(slotTable.length, D890_MDC1200.SLOTS); i += 1) {
    if (slotTable[i] !== 0xff) out.push(i);
  }
  return out;
}

/**
 * Decode the slot table as the u16 array it actually is.
 *
 * `low` and `high` are the two parallel byte arrays — the same u16 split
 * column-wise. Absent is 0xFFFF, and a present slot's index is below 256 on
 * this radio, so `high` is 0x00 throughout in practice.
 *
 * Provided so a writer has something to be the inverse of. Reading occupancy
 * only needs `occupiedMdcSlots`; reproducing the table on a write needs both
 * halves, because a present slot left with 0xFF in `high` is index 0xFF00 + n.
 */
export function parseMdcSlotIndices(
  low: Uint8Array,
  high: Uint8Array
): (number | null)[] {
  return Array.from({ length: D890_MDC1200.SLOTS }, (_, i) => {
    const lo = low[i] ?? 0xff;
    const hi = high[i] ?? 0xff;
    const value = lo | (hi << 8);
    return value === 0xffff ? null : value;
  });
}

/**
 * Write one MDC1200 record, patching the original.
 *
 * Group ID and Private ID are SEPARATE fields; only the one the call type
 * selects is written, and the other is zeroed — which is what the CPS produces
 * and what our parser relies on to pick the live one.
 */
export function encodeMdc1200Contact(
  original: Uint8Array,
  offset: number,
  contact: Omit<D890Mdc1200Contact, 'slot'>
): Uint8Array {
  const out = Uint8Array.from(original);
  out[offset + 0x00] = contact.type & 0xff;
  out[offset + 0x01] = contact.callType & 0xff;
  out[offset + 0x02] = contact.ack & 0xff;
  out[offset + 0x03] = 0;

  const [lo, hi] = encodeMdcId(contact.id);
  const group = contact.callType === MDC_CALL_TYPE.GROUP;
  out[offset + 0x04] = group ? lo : 0;
  out[offset + 0x05] = group ? hi : 0;
  out[offset + 0x06] = group ? 0 : lo;
  out[offset + 0x07] = group ? 0 : hi;

  const name = Array.from(contact.name).slice(0, (D890_MDC1200.BODY - 0x08) / 2 - 1);
  out.fill(0, offset + 0x08, offset + D890_MDC1200.BODY);
  name.forEach((ch, i) => {
    const code = ch.charCodeAt(0);
    out[offset + 0x08 + i * 2] = code & 0xff;
    out[offset + 0x08 + i * 2 + 1] = (code >> 8) & 0xff;
  });
  return out;
}

/** Both halves of the MDC slot table. See `encodeAnalogSlotTable` — same shape. */
export function encodeMdcSlotTable(occupied: readonly number[]): [Uint8Array, Uint8Array] {
  const low = new Uint8Array(D890_MDC1200.SLOTS).fill(0xff);
  const high = new Uint8Array(D890_MDC1200.SLOTS).fill(0xff);
  occupied.forEach((slot, position) => {
    if (slot < 0 || slot >= D890_MDC1200.SLOTS) {
      throw new Error(`MDC1200 slot ${slot} is out of range`);
    }
    low[position] = slot & 0xff;
    high[position] = (slot >> 8) & 0xff;
  });
  return [low, high];
}
