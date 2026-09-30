/**
 * Radtel RT-950 Pro channel slots: pure parse and patch functions.
 *
 * A slot is 32 bytes (layout from the RT-950 Pro CHIRP driver's notes):
 *
 *   0–3   RX frequency, little-endian BCD in tens of Hz (0xFF… = empty slot)
 *   4–7   TX frequency, the same way
 *   8–9   RX tone, 10–11 TX tone: 0 = none; a low byte of 1–210 with a zero
 *         high byte is DCS (1–105 normal, 106–210 inverted, in DCS_CODES
 *         order); anything else is CTCSS in tenths of Hz, little-endian
 *   12    signalling group (low nibble)       13  PTT ID (low nibble)
 *   14    power (low nibble: 0 high, 1 medium, 2 low), scrambler (high nibble)
 *   15    flags — see FLAG
 *   16–19 frequency-hopping code (0xFF… = none)
 *   20–31 name, GB2312, 0xFF-padded
 *
 * The encoding matches the UV5R-Mini's, its sibling: same BCD, same tones.
 *
 * A slot the radio already uses is PATCHED: only the fields this app models
 * are written, and each only when it changed. Signalling, PTT ID, scrambler,
 * encryption, frequency hopping and the AM bit keep the radio's bytes. (The
 * FT-65 lost every memory's tuning step to an encoder that rewrote whole
 * slots.)
 */

import type { Channel, CTCSSDCS } from '../../models/Channel';
import { createDefaultChannel } from '../../utils/channelHelpers';
import { RT950PRO_CHANNEL_COUNT, RT950PRO_CHANNEL_SIZE, RT950PRO_NAME_LENGTH } from './constants';

const SLOT = {
  RX_FREQ: 0,
  TX_FREQ: 4,
  RX_TONE: 8,
  TX_TONE: 10,
  SIGNAL_GROUP: 12,
  PTT_ID: 13,
  POWER: 14,
  FLAGS: 15,
  FHSS: 16,
  NAME: 20,
} as const;

/** Byte 15. The bits this app writes are NARROW, BUSY_LOCK, SCAN and TX_ENABLED. */
export const FLAG = {
  LEARN_FHSS: 0x80,
  NARROW: 0x40,
  ENCRYPTION: 0x30,
  BUSY_LOCK: 0x08,
  SCAN: 0x04,
  TX_ENABLED: 0x02,
  AM: 0x01,
} as const;

/** The 105 DCS codes, in the radio's order. Index + 1 is normal polarity, index + 106 inverted. */
const DCS_CODES: readonly number[] = [
  23, 25, 26, 31, 32, 36, 43, 47, 51, 53, 54, 65, 71, 72, 73, 74, 114, 115, 116, 122, 125, 131,
  132, 134, 143, 145, 152, 155, 156, 162, 165, 172, 174, 205, 212, 223, 225, 226, 243, 244, 245,
  246, 251, 252, 255, 261, 263, 265, 266, 271, 274, 306, 311, 315, 325, 331, 332, 343, 346, 351,
  356, 364, 365, 371, 411, 412, 413, 423, 431, 432, 445, 446, 452, 454, 455, 462, 464, 465, 466,
  503, 506, 516, 523, 526, 532, 546, 565, 606, 612, 624, 627, 631, 632, 645, 654, 662, 664, 703,
  712, 723, 731, 732, 734, 743, 754,
];

/** Power codes 0–2. A code above 2 reads as low, as the CHIRP driver reads it. */
const POWER_LEVELS: readonly Channel['power'][] = ['High', 'Medium', 'Low'];

/** Airband: the radio receives it in AM and cannot transmit there. */
const isAirband = (mhz: number) => mhz >= 118 && mhz <= 137;

/** One channel's 32 bytes, as a view into the image. */
export function slotOf(image: Uint8Array, number: number): Uint8Array {
  const at = (number - 1) * RT950PRO_CHANNEL_SIZE;
  return image.subarray(at, at + RT950PRO_CHANNEL_SIZE);
}

const isBlank = (bytes: Uint8Array) => bytes.every((b) => b === 0xff) || bytes.every((b) => b === 0x00);

export function isEmptySlot(slot: Uint8Array): boolean {
  return isBlank(slot.subarray(SLOT.RX_FREQ, SLOT.RX_FREQ + 4));
}

// ---------------------------------------------------------------------------
// Frequency: 4 bytes, little-endian BCD, tens of Hz
// ---------------------------------------------------------------------------

/** MHz, or null for a blank field. */
export function decodeFrequency(bytes: Uint8Array): number | null {
  if (isBlank(bytes)) return null;
  let tensOfHz = 0;
  for (let i = 3; i >= 0; i--) tensOfHz = tensOfHz * 100 + (bytes[i] >> 4) * 10 + (bytes[i] & 0x0f);
  return (tensOfHz * 10) / 1_000_000;
}

