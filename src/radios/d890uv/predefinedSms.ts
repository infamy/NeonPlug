import { D890_ADDR } from './constants';
import type { D890SmsEnvelope } from './smsStore';
import type { QuickTextMessage } from '../../models/QuickTextMessage';

/**
 * DA-7X2 pre-defined SMS — the app's quick messages.
 *
 * Layout confirmed on hardware 2026-08-30 — see `PREDEFINED_SMS_DATA`. Banked
 * exactly like talkgroups: twenty slots per bank, banks 0x80000 apart.
 *
 * ⚠️ A TEXT SLOT IS NOT A MESSAGE. The list the radio shows is the SMS store
 * chain at 0x2980000 (`smsStore.ts`): walk it from the head, and each envelope
 * names the text slot to fetch. A text no envelope points at is not listed —
 * see `quickMessagesFromChain`.
 */

/** Address of slot `index` (0-based). */
export function predefinedSmsAddress(index: number): number {
  const bank = Math.floor(index / D890_ADDR.PREDEFINED_SMS_PER_BANK);
  const withinBank = index % D890_ADDR.PREDEFINED_SMS_PER_BANK;
  return (
    D890_ADDR.PREDEFINED_SMS_DATA +
    bank * D890_ADDR.PREDEFINED_SMS_BANK_STRIDE +
    withinBank * D890_ADDR.PREDEFINED_SMS_STRIDE
  );
}

/**
 * Decode one slot's UTF-16LE text.
 *
 * Stops at a NUL **or at 0xFFFF**. That second terminator is not optional: an
 * unused slot on a real radio is 0xFF-filled erased flash, and stopping only at
 * NUL turns it into 256 replacement characters that look like a corrupt message
 * rather than an empty one.
 *
 * Returns null for an empty slot so the caller can tell "no message" from "a
 * message that is the empty string".
 */
export function parsePredefinedSms(bytes: Uint8Array): string | null {
  let text = '';
  const limit = Math.min(bytes.length, D890_ADDR.PREDEFINED_SMS_STRIDE);
  for (let i = 0; i + 1 < limit; i += 2) {
    const code = (bytes[i] ?? 0) | ((bytes[i + 1] ?? 0) << 8);
    if (code === 0 || code === 0xffff) break;
    text += String.fromCharCode(code);
  }
  return text.length > 0 ? text : null;
}

/**
 * Encode text to a slot, exactly as the vendor CPS writes one: the text, a NUL,
 * then zeros to the end of the 0x200 record.
 *
 * Reproduces all five factory messages in the vendor's own upload
 * (`WriteTo7x2.txt`) byte for byte — tests/fixtures/d890uv/sms-vendor-texts.bin.
 */
export function encodePredefinedSms(text: string): Uint8Array {
  const out = new Uint8Array(D890_ADDR.PREDEFINED_SMS_STRIDE);
  const clipped = text.slice(0, D890_ADDR.PREDEFINED_SMS_MAX_CHARS);
  for (let i = 0; i < clipped.length; i += 1) {
    const c = clipped.charCodeAt(i);
    out[i * 2] = c & 0xff;
    out[i * 2 + 1] = (c >> 8) & 0xff;
  }
  // Remaining bytes stay zero: a NUL terminator immediately after the text.
  return out;
}

/**
 * A slot as the radio's own delete leaves it: erased flash, 0xFF throughout.
 * MEASURED 2026-09-08 — deleting message 1 on the radio left its text slot
 * reading 0xFF, with slots 1-4 untouched.
 */
export function erasedPredefinedSms(): Uint8Array {
  return new Uint8Array(D890_ADDR.PREDEFINED_SMS_STRIDE).fill(0xff);
}

/**
 * The pre-defined messages in the radio's own order: walk the SMS store chain
 * and fetch each envelope's TEXT slot.
 *
 * THE CHAIN IS THE LIST, not the text table. MEASURED 2026-09-10: a text left
 * in slot 2 after its envelope was retired did not appear in the vendor CPS,
 * which read the chain and wrote back only the three messages it reached
 * (`7x2_onecleared.txt`). The reader this replaced scanned text slots, so it
 * would have listed "Thank you!", a message the radio no longer had, and a write
 * would then have put it back in the chain.
 *
 * `slot` is the TEXT slot because that is what the rest of the radio names: a
 * hot key's Content byte (+0x08) and an envelope's +0x03 both hold it. An
 * envelope whose text slot is out of range or empty is skipped rather than shown
 * as a blank message — it names nothing the radio can display.
 */
export async function quickMessagesFromChain(
  chain: readonly D890SmsEnvelope[],
  readText: (textSlot: number) => Promise<Uint8Array>
): Promise<QuickTextMessage[]> {
  const out: QuickTextMessage[] = [];
  for (const { textSlot } of chain) {
    if (textSlot >= D890_ADDR.PREDEFINED_SMS_MAX) continue;
    const text = parsePredefinedSms(await readText(textSlot));
    if (text === null) continue;
    // `flag` and `checkValue` are DM-32 fields with no counterpart here; the
    // model requires them, so they are zero rather than invented.
    out.push({ index: textSlot, slot: textSlot, text, flag: 0, checkValue: 0 });
  }
  return out;
}
