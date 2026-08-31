import { D890_ADDR } from './constants';

/**
 * DA-7X2 pre-defined SMS.
 *
 * Layout confirmed on hardware 2026-08-30 — see `PREDEFINED_SMS_DATA`. Banked
 * exactly like talkgroups: twenty slots per bank, banks 0x80000 apart.
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

/** Encode text back to a slot. Not written anywhere yet — read path only. */
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
