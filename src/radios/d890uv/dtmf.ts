/**
 * DTMF — the settings block, and the 16-entry encode list.
 *
 * Two separate regions owned by one marshaller, which is why the second was
 * unattributed for so long: it sits in the SETTINGS address range.
 *
 *   0x3481e00  0x50 bytes  settings, then four 16-byte digit strings
 *   0x3500800  0x100       16 encode entries x 16 bytes
 *
 * Three timing bytes were ASSIGNED ON HARDWARE 2026-09-08 by writing three
 * deliberately distinct values and reading back — 420, 310 and 530 ms landed as
 * 0x2A, 0x1F and 0x35, each unique within the block, which is what made the
 * assignment unambiguous.
 *
 * ⚠️ Timings are a SINGLE BYTE holding milliseconds/10, not a u16. None of 310,
 * 420 or 530 appears as a u16 anywhere in the block.
 */

export const D890_DTMF = {
  SETTINGS: 0x3481e00,
  SETTINGS_BYTES: 0x50,
  /** BOT, EOT, kill, stun — 16 bytes each, one digit code per byte. */
  STRING_OFFSETS: [0x10, 0x20, 0x30, 0x40] as const,
  STRING_BYTES: 0x10,
  /** The encode list, in the settings address range despite being DTMF. */
  ENCODE: 0x3500800,
  ENCODE_SLOTS: 16,
  ENCODE_STRIDE: 0x10,
  /** Digit codes: 0-9 are themselves, 10-15 are A B C D * #. */
  DIGITS: '0123456789ABCD*#',
  PAD: 0xff,
} as const;

export interface D890DtmfSettings {
  /** Digit code. The writer forces 0x0e ('*') if it is outside 10..15. */
  interCode: number;
  /** 10..15, or null for Off (0xFF). */
  groupCode: number | null;
  /** 0..2 — None / Beep / Beep and respond. */
  decodingResponse: number;
  /** ASSIGNED on hardware: milliseconds. */
  pretimeMs: number;
  /** ASSIGNED on hardware: milliseconds. */
  firstDigitMs: number;
  /** ASSIGNED on hardware: milliseconds. */
  timeLapseAfterEncodeMs: number;
  /** 3 digit codes, one per byte. */
  selfId: string;
  sideTone: number;
  /**
   * ⚠️ NOT ASSIGNED. Auto Reset Time[s] and PTT ID Pause Time[s] both went into
   * the confirming write at their existing values (10 and Off), so they are
   * consistent with 0x0A at +0x01 or +0x05 and 0x00 at several offsets — and a
   * repeated value cannot discriminate. One write with 9 and 7 closes it.
   */
  unassigned: { at01: number; at05: number; at0b: number; at0c: number; at0d: number };
  /** BOT, EOT, kill, stun. */
  strings: string[];
}

/** Digit codes to text, stopping at the 0xFF pad. */
export function decodeDtmfDigits(bytes: Uint8Array, at: number, max: number): string {
  let out = '';
  for (let i = 0; i < max; i += 1) {
    const code = bytes[at + i] ?? D890_DTMF.PAD;
    if (code === D890_DTMF.PAD) break;
    // A code outside the table is not a digit; stop rather than emit a guess.
    if (code >= D890_DTMF.DIGITS.length) break;
    out += D890_DTMF.DIGITS[code];
  }
  return out;
}

export function parseDtmfSettings(bytes: Uint8Array): D890DtmfSettings {
  const at = (i: number) => bytes[i] ?? 0;
  const group = at(0x01);
  return {
    interCode: at(0x00),
    groupCode: group === D890_DTMF.PAD ? null : group,
    decodingResponse: at(0x02),
    // Each of these three is milliseconds/10 — see the header.
    pretimeMs: at(0x03) * 10,
    firstDigitMs: at(0x04) * 10,
    timeLapseAfterEncodeMs: at(0x0a) * 10,
    selfId: decodeDtmfDigits(bytes, 0x06, 3),
    sideTone: at(0x09),
    unassigned: { at01: at(0x01), at05: at(0x05), at0b: at(0x0b), at0c: at(0x0c), at0d: at(0x0d) },
    strings: D890_DTMF.STRING_OFFSETS.map((off) =>
      decodeDtmfDigits(bytes, off, D890_DTMF.STRING_BYTES)
    ),
  };
}

