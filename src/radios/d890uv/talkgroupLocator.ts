/**
 * The talk group record locator table at 0x3900000.
 *
 * IDENTIFIED 2026-09-07 from the vendor CPS disassembly, after being carried as
 * "the largest unexplained region in the write set" — 40 KB always written,
 * 32 bytes read.
 *
 * One u32 LE per talk group slot, indexed by the same loop counter as the
 * presence mask at 0x3980000. The value V LOCATES the record:
 *
 *     record = 0x3A00000 + (V / 1000) * 0x80000 + (V % 1000) * 0xC8
 *
 * computed identically in the talk group reader, the writer, and the transfer
 * driver whose output goes on the wire. Corroborated independently on hardware
 * 2026-09-08: 1010 talk groups put record 1000 at 0x3A80000, and 0x3A30D40 —
 * where a flat array would put it — reads back 0xFF, never written.
 *
 * ⚠️ A WRITE MUST NOT PACK 0..N-1. The writer stores V = the SLOT INDEX for each
 * present slot and 0xFFFFFFFF for each absent one. With contiguous talk groups
 * those coincide, which is why every capture looks like an identity table; with
 * a hole in the mask they diverge, and a wrong entry sends the radio to the
 * wrong RECORD rather than merely to a wrong sort position.
 *
 * It is NOT a sort order. On the six-talk-group codeplug the table reads
 * 0,1,2,3,4,5; sorted by DMR ID those six would be 0,1,3,4,2,5 and by name
 * 5,3,4,0,2,1.
 */

export const D890_TALKGROUP_LOCATOR = {
  ADDRESS: 0x3900000,
  /** 10,000 slots x 4 bytes — what the CPS writes every time. */
  SLOTS: 10000,
  STRIDE: 4,
  /** Absent. Not 0xFF: the high byte > 0x7F is what marks a slot unused. */
  ABSENT: 0xffffffff,
} as const;

/** Slot indices the table marks present, in slot order. */
export function parseTalkgroupLocator(bytes: Uint8Array): number[] {
  const out: number[] = [];
  const slots = Math.min(D890_TALKGROUP_LOCATOR.SLOTS, Math.floor(bytes.length / 4));
  for (let i = 0; i < slots; i += 1) {
    const at = i * 4;
    // The CPS tests the HIGH byte against 0x7F rather than comparing the whole
    // word, so a value with bit 31 set is absent however the rest reads.
    if ((bytes[at + 3] ?? 0xff) > 0x7f) continue;
    out.push(
      ((bytes[at] ?? 0) |
        ((bytes[at + 1] ?? 0) << 8) |
        ((bytes[at + 2] ?? 0) << 16) |
        ((bytes[at + 3] ?? 0) << 24)) >>> 0
    );
  }
  return out;
}

/**
 * Build the full 40,000-byte table for a set of present slots.
 *
 * Built rather than patched, deliberately and unusually: the CPS writes all
 * 10,000 entries on every write, and a stale entry for a slot that is no longer
 * present would point the radio at a record that is no longer there. Every byte
 * of this region is determined by the presence mask, so there is nothing of the
 * radio's own to preserve.
 */
export function encodeTalkgroupLocator(presentSlots: readonly number[]): Uint8Array {
  const out = new Uint8Array(D890_TALKGROUP_LOCATOR.SLOTS * 4).fill(0xff);
  for (const slot of presentSlots) {
    if (slot < 0 || slot >= D890_TALKGROUP_LOCATOR.SLOTS) {
      throw new Error(`Talk group slot ${slot} is outside 0..${D890_TALKGROUP_LOCATOR.SLOTS - 1}`);
    }
    const at = slot * 4;
    // V = the slot index itself. See the warning above: NOT a packed sequence.
    out[at] = slot & 0xff;
    out[at + 1] = (slot >>> 8) & 0xff;
    out[at + 2] = (slot >>> 16) & 0xff;
    out[at + 3] = (slot >>> 24) & 0xff;
  }
  return out;
}

/** Where slot value V puts its record. The banking rule, in one place. */
export function talkgroupRecordAddress(v: number): number {
  return 0x3a00000 + Math.floor(v / 1000) * 0x80000 + (v % 1000) * 0xc8;
}
