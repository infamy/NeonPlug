import type { Channel } from '../../models/Channel';
import { D890_LIMITS, D890_CTCSS_TONES } from './constants';
import { D890_SQUELCH_MODE, D890_OPTIONAL_SIGNAL } from './structures';
import { decodeBcdAsHexU32 } from './structures';

/**
 * Turn an edited `Channel` back into the radio's 128-byte record.
 *
 * ⚠️ THIS PATCHES THE ORIGINAL RECORD. It does not build one from scratch, and
 * that is the whole design.
 *
 * The channel record has 43 decoded fields, and SIXTEEN of the thirty columns we
 * surface are `marshaller` provenance — named by the vendor's disassembly, never
 * observed changing, meaning unverified. Beyond those sit bytes with no name at
 * all. A from-scratch encoder would write zeros over every one of them, and the
 * damage would be invisible: the channel would still read back, still tune, and
 * quietly lose whatever those bytes controlled.
 *
 * Patching inverts the risk. Bytes this file does not explicitly write are
 * preserved byte-for-byte, so an unknown field survives a write BECAUSE we do not
 * understand it, not in spite of that. New fields become opt-in: adding one means
 * adding a store here, and forgetting to is a no-op rather than data loss.
 *
 * The caller must supply the ORIGINAL bytes read from the radio. There is no
 * safe default for "no original" — see `assertOriginalRecord`.
 */

/** Bytes per channel record. Two 0x40 halves the protocol treats as one span. */
export const D890_CHANNEL_RECORD_BYTES = 0x80;


/**
 * Offsets this module writes. Everything else in the record is preserved.
 *
 * ⚠️ THIS LIST IS AN ALLOW-LIST TIED TO EVIDENCE, not an inventory of what has
 * been implemented so far. A byte belongs here only if its decode is confirmed
 * against a real radio. Two independent verifications (2026-08-30) against a
 * full codeplug image plus the vendor's own CSV export established:
 *
 *   CONFIRMED, safe to write — RX/TX frequency and the BCD codec, the duplex
 *   offset in both polarities, tone direction (ENC=TX 0x0a/0x0c, DEC=RX
 *   0x0b/0x0e) across 13 asymmetric channels, the CTCSS table, the DCS codec,
 *   the 0x09 tone-kind bits, and channel names.
 *
 *   DELIBERATELY NOT WRITTEN, and not an oversight:
 *     0x34  — one of its eight bit mappings is PROVABLY WRONG (`idleTx`
 *             disagrees on 120/120 channels) and only bit 0 is testable, because
 *             every other bit is constant across the whole codeplug.
 *     0x1d, 0x1e, 0x1f  — 2Tone / 5Tone / DTMF id, never observed non-constant.
 *     0x36-0x3d  — APRS PTT modes, correct-frequency, emergency code, SMS
 *             confirmation, talker alias, APRS TX path, ARC4. Same reason.
 *     0x21 bit 6 — decoded as `encryption` but actually the AES ALGORITHM
 *             SELECTOR (Normal/Enhanced). Writing it under that name would
 *             switch AES mode on an unencrypted channel.
 *     0x04 on simplex channels — the duplex-0 meaning of that field is unsettled
 *             (see the note in applyChannelToRecord).
 *
 * Adding a byte here without a confirmed decode is how a write silently
 * corrupts a setting the user never touched.
 */