export function encodeFrequency(mhz: number, out: Uint8Array, at: number): void {
  let tensOfHz = Math.round((mhz * 1_000_000) / 10);
  for (let i = 0; i < 4; i++) {
    const low = tensOfHz % 10;
    tensOfHz = Math.floor(tensOfHz / 10);
    const high = tensOfHz % 10;
    tensOfHz = Math.floor(tensOfHz / 10);
    out[at + i] = (high << 4) | low;
  }
}

const sameFrequency = (a: number, b: number) => Math.abs(a - b) < 0.000005;

// ---------------------------------------------------------------------------
// Tones
// ---------------------------------------------------------------------------

export function decodeTone(low: number, high: number): CTCSSDCS {
  const value = low | (high << 8);
  if (value === 0 || value === 0xffff) return { type: 'None' };
  if (high === 0) {
    const index = low - 1;
    if (index < 0 || index >= DCS_CODES.length * 2) return { type: 'None' };
    return {
      type: 'DCS',
      value: DCS_CODES[index % DCS_CODES.length],
      polarity: index >= DCS_CODES.length ? 'P' : 'N',
    };
  }
  return { type: 'CTCSS', value: value / 10 };
}

/** The two tone bytes. Throws for a DCS code this radio doesn't have, rather than dropping it. */
export function encodeTone(tone: CTCSSDCS): [number, number] {
  if (tone.type === 'CTCSS' && tone.value != null) {
    const tenths = Math.round(tone.value * 10);
    return [tenths & 0xff, (tenths >> 8) & 0xff];
  }
  if (tone.type === 'DCS' && tone.value != null) {
    const index = DCS_CODES.indexOf(tone.value);
    if (index < 0) throw new Error(`DCS ${tone.value} isn't a code the RT-950 Pro has.`);
    return [index + 1 + (tone.polarity === 'P' ? DCS_CODES.length : 0), 0];
  }
  return [0, 0];
}

function sameTone(a: CTCSSDCS, b: CTCSSDCS): boolean {
  if (a.type !== b.type) return false;
  if (a.type === 'None') return true;
  if (a.type === 'CTCSS') return Math.abs((a.value ?? 0) - (b.value ?? 0)) < 0.05;
  return a.value === b.value && (a.polarity ?? 'N') === (b.polarity ?? 'N');
}

// ---------------------------------------------------------------------------
// Name: 12 bytes, GB2312, 0xFF-padded
// ---------------------------------------------------------------------------

let gbDecoder: TextDecoder | null | undefined;

export function decodeName(slot: Uint8Array): string {
  const field = slot.subarray(SLOT.NAME, SLOT.NAME + RT950PRO_NAME_LENGTH);
  let end = field.findIndex((b) => b === 0xff || b === 0x00);
  if (end < 0) end = field.length;
  const bytes = field.subarray(0, end);
  if (bytes.every((b) => b < 0x80)) return String.fromCharCode(...bytes).trimEnd();
  if (gbDecoder === undefined) {
    try {
      gbDecoder = new TextDecoder('gbk');
    } catch {
      gbDecoder = null;
    }
  }
  return (gbDecoder ? gbDecoder.decode(bytes) : String.fromCharCode(...bytes)).trimEnd();
}

/** Printable ASCII only: this app has no way to write GB2312, so other characters are left out. */
function encodeName(slot: Uint8Array, name: string): void {
  const ascii = Array.from(name, (c) => c.charCodeAt(0)).filter((code) => code >= 0x20 && code < 0x7f);
  slot.fill(0xff, SLOT.NAME, SLOT.NAME + RT950PRO_NAME_LENGTH);
  slot.set(ascii.slice(0, RT950PRO_NAME_LENGTH), SLOT.NAME);
}

// ---------------------------------------------------------------------------
// Channels
// ---------------------------------------------------------------------------

export function parseChannel(slot: Uint8Array, number: number): Channel | null {
  const rx = decodeFrequency(slot.subarray(SLOT.RX_FREQ, SLOT.RX_FREQ + 4));
  if (rx === null) return null;
  const tx = decodeFrequency(slot.subarray(SLOT.TX_FREQ, SLOT.TX_FREQ + 4));
  const flags = slot[SLOT.FLAGS];
  return createDefaultChannel({
    number,
    name: decodeName(slot),
    rxFrequency: rx,
    txFrequency: tx ?? rx,
    mode: 'Analog',
    bandwidth: flags & FLAG.NARROW ? '12.5kHz' : '25kHz',
    power: POWER_LEVELS[Math.min(slot[SLOT.POWER] & 0x0f, 2)],
    rxCtcssDcs: decodeTone(slot[SLOT.RX_TONE], slot[SLOT.RX_TONE + 1]),
    txCtcssDcs: decodeTone(slot[SLOT.TX_TONE], slot[SLOT.TX_TONE + 1]),
    scanAdd: (flags & FLAG.SCAN) !== 0,
    busyLock: flags & FLAG.BUSY_LOCK ? 1 : 0,
    forbidTx: (flags & FLAG.TX_ENABLED) === 0,
  });
}