/**
 * The 16 encode entries — the DTMF IDs a channel selects by index.
 *
 * CONFIRMED from the wire: setting an entry to "123123123" turned the region
 * from all 0xFF into 01 02 03 01 02 03 01 02 03 ff ff…, one digit code per
 * byte, 0xFF padded. Empty entries are returned as empty strings so the INDEX
 * stays meaningful — a channel refers to entry N, so compacting would repoint
 * every channel below it.
 */
export function parseDtmfEncodeList(bytes: Uint8Array): string[] {
  return Array.from({ length: D890_DTMF.ENCODE_SLOTS }, (_, i) =>
    decodeDtmfDigits(bytes, i * D890_DTMF.ENCODE_STRIDE, D890_DTMF.ENCODE_STRIDE)
  );
}

/** Text back to digit codes, 0xFF-padded to `width`. */
export function encodeDtmfDigits(text: string, width: number): Uint8Array {
  const out = new Uint8Array(width).fill(D890_DTMF.PAD);
  const chars = Array.from(text.toUpperCase()).slice(0, width);
  chars.forEach((ch, i) => {
    const code = D890_DTMF.DIGITS.indexOf(ch);
    if (code < 0) throw new Error(`'${ch}' is not a DTMF digit (0-9 A-D * #)`);
    out[i] = code;
  });
  return out;
}

/**
 * Write the DTMF settings block, patching the original.
 *
 * ONLY the fields that are actually assigned are written. The two unassigned
 * timings — Auto Reset Time and PTT ID Pause — and every byte past +0x0d are
 * left exactly as read, because writing a byte whose meaning is unknown is the
 * change that breaks a radio. When one write with distinct values assigns them,
 * they can be added here.
 *
 * Timings are milliseconds/10 in a SINGLE byte, so 530 ms is 0x35. Values are
 * clamped to a byte rather than silently wrapping: 2560 ms would otherwise
 * become 0.
 */
export function encodeDtmfSettings(
  original: Uint8Array,
  settings: Pick<
    D890DtmfSettings,
    'interCode' | 'groupCode' | 'decodingResponse' | 'pretimeMs' |
    'firstDigitMs' | 'timeLapseAfterEncodeMs' | 'selfId' | 'sideTone' | 'strings'
  >
): Uint8Array {
  const out = Uint8Array.from(original);
  const ms = (value: number) => Math.max(0, Math.min(255, Math.round(value / 10)));

  out[0x00] = settings.interCode & 0xff;
  out[0x01] = settings.groupCode === null ? D890_DTMF.PAD : settings.groupCode & 0xff;
  out[0x02] = settings.decodingResponse & 0xff;
  out[0x03] = ms(settings.pretimeMs);
  out[0x04] = ms(settings.firstDigitMs);
  out.set(encodeDtmfDigits(settings.selfId, 3), 0x06);
  out[0x09] = settings.sideTone & 0xff;
  out[0x0a] = ms(settings.timeLapseAfterEncodeMs);

  D890_DTMF.STRING_OFFSETS.forEach((off, i) => {
    out.set(encodeDtmfDigits(settings.strings[i] ?? '', D890_DTMF.STRING_BYTES), off);
  });
  return out;
}

/**
 * Write the 16 encode entries.
 *
 * The INDEX is meaningful — a channel selects a DTMF ID by position — so an
 * empty string writes an all-0xFF entry rather than being skipped. Compacting
 * would repoint every channel that referenced a later entry.
 */
export function encodeDtmfEncodeList(entries: readonly string[]): Uint8Array {
  const out = new Uint8Array(D890_DTMF.ENCODE_SLOTS * D890_DTMF.ENCODE_STRIDE).fill(D890_DTMF.PAD);
  for (let i = 0; i < D890_DTMF.ENCODE_SLOTS; i += 1) {
    out.set(
      encodeDtmfDigits(entries[i] ?? '', D890_DTMF.ENCODE_STRIDE),
      i * D890_DTMF.ENCODE_STRIDE
    );
  }
  return out;
}