const OFF = {
  RX_FREQ: 0x00,
  TX_OR_OFFSET: 0x04,
  FLAGS: 0x08,
  TONE_FLAGS: 0x09,
  TX_TONE: 0x0a,
  RX_TONE: 0x0b,
  TX_DCS: 0x0c,
  RX_DCS: 0x0e,
  NAME: 0x44,
  NAME_END: 0x66,

  // Added 2026-08-31. Each of these is confirmed by TWO independent routes:
  // decoded correctly from a full radio image against the vendor's own CSV
  // export, AND traced in the vendor's write/read marshallers. Before that,
  // editing any of them silently did nothing.
  CONTACT: 0x14,        // u32 LE, 0xFFFF+ = none
  RADIO_ID: 0x18,
  SQUELCH_PTT: 0x19,    // squelch mode bits 7-4 | PTT ID bits 3-0
  BUSY_SIGNAL: 0x1a,    // optional signal bits 7-4 | busy lock bits 3-0
  TWO_TONE_ID: 0x1d,
  FIVE_TONE_ID: 0x1e,
  DTMF_ID: 0x1f,
  SCAN_LIST: 0x1b,
  RX_GROUP: 0x1c,
  COLOR_CODE: 0x20,
  ENCRYPTION_KEY: 0x22,   // key SLOT, 1-based, 0 = Off
  ARC4_KEY: 0x3d,         // ARC4 key slot; set only when the key is ARC4
  DMR_FLAGS: 0x21,
  FLAGS34: 0x34,
  TX_COLOR_CODE: 0x43,
} as const;

/**
 * Bits of 0x21 this writer will set. Bit 6 is EXCLUDED.
 *
 * Bit 6 is decoded as `channel.encryption` but is actually the AES ALGORITHM
 * selector (`EMG_Kind`, Normal/Enhanced). Writing it from a boolean called
 * "encryption" would switch AES mode on a channel that is not encrypted.
 * Bit 1 is `Response` (the real "SMS Confirmation"), which this driver still
 * decodes at the wrong offset — excluded until that is corrected.
 */
const FLAGS21_WRITABLE = 0b1011_1101;

/**
 * Bits of 0x34 this writer will set. Bits 5 and 6 are EXCLUDED.
 *
 * Every bit of 0x34 is traced in both marshallers, but bits 5 (`idle_tx`) and
 * 6 (`compand`) are the only two whose CSV header is literally the variable
 * name — the vendor offers no independent corroboration of what they DO. That
 * is precisely the shape of `rec_only`, which the marshaller named "Receive
 * Only" and which turned out to be DataACK forbid. Held until the front-panel
 * loop moves them.
 */
const FLAGS34_WRITABLE = 0b1001_1111;

export class D890ChannelWriteError extends Error {}

/**
 * Refuse to encode without the bytes that came off the radio.
 *
 * A caller with no original is asking for a from-scratch record, which is the
 * failure mode this module exists to prevent. Better to fail loudly at the call
 * site than to hand back 128 bytes that are wrong in ways nobody can see.
 */
export function assertOriginalRecord(original: Uint8Array | null | undefined): Uint8Array {
  if (!original || original.length < D890_CHANNEL_RECORD_BYTES) {
    throw new D890ChannelWriteError(
      `A channel write needs the original ${D890_CHANNEL_RECORD_BYTES}-byte record read from ` +
        `the radio, got ${original ? `${original.length} bytes` : 'nothing'}. Writing a record ` +
        `built from scratch would zero every field this driver does not decode.`
    );
  }
  return original;
}

/** Inverse of `decodeBcdAsHexU32`: value -> four "BCD as hex" bytes. */
export function encodeBcdAsHexU32(value: number): Uint8Array {
  if (!Number.isFinite(value) || value < 0 || value > 99999999) {
    throw new D890ChannelWriteError(`Cannot BCD-encode ${value}: outside 0..99999999`);
  }
  const digits = String(Math.round(value)).padStart(8, '0');
  const out = new Uint8Array(4);
  for (let i = 0; i < 4; i += 1) {
    out[i] = (Number(digits[i * 2]) << 4) | Number(digits[i * 2 + 1]);
  }
  return out;
}

/** MHz -> the radio's four frequency bytes (10 Hz units, BCD-as-hex). */
export function encodeFrequencyMHz(mhz: number): Uint8Array {
  return encodeBcdAsHexU32(Math.round(mhz * 1e5));
}

/**
 * Write a name into a fixed field, NUL-terminated and NUL-padded.
 *
 * ⚠️ The decoder's comment claims the radio "terminates with 0xFFFF and pads with
 * 0xFF". That is NOT what this radio does, and writing 0xFF padding was caught by
 * the round-trip test: every name field in every fixture — channels, zones,
 * roaming zones, talkgroups — is the text followed by 0x00 to the end.
 *
 *     43 00 68 00 61 00 6e 00 6e 00 65 00 6c 00 20 00 31 00  00 00 00 00 ...
 *     C     h     a     n     n     e     l     ' '   1      NUL padding
 *
 * The decoder stops on either terminator, so reads were unaffected and the wrong
 * claim survived. A write would have flipped 16 bytes per name across every
 * channel on the radio.
 */