export function parseAllChannels(image: Uint8Array): Channel[] {
  const channels: Channel[] = [];
  for (let number = 1; number <= RT950PRO_CHANNEL_COUNT; number++) {
    const ch = parseChannel(slotOf(image, number), number);
    if (ch) channels.push(ch);
  }
  return channels;
}

/**
 * Write one channel into its slot.
 *
 * A slot no channel held starts from a blank one — 0xFF, as the radio keeps
 * an empty slot — with no tones, signalling or hopping code, full power, and
 * transmit allowed. An airband channel is AM and receive-only there, as the
 * CHIRP driver makes it.
 */
export function encodeChannel(slot: Uint8Array, ch: Channel): void {
  const isNew = isEmptySlot(slot);
  const oldRx = isNew ? null : decodeFrequency(slot.subarray(SLOT.RX_FREQ, SLOT.RX_FREQ + 4));
  if (isNew) {
    slot.fill(0xff);
    slot.fill(0x00, SLOT.RX_TONE, SLOT.TX_TONE + 2);
    slot[SLOT.SIGNAL_GROUP] = 0;
    slot[SLOT.PTT_ID] = 0;
    slot[SLOT.POWER] = 0;
    slot[SLOT.FLAGS] = 0;
  }

  const rxChanged = oldRx === null || !sameFrequency(oldRx, ch.rxFrequency);
  if (rxChanged) {
    encodeFrequency(ch.rxFrequency, slot, SLOT.RX_FREQ);
    // The AM bit follows the band only when the frequency moves; otherwise it
    // is the radio's.
    slot[SLOT.FLAGS] = (slot[SLOT.FLAGS] & ~FLAG.AM) | (isAirband(ch.rxFrequency) ? FLAG.AM : 0);
  }

  const oldTx = isNew ? null : decodeFrequency(slot.subarray(SLOT.TX_FREQ, SLOT.TX_FREQ + 4));
  if (!sameFrequency(oldTx ?? oldRx ?? NaN, ch.txFrequency)) {
    encodeFrequency(ch.txFrequency, slot, SLOT.TX_FREQ);
  }

  for (const [at, tone] of [
    [SLOT.RX_TONE, ch.rxCtcssDcs],
    [SLOT.TX_TONE, ch.txCtcssDcs],
  ] as const) {
    if (isNew || !sameTone(decodeTone(slot[at], slot[at + 1]), tone)) {
      const [low, high] = encodeTone(tone);
      slot[at] = low;
      slot[at + 1] = high;
    }
  }

  const power = ch.power === 'Low' ? 2 : ch.power === 'Medium' ? 1 : 0;
  slot[SLOT.POWER] = (slot[SLOT.POWER] & 0xf0) | power;

  let flags = slot[SLOT.FLAGS] & ~(FLAG.NARROW | FLAG.BUSY_LOCK | FLAG.SCAN | FLAG.TX_ENABLED);
  if (ch.bandwidth === '12.5kHz') flags |= FLAG.NARROW;
  if (ch.busyLock) flags |= FLAG.BUSY_LOCK;
  if (ch.scanAdd) flags |= FLAG.SCAN;
  if (!ch.forbidTx && !isAirband(ch.rxFrequency)) flags |= FLAG.TX_ENABLED;
  slot[SLOT.FLAGS] = flags;

  // The name only when it changed, so a GB2312 name this app can't write
  // survives an edit to anything else.
  if (isNew || decodeName(slot) !== ch.name.slice(0, RT950PRO_NAME_LENGTH).trimEnd()) {
    encodeName(slot, ch.name);
  }
}

/** Empty a slot the way the radio keeps an unused one. */
export function clearSlot(slot: Uint8Array): void {
  slot.fill(0xff);
}

/**
 * Put `channels` into the image: each into its own slot, patched; a slot no
 * channel holds is emptied. Numbers never move — a channel is its slot.
 */
export function applyChannels(image: Uint8Array, channels: readonly Channel[]): void {
  const byNumber = new Map(channels.map((ch) => [ch.number, ch]));
  for (let number = 1; number <= RT950PRO_CHANNEL_COUNT; number++) {
    const slot = slotOf(image, number);
    const ch = byNumber.get(number);
    if (ch) encodeChannel(slot, ch);
    else if (!isEmptySlot(slot)) clearSlot(slot);
  }
}
