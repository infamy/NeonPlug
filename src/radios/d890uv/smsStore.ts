/**
 * The SMS message store — envelopes, presence and the list head.
 *
 * DECODED 2026-09-07 from the CPS marshallers, CONFIRMED ON HARDWARE 2026-09-08
 * by deleting the first predefined message and reading back.
 *
 * Three pieces, and missing any one of them makes the other two unreadable:
 *
 *   0x2980000 + i*0x10   envelope per slot, written only for occupied slots
 *   0x2980800 + i        VALID byte: 0x00 present, 0xFF free
 *   0x2980880            HEAD: index of the first valid slot, 0xFF if none
 *
 * ⚠️ IT IS A LINKED LIST, NOT AN ARRAY, and deletion does NOT compact. Deleting
 * message 1 left slot 0 retired to 0xFF, slots 1-4 untouched, and the head
 * pointing at 1 — exactly as predicted, so the chain is real and not an
 * artefact of sequential creation.
 *
 * ⚠️ The ANALOG ADDRESS BOOK, which looks structurally similar, DOES compact and
 * renumber on delete. Two tables in one radio with two deletion semantics. Do
 * not carry either behaviour across to the other.
 *
 * The message TEXT is not here — it lives in the predefined-SMS region at
 * 0x3180000, and `textSlot` below is the index into it. The reader must follow
 * that byte rather than assume text slot == record slot: they agree in every
 * capture so far, but the CPS dereferences the byte, so they are free to differ.
 */

export const D890_SMS_STORE = {
  ENVELOPES: 0x2980000,
  STRIDE: 0x10,
  /** 0x00 present, 0xFF free. One byte per slot. */
  VALID: 0x2980800,
  /** Index of the first valid slot; 0xFF when the store is empty. */
  HEAD: 0x2980880,
  SLOTS: 100,
  /** Ends the chain. */
  END: 0xff,
} as const;

export interface D890SmsEnvelope {
  slot: number;
  /** Next VALID slot, or null at the end of the chain. */
  next: number | null;
  /** Index into the predefined-SMS text table — NOT necessarily `slot`. */
  textSlot: number;
  /** +0x07. 0 for predefined messages; other values not yet seen. */
  attr: number;
  /** +0x0c..0f, 8 BCD digits. Null when the field is not decimal. */
  code: number | null;
}

/** Four BCD bytes as one decimal number. Null if any nibble is not a digit. */
function decodeBcd8(bytes: Uint8Array, at: number): number | null {
  let value = 0;
  for (let i = 0; i < 4; i += 1) {
    const byte = bytes[at + i] ?? 0;
    const hi = byte >> 4;
    const lo = byte & 0x0f;
    if (hi > 9 || lo > 9) return null;
    value = value * 100 + hi * 10 + lo;
  }
  return value;
}

export function parseSmsEnvelope(
  envelopes: Uint8Array,
  slot: number
): D890SmsEnvelope {
  const at = slot * D890_SMS_STORE.STRIDE;
  const next = envelopes[at + 0x02] ?? D890_SMS_STORE.END;
  return {
    slot,
    next: next === D890_SMS_STORE.END ? null : next,
    textSlot: envelopes[at + 0x03] ?? 0,
    attr: envelopes[at + 0x07] ?? 0,
    code: decodeBcd8(envelopes, at + 0x0c),
  };
}

/**
 * Walk the store in the radio's own order, from the head along the chain.
 *
 * Walking the chain rather than scanning slots is what makes the order right,
 * and it is also the only reading that survives a delete: after one, the slots
 * are 1,2,3,4 with 0 retired, and a slot scan would still produce them in the
 * same order purely by luck.
 *
 * Guarded against a cycle — a corrupt `next` pointing backwards would otherwise
 * hang the read. Stops after SLOTS steps and reports what it found.
 */
export function parseSmsStore(
  envelopes: Uint8Array,
  valid: Uint8Array,
  head: number
): D890SmsEnvelope[] {
  const out: D890SmsEnvelope[] = [];
  const seen = new Set<number>();
  let slot = head;
  while (
    slot !== D890_SMS_STORE.END &&
    slot < D890_SMS_STORE.SLOTS &&
    !seen.has(slot) &&
    out.length < D890_SMS_STORE.SLOTS
  ) {
    seen.add(slot);
    // Trust the valid table over the chain: a stale pointer into a retired slot
    // is exactly what a half-finished delete would leave.
    if (valid[slot] !== 0x00) break;
    const envelope = parseSmsEnvelope(envelopes, slot);
    out.push(envelope);
    if (envelope.next === null) break;
    slot = envelope.next;
  }
  return out;
}

/** Slots the valid table marks as occupied, in slot order. */
export function occupiedSmsSlots(valid: Uint8Array): number[] {
  const out: number[] = [];
  for (let i = 0; i < Math.min(valid.length, D890_SMS_STORE.SLOTS); i += 1) {
    if (valid[i] === 0x00) out.push(i);
  }
  return out;
}

/**
 * Rebuild the chain for a set of occupied slots, patching all three pieces.
 *
 * Returns the envelopes, the valid table and the head — the caller writes each
 * to its own address. All three must move together: envelopes alone leave the
 * radio reading a stale valid table, and a head pointing at a retired slot is
 * how a half-finished delete looks.
 *
 * ⚠️ SLOTS ARE NOT RENUMBERED. This store is a linked list and deletion does
 * NOT compact — hardware-confirmed by deleting message 1 and finding slots 1-4
 * untouched with the head moved to 1. Passing `[1,2,3,4]` therefore retires
 * slot 0 and leaves the rest exactly where they are, which is what the radio
 * itself does. (The analog address book is the opposite and DOES compact.)
 *
 * `textSlot` defaults to the record's own slot, which is what every capture
 * shows — but it is written from the caller's value because the radio's reader
 * dereferences that byte rather than assuming.
 */
export function encodeSmsStore(
  originalEnvelopes: Uint8Array,
  occupied: readonly { slot: number; textSlot?: number }[]
): { envelopes: Uint8Array; valid: Uint8Array; head: number } {
  const envelopes = Uint8Array.from(originalEnvelopes);
  const valid = new Uint8Array(D890_SMS_STORE.SLOTS).fill(D890_SMS_STORE.END);

  const slots = [...occupied].sort((a, b) => a.slot - b.slot);
  for (const { slot } of slots) {
    if (slot < 0 || slot >= D890_SMS_STORE.SLOTS) {
      throw new Error(`SMS slot ${slot} is outside 0..${D890_SMS_STORE.SLOTS - 1}`);
    }
  }

  slots.forEach(({ slot, textSlot }, i) => {
    const at = slot * D890_SMS_STORE.STRIDE;
    // An envelope built over ERASED flash starts from zeros — every byte the
    // vendor writes besides `next` and `textSlot`, across two uploads
    // (`WriteTo7x2.txt`, `7x2_onecleared.txt`). Patching the 0xFF instead would
    // leave attr at 0xFF and the code non-decimal, an envelope no capture has
    // ever shown. A slot that already holds an envelope is patched, as before.
    if (envelopes.subarray(at, at + D890_SMS_STORE.STRIDE).every((b) => b === 0xff)) {
      envelopes.fill(0x00, at, at + D890_SMS_STORE.STRIDE);
    }
    const next = slots[i + 1];
    envelopes[at + 0x02] = next ? next.slot : D890_SMS_STORE.END;
    envelopes[at + 0x03] = textSlot ?? slot;
    valid[slot] = 0x00;
  });

  return {
    envelopes,
    valid,
    head: slots.length > 0 ? slots[0].slot : D890_SMS_STORE.END,
  };
}