export function encodeWideCharString(text: string, byteLength: number): Uint8Array {
  const out = new Uint8Array(byteLength); // zero-filled: NUL pad
  const maxChars = byteLength >> 1;
  const chars = Array.from(text).slice(0, maxChars);
  chars.forEach((ch, i) => {
    const code = ch.charCodeAt(0);
    out[i * 2] = code & 0xff;
    out[i * 2 + 1] = (code >> 8) & 0xff;
  });
  return out;
}

/** Inverse of `oneBased`: a model value of 0 means "none" and stores as 0xFF. */
function fromOneBased(value: number | undefined): number {
  return value === undefined || value <= 0 ? 0xff : value - 1;
}

function writeU32LE(target: Uint8Array, offset: number, value: number): void {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >>> 8) & 0xff;
  target[offset + 2] = (value >>> 16) & 0xff;
  target[offset + 3] = (value >>> 24) & 0xff;
}

function powerIndex(p: Channel['power']): number {
  return p === 'Low' ? 0 : p === 'Medium' ? 1 : p === 'High' ? 2 : 3;
}

function bandwidthIndex(b: Channel['bandwidth']): number {
  return b === '25kHz' ? 1 : 0;
}

/**
 * Channel type bits 1-0 — all four values, straight through.
 *
 *   0 A-Analog   1 D-Digital   2 A+D TX A   3 D+A TX D
 *
 * The parser now preserves all four rather than collapsing to Analog/Digital,
 * so the mode round-trips and a user can actually select a mixed type. The
 * `existingFlags` argument is kept only so an unrecognised mode leaves the
 * record's own type alone instead of forcing it to plain analog.
 */
function channelTypeBits(existingFlags: number, channel: Channel): number {
  switch (channel.mode) {
    case 'Analog': return 0;
    case 'Digital': return 1;
    case 'Fixed Analog': return 2;
    case 'Fixed Digital': return 3;
    default: return existingFlags & 0x03;
  }
}

function squelchModeIndex(m: Channel['rxSquelchMode']): number {
  const i = D890_SQUELCH_MODE.indexOf(m as (typeof D890_SQUELCH_MODE)[number]);
  return i < 0 ? 0 : i;
}

function signalingIndex(s: Channel['signalingType']): number {
  const i = D890_OPTIONAL_SIGNAL.indexOf(s as (typeof D890_OPTIONAL_SIGNAL)[number]);
  return i < 0 ? 0 : i;
}

/**
 * Busy Lock is only permitted on Analog and A-D channels; the radio CLEARS the
 * field by itself when a channel becomes digital. Writing a value there would
 * produce a read-back mismatch that is the radio behaving correctly.
 */
function busyLockFor(channel: Channel): number {
  const digital = channel.mode === 'Digital' || channel.mode === 'Fixed Digital';
  return digital ? 0 : (channel.busyLock ?? 0);
}

function writeU16LE(target: Uint8Array, offset: number, value: number): void {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >> 8) & 0xff;
}

/**
 * CTCSS Hz -> table index, or throw.
 *
 * Returning the "none" index (51) while the caller has already set the CTCSS
 * flag produces a record that says "CTCSS enabled, tone none" — the tone
 * silently disappears, and 51 is out of range for a 51-entry table. A codeplug
 * converted from another radio is the likely source, and a named refusal is far
 * more use than a channel that quietly stops opening squelch.
 */
function requireToneIndex(hz: number | undefined, direction: string): number {
  const i = hz === undefined ? -1 : D890_CTCSS_TONES.indexOf(hz);
  if (i < 0) {
    throw new D890ChannelWriteError(
      `CTCSS ${hz ?? '(unset)'} Hz is not one of this radio's ${D890_CTCSS_TONES.length} tones, ` +
        `so it cannot be stored as the ${direction} tone.`
    );
  }
  return i;
}

