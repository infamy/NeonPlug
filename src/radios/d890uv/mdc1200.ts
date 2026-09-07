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
 * ⚠️ THE ID IS BCD WITH THE BYTE PAIR SWAPPED, and only the Group ID proves it.
 * 222 stored as `22 02` is 222 only when the high pair is read from the SECOND
 * byte: 0x02 -> "02", 0x22 -> "22", giving "0222". Every other reading gives a
 * different number — u16 LE is 546, u16 BE is 8706, straight BCD is 2202. The
 * Private ID 1111 stored as `11 11` is a palindrome and would have been
 * consistent with all four, which is why it could not settle this alone.
 */

/** Records are 0x40 apart; the CPS writes only the first 0x30 of each. */
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

/** Call Type at +0x01. Private and Group are confirmed; All Call is not. */
export const MDC_CALL_TYPE = { PRIVATE: 0, GROUP: 1, ALL: 2 } as const;

export interface D890Mdc1200Contact {
  slot: number;
  callType: number;
  /** The ID that is actually in use, decoded from whichever field Call Type selects. */
  id: number | null;
  name: string;
}

/**
 * Decode a 2-byte swapped-BCD ID. Returns null when the pair is not decimal —
 * an unpopulated field reads 00 00, which is a legitimate 0, so callers must
 * decide emptiness from Call Type rather than from a zero here.
 */
export function decodeMdcId(lowPair: number, highPair: number): number | null {
  const pair = (byte: number) => {
    const hi = byte >> 4;
    const lo = byte & 0x0f;
    return hi > 9 || lo > 9 ? null : hi * 10 + lo;
  };
  const high = pair(highPair);
  const low = pair(lowPair);
  if (high === null || low === null) return null;
  return high * 100 + low;
}

/** Inverse of `decodeMdcId`, as the two bytes in the order they are stored. */
export function encodeMdcId(id: number): [number, number] {
  const clamped = Math.max(0, Math.min(9999, Math.trunc(id)));
  const bcd = (n: number) => ((Math.trunc(n / 10) % 10) << 4) | (n % 10);
  return [bcd(clamped % 100), bcd(Math.trunc(clamped / 100))];
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

  let name = '';
  for (let i = 0x08; i < D890_MDC1200.BODY - 1; i += 2) {
    const unit = (bytes[offset + i] ?? 0) | ((bytes[offset + i + 1] ?? 0) << 8);
    if (unit === 0 || unit === 0xffff) break;
    name += String.fromCharCode(unit);
  }
  return { slot, callType, id, name };
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
