import { decodeWideCharString } from './structures';

/**
 * The power-on screen's custom text, and the power-on password.
 *
 * Sits at 0x3500900 — OUTSIDE the 0x160-byte settings block at 0x3500000, which
 * is why none of it is in `settingsMap.ts`.
 *
 * Confirmed 2026-08-31 against a real dump and the CPS's Power-on tab: the tab
 * showed WELCOME / ANYTONE / 12345678 and the bytes read exactly that.
 *
 * The two text lines are the alternative to a boot image — the radio shows one
 * or the other, selected by Power-on Interface.
 */
export const D890_POWER_ON = {
  /** Vendor `Start_Char`. */
  LINE_1: 0x3500900,
  /** Vendor `Start_Char2`. */
  LINE_2: 0x3500920,
  /** Vendor `Password_Char`. */
  PASSWORD: 0x3500940,
  /** Each field occupies 0x20; the read spans all three in one go. */
  STRIDE: 0x20,
  SPAN: 0x60,
  /**
   * The vendor schema says varchar(14) for both lines, and the CPS draws
   * exactly 14 character boxes. The field is 0x20 bytes (16 UTF-16 units), so
   * reading 16 would show two characters the CPS cannot produce — decode the
   * declared 14 and leave the rest alone.
   */
  TEXT_CHARS: 14,
  /** varchar(8), and stored as ASCII rather than UTF-16 unlike the two lines. */
  PASSWORD_CHARS: 8,
} as const;

export interface D890PowerOnDisplay {
  line1: string;
  line2: string;
  password: string;
}

/** Decode ASCII, stopping at the first NUL. Not UTF-16 — the password alone is bytes. */
function decodeAscii(bytes: Uint8Array, max: number): string {
  let out = '';
  for (let i = 0; i < max && i < bytes.length; i += 1) {
    const b = bytes[i] ?? 0;
    if (b === 0x00 || b === 0xff) break;
    out += String.fromCharCode(b);
  }
  return out;
}

/** Parse the 0x60-byte span starting at `D890_POWER_ON.LINE_1`. */
export function parsePowerOnDisplay(bytes: Uint8Array): D890PowerOnDisplay {
  const at = (offset: number) => bytes.subarray(offset, offset + D890_POWER_ON.STRIDE);
  return {
    line1: decodeWideCharString(at(0x00), D890_POWER_ON.TEXT_CHARS),
    line2: decodeWideCharString(at(0x20), D890_POWER_ON.TEXT_CHARS),
    password: decodeAscii(at(0x40), D890_POWER_ON.PASSWORD_CHARS),
  };
}

/**
 * Encode the 0x60-byte power-on span.
 *
 * ⚠️ **Mixed encoding in one region.** The two lines are UTF-16LE; the password
 * is ASCII. Writing the password as wide characters would give the radio a
 * password whose every other byte is a NUL — accepted by a write, and then the
 * user cannot unlock their radio. That is why this takes the original: the
 * bytes past each field's text are the radio's, not ours.
 */
export function encodePowerOnDisplay(
  original: Uint8Array,
  display: D890PowerOnDisplay
): Uint8Array {
  if (original.length < D890_POWER_ON.SPAN) {
    throw new Error(
      `Power-on display span must be at least ${D890_POWER_ON.SPAN} bytes to patch, ` +
        `got ${original.length}`
    );
  }
  const out = Uint8Array.from(original);

  const wide = (text: string, at: number) => {
    const clipped = Array.from(text).slice(0, D890_POWER_ON.TEXT_CHARS);
    out.fill(0, at, at + D890_POWER_ON.STRIDE);
    clipped.forEach((ch, i) => {
      const code = ch.charCodeAt(0);
      out[at + i * 2] = code & 0xff;
      out[at + i * 2 + 1] = (code >> 8) & 0xff;
    });
  };
  wide(display.line1 ?? '', 0x00);
  wide(display.line2 ?? '', 0x20);

  // ASCII, one byte per character — NOT the wide encoding above.
  const password = (display.password ?? '').slice(0, D890_POWER_ON.PASSWORD_CHARS);
  out.fill(0, 0x40, 0x40 + D890_POWER_ON.STRIDE);
  for (let i = 0; i < password.length; i += 1) {
    out[0x40 + i] = password.charCodeAt(i) & 0xff;
  }
  return out;
}