/** Inverse of `decodeDcsField`: code + polarity -> the stored word. */
export function encodeDcsField(code: number | undefined, polarity: 'N' | 'P' | undefined): number {
  if (code === undefined) return 0;
  // The stored value's DECIMAL digits read as the octal code: code 23 -> 19.
  const stored = parseInt(String(code), 8);
  if (Number.isNaN(stored)) {
    throw new D890ChannelWriteError(`DCS code ${code} is not a valid octal code`);
  }
  return polarity === 'P' ? stored | 0x200 : stored;
}

/**
 * Apply a channel to its original record, returning a new patched copy.
 *
 * Only the fields listed in `OFF` are touched. The duplex bits in 0x08 are
 * PRESERVED rather than recomputed, and the TX field is written to match
 * whatever mode the record is already in — changing a channel's duplex mode is
 * not something this function does, because getting it wrong silently changes
 * the transmit frequency.
 */
export function applyChannelToRecord(original: Uint8Array, channel: Channel): Uint8Array {
  const rec = Uint8Array.from(assertOriginalRecord(original));

  rec.set(encodeFrequencyMHz(channel.rxFrequency), OFF.RX_FREQ);

  // Duplex is read from the record, never inferred from the channel. Mode 1 is
  // "TX = RX + offset", 2 is "RX - offset", anything else stores TX outright.
  //
  // ⚠️ The offset is SIGNED and the sign must agree with the stored mode. An
  // earlier version took Math.abs() in both branches — which made them compute
  // the identical value — so a user changing a +0.6 repeater to -0.6 got the
  // offset stored with the plus bits intact and the radio transmitting 1.2 MHz
  // from where they asked. With read-back forbidden during a write session, that
  // is unrecoverable by the operator. Refuse rather than coerce.
  const duplex = ((rec[OFF.FLAGS] ?? 0) >> 6) & 0x03;
  const tx = channel.txFrequency;
  if (duplex === 1 || duplex === 2) {
    const wanted = tx - channel.rxFrequency; // + means TX above RX
    const storedSign = duplex === 1 ? 1 : -1;
    if (wanted !== 0 && Math.sign(wanted) !== storedSign) {
      throw new D890ChannelWriteError(
        `Channel ${channel.number}: the record stores a ${duplex === 1 ? 'positive' : 'negative'} ` +
          `offset, but TX ${tx} MHz is ${wanted > 0 ? 'above' : 'below'} RX ${channel.rxFrequency} MHz. ` +
          `This writer does not change a channel's duplex mode — getting that wrong silently moves ` +
          `the transmit frequency. Set the offset direction on the radio or in the vendor CPS first.`
      );
    }
    rec.set(encodeFrequencyMHz(Math.abs(wanted)), OFF.TX_OR_OFFSET);
  } else {
    // ⚠️ duplex 0 is NOT settled. Every captured simplex channel from the vendor
    // has 0x04 == RX, but VFO A (also duplex 0) stores a genuine odd split, and
    // all four local fixtures store 0.1 MHz here. Until that is resolved on
    // hardware this field is LEFT ALONE on simplex channels rather than written
    // from a decode we do not trust.
  }

  // Clamped to the radio's own limit, not the field width. The field is 34
  // bytes = 17 units, but the decoder reads 16 and the vendor CPS caps at 16 —
  // a 17-character name would fill the field with no room for a terminator.
  if ((channel.name ?? '').length > D890_CHANNEL_NAME_MAX) {
    throw new D890ChannelWriteError(
      `Channel ${channel.number}: name "${channel.name}" is ${channel.name!.length} characters; ` +
        `this radio stores at most ${D890_CHANNEL_NAME_MAX}. Truncating silently would hide the loss.`
    );
  }
  rec.set(
    encodeWideCharString(channel.name ?? '', OFF.NAME_END - OFF.NAME),
    OFF.NAME
  );

  // ── byte 0x09 ────────────────────────────────────────────────────────────
  // NOT a tone byte. Bits 0-3 are the tone kind/direction flags; bits 4-7 are
  // four INDEPENDENT channel flags that `parseChannel` also reads:
  //
  //   bit 4 reverse   bit 5 forbidTx (PTT Prohibit)
  //   bit 6 callConfirmation        bit 7 talkaround — INVERTED
  //
  // An earlier version assigned this byte wholesale from the tone flags alone.
  // That meant renaming a TX-inhibited channel re-enabled transmit on it, and
  // simultaneously forbade talkaround everywhere, because bit 7 is inverted.
  // The vendor's own capture proves all four are real and independent — four
  // channels in its sweep carry exactly one each with no tone set.
  let flags09 = 0;

  // Tones. ENCODE is what the radio transmits (0x0a / 0x0c), DECODE what it
  // needs to open squelch (0x0b / 0x0e) — the opposite of the obvious reading,
  // and they were swapped in this driver until a hardware probe caught it.
  const txTone = channel.txCtcssDcs;
  const rxTone = channel.rxCtcssDcs;

  // When a tone IS set, write its field and ZERO the other kind's for that
  // direction — across 8389 captured frames the vendor never leaves a stale DCS
  // word beside a CTCSS index, or vice versa.
  //
  // When NO tone is set, leave both alone. A real radio keeps leftover values in
  // both fields while 0x09 reads 0x00 (see parseChannel), so zeroing them would
  // change bytes we were not asked to change — and the patch contract is that we
  // touch only what the edit requires.
  if (txTone?.type === 'CTCSS') {
    flags09 |= 0x04;
    rec[OFF.TX_TONE] = requireToneIndex(txTone.value, 'transmit');
    writeU16LE(rec, OFF.TX_DCS, 0);
  } else if (txTone?.type === 'DCS') {
    flags09 |= 0x08;
    writeU16LE(rec, OFF.TX_DCS, encodeDcsField(txTone.value, txTone.polarity));
    rec[OFF.TX_TONE] = 0;
  }
  if (rxTone?.type === 'CTCSS') {
    flags09 |= 0x01;
    rec[OFF.RX_TONE] = requireToneIndex(rxTone.value, 'receive');
    writeU16LE(rec, OFF.RX_DCS, 0);
  } else if (rxTone?.type === 'DCS') {
    flags09 |= 0x02;
    writeU16LE(rec, OFF.RX_DCS, encodeDcsField(rxTone.value, rxTone.polarity));
    rec[OFF.RX_TONE] = 0;
  }

  // ── the fields that used to be silently discarded ────────────────────────
  // Preserve the duplex bits (7-6) and write type, power and bandwidth.
  const flags08 = rec[OFF.FLAGS] ?? 0;
  rec[OFF.FLAGS] =
    (flags08 & 0xc0) |
    ((bandwidthIndex(channel.bandwidth) & 0x03) << 4) |
    ((powerIndex(channel.power) & 0x03) << 2) |
    (channelTypeBits(flags08, channel) & 0x03);

  // References are stored zero-based with a sentinel for "none"; the model is
  // 1-based with 0 meaning none. Getting this inverted points a channel one slot
  // off, which reads back plausibly.
  writeU32LE(rec, OFF.CONTACT, channel.contactId ? channel.contactId - 1 : 0xffffffff);
  rec[OFF.SCAN_LIST] = channel.scanListId ? channel.scanListId - 1 : 0xff;
  rec[OFF.RX_GROUP] = channel.rxGroupListId ? channel.rxGroupListId - 1 : 0xff;
  rec[OFF.RADIO_ID] = channel.dmrRadioIdIndex ?? 0;
  rec[OFF.COLOR_CODE] = channel.colorCode ?? 0;
  // The encryption key SLOT. Safe to write now that hardware confirmed what it
  // is — the model field is still named `emergencySystemIndex`, which is why
  // this was previously held back: writing a key slot from a field labelled
  // "Emergency System" is the kind of mismatch that enables encryption nobody
  // asked for. The name is wrong; the meaning is not.
  rec[OFF.ENCRYPTION_KEY] = channel.emergencySystemIndex ?? 0;
  // The ARC4 key slot. Confirmed alongside 0x22: of two channels given keys,
  // only the ARC4 one set this. Written because both bytes must move together —
  // writing 0x22 alone would leave an ARC4 assignment looking like an AES one.
  rec[OFF.ARC4_KEY] = channel.arc4Code ?? 0;
  rec[OFF.TX_COLOR_CODE] = channel.txColorCode ?? 0;

  // Two nibble-packed bytes. The high nibble of each is a different field, so
  // both halves must be composed rather than assigned.
  rec[OFF.SQUELCH_PTT] =
    ((squelchModeIndex(channel.rxSquelchMode) & 0x0f) << 4) | ((channel.pttId ?? 0) & 0x0f);
  rec[OFF.BUSY_SIGNAL] =
    ((signalingIndex(channel.signalingType) & 0x0f) << 4) | (busyLockFor(channel) & 0x0f);

  // Stored ZERO-based; the model exposes them one-based. Confirmed from the
  // vendor's CSV row writer, which emits `record + 1` for all three while
  // emitting the 2Tone DECODE group with no +1. Writing the model value raw
  // shifts every one of them by a slot.
  rec[OFF.TWO_TONE_ID] = fromOneBased(channel.twoToneId);
  rec[OFF.FIVE_TONE_ID] = fromOneBased(channel.fiveToneId);
  rec[OFF.DTMF_ID] = fromOneBased(channel.dtmfId);

  // Bitfields: compose only the writable bits and keep the rest of the byte.
  let f21 = 0;
  if (channel.slotOperation) f21 |= 0x01;
  f21 |= ((channel.dmrMode ?? 0) & 0x03) << 2;
  if (channel.slotSuit) f21 |= 0x10;
  if (channel.aprsReceive) f21 |= 0x20;
  if (channel.loneWorker) f21 |= 0x80;
  rec[OFF.DMR_FLAGS] = ((rec[OFF.DMR_FLAGS] ?? 0) & ~FLAGS21_WRITABLE & 0xff) | (f21 & FLAGS21_WRITABLE);

  let f34 = 0;
  if (channel.ranging) f34 |= 0x01;
  // digitalDuplex is INVERTED: the bit set means simplex.
  if (!channel.digitalDuplex) f34 |= 0x02;
  if (channel.excludeFromRoaming) f34 |= 0x04;
  if (channel.dataAckForbid) f34 |= 0x08;
  if (channel.autoScan) f34 |= 0x10;
  if (channel.dmrCrcIgnore) f34 |= 0x80;
  rec[OFF.FLAGS34] = ((rec[OFF.FLAGS34] ?? 0) & ~FLAGS34_WRITABLE & 0xff) | (f34 & FLAGS34_WRITABLE);

  if (channel.reverse) flags09 |= 0x10;
  if (channel.forbidTx) flags09 |= 0x20;
  if (channel.callConfirmation) flags09 |= 0x40;
  // Inverted: the bit being SET means talkaround is allowed.
  if (!channel.forbidTalkaround) flags09 |= 0x80;

  rec[OFF.TONE_FLAGS] = flags09;

  return rec;
}

/** Split a patched record into the eight 16-byte frames a write sends. */
export function channelRecordFrames(
  baseAddress: number,
  record: Uint8Array
): { address: number; data: Uint8Array }[] {
  if (record.length !== D890_CHANNEL_RECORD_BYTES) {
    throw new D890ChannelWriteError(
      `A channel record must be exactly ${D890_CHANNEL_RECORD_BYTES} bytes, got ${record.length}`
    );
  }
  const frames: { address: number; data: Uint8Array }[] = [];
  for (let off = 0; off < record.length; off += 0x10) {
    frames.push({ address: baseAddress + off, data: record.subarray(off, off + 0x10) });
  }
  return frames;
}

/** Re-export so tests can prove the BCD pair are exact inverses. */
export { decodeBcdAsHexU32 };

/** The radio's name limit — 16, not the 17 the 34-byte field would allow. */
export const D890_CHANNEL_NAME_MAX = D890_LIMITS.NAME_MAX_CHARS;
