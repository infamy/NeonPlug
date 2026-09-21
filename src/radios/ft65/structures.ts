/**
 * Pure parse/encode functions for the FT-65/FT-4/FT-25 memory image.
 */

import type { Channel, CTCSSDCS } from '../../models/Channel';
import {
  FT65_MAX_CHANNELS, FT65_CHANNEL_SIZE, FT65_ADDR_CHANNELS,
  FT65_ADDR_ENABLE, FT65_ADDR_SCAN, FT65_ADDR_NAMES, FT65_ADDR_TXFREQS,
  SLOT, SQL, DUPLEX,
  CTCSS_TONES, DCS_CODES,
} from './constants';
import { createDefaultChannel } from '../../utils/channelHelpers';

// ---------------------------------------------------------------------------
// BCD frequency codec
// ---------------------------------------------------------------------------

/** Decode 4-byte big-endian BCD to MHz. Radio stores Hz/10. */
export function decodeBCDFreq(bytes: Uint8Array, offset = 0): number {
  let val = 0;
  for (let i = 0; i < 4; i++) {
    const b = bytes[offset + i];
    val = val * 100 + ((b >> 4) * 10) + (b & 0xf);
  }
  return (val * 10) / 1_000_000; // Hz → MHz
}

/** Encode MHz frequency to 4-byte big-endian BCD (Hz/10). */
export function encodeBCDFreq(mhz: number, out: Uint8Array, offset = 0): void {
  let val = Math.round(mhz * 100_000); // val = Hz/10 as integer
  for (let i = 3; i >= 0; i--) {
    const lo = val % 10; val = Math.floor(val / 10);
    const hi = val % 10; val = Math.floor(val / 10);
    out[offset + i] = (hi << 4) | lo;
  }
}

// ---------------------------------------------------------------------------
// Enable bitmap
// ---------------------------------------------------------------------------

export function isChannelEnabled(image: Uint8Array, idx: number): boolean {
  const byte = image[FT65_ADDR_ENABLE + (idx >> 3)];
  return ((byte >> (idx & 7)) & 1) === 1;
}

export function setChannelEnabled(image: Uint8Array, idx: number, enabled: boolean): void {
  const byteIdx = FT65_ADDR_ENABLE + (idx >> 3);
  const bit = idx & 7;
  if (enabled) {
    image[byteIdx] |= (1 << bit);
  } else {
    image[byteIdx] &= ~(1 << bit);
  }
}

// ---------------------------------------------------------------------------
// Scan bitmap, laid out like the enable bitmap: a set bit scans the memory
// and a clear bit skips it, as CHIRP's ft4.py reads it.
// ---------------------------------------------------------------------------

export function isScanIncluded(image: Uint8Array, idx: number): boolean {
  const byte = image[FT65_ADDR_SCAN + (idx >> 3)];
  return ((byte >> (idx & 7)) & 1) === 1;
}

export function setScanIncluded(image: Uint8Array, idx: number, included: boolean): void {
  const byteIdx = FT65_ADDR_SCAN + (idx >> 3);
  const bit = idx & 7;
  if (included) {
    image[byteIdx] |= (1 << bit);
  } else {
    image[byteIdx] &= ~(1 << bit);
  }
}

// ---------------------------------------------------------------------------
// Name codec
// ---------------------------------------------------------------------------

const NAME_SLOT_LEN = 8; // physical bytes per name slot (both FT-65 and FT-4)

export function decodeName(image: Uint8Array, idx: number): string {
  const base = FT65_ADDR_NAMES + idx * NAME_SLOT_LEN;
  let name = '';
  for (let i = 0; i < NAME_SLOT_LEN; i++) {
    const b = image[base + i];
    if (b === 0x00 || b === 0xff) break;
    const c = b === 0x7f ? 0x20 : b; // 0x7F (programmed from VFO) → space
    name += String.fromCharCode(c);
  }
  return name.trimEnd();
}

export function encodeName(image: Uint8Array, idx: number, name: string, maxLen = NAME_SLOT_LEN): void {
  const base = FT65_ADDR_NAMES + idx * NAME_SLOT_LEN;
  // Pad the full 8-byte slot with spaces, as CHIRP and the CPS do, then write
  // up to maxLen chars over them.
  image.fill(0x20, base, base + NAME_SLOT_LEN);
  const capped = name.slice(0, maxLen);
  for (let i = 0; i < capped.length; i++) {
    image[base + i] = capped.charCodeAt(i) & 0xff;
  }
}

// ---------------------------------------------------------------------------
// CTCSS / DCS helpers
// ---------------------------------------------------------------------------

function decodeCTCSS(code: number): CTCSSDCS {
  if (code === 0) return { type: 'None' };
  const hz = CTCSS_TONES[code];
  if (hz == null) return { type: 'None' };
  return { type: 'CTCSS', value: hz };
}

function decodeDCS(code: number): CTCSSDCS {
  if (code === 0) return { type: 'None' };
  const n = DCS_CODES[code];
  if (n == null) return { type: 'None' };
  return { type: 'DCS', value: n, polarity: 'N' };
}

function encodeCTCSS(tone: CTCSSDCS): number {
  if (tone.type !== 'CTCSS' || tone.value == null) return 0;
  const idx = CTCSS_TONES.findIndex((t) => t != null && Math.abs(t - tone.value!) < 0.05);
  return idx > 0 ? idx : 0;
}

function encodeDCS(tone: CTCSSDCS): number {
  if (tone.type !== 'DCS' || tone.value == null) return 0;
  const idx = DCS_CODES.findIndex((c) => c === tone.value);
  return idx > 0 ? idx : 0;
}

/** Duplex is the low 3 bits of its byte; the other 5 are the radio's. */
function setDuplex(image: Uint8Array, slotBase: number, duplex: number): void {
  image[slotBase + SLOT.DUPLEX] = (image[slotBase + SLOT.DUPLEX] & ~0x7) | (duplex & 0x7);
}

// ---------------------------------------------------------------------------
// What a slot's own bytes say
//
// A write patches a slot rather than rewriting it, so the encoder has to know
// what the bytes already there mean. These two are the readers both sides use.
// ---------------------------------------------------------------------------

/** The TX frequency the shift bytes in a slot describe, in MHz. */
function decodeTxFrequency(image: Uint8Array, idx: number, offsetFactor: number, rxMhz: number): number {
  const slotBase = FT65_ADDR_CHANNELS + idx * FT65_CHANNEL_SIZE;
  const offsetRaw = image[slotBase + SLOT.OFFSET] | (image[slotBase + SLOT.OFFSET + 1] << 8);
  const offsetMhz = (offsetRaw * offsetFactor) / 1_000_000;
  switch (image[slotBase + SLOT.DUPLEX] & 0x7) {
    case DUPLEX.SPLIT:
      return decodeBCDFreq(image, FT65_ADDR_TXFREQS + idx * 4);
    case DUPLEX.PLUS:
    case DUPLEX.AUTO:
      return rxMhz + offsetMhz;
    case DUPLEX.MINUS:
      return rxMhz - offsetMhz;
    default:
      return rxMhz; // simplex
  }
}

/** The tones the squelch bytes in a slot describe. */
function decodeTones(image: Uint8Array, slotBase: number): { tx: CTCSSDCS; rx: CTCSSDCS } {
  const txCtcssCode = image[slotBase + SLOT.TX_CTCSS];
  const rxCtcssCode = image[slotBase + SLOT.RX_CTCSS];
  const txDcsCode = image[slotBase + SLOT.TX_DCS];
  const rxDcsCode = image[slotBase + SLOT.RX_DCS];
  switch (image[slotBase + SLOT.SQL_TYPE]) {
    case SQL.T_TONE:
    case SQL.TSQL:
      return { tx: decodeCTCSS(txCtcssCode), rx: decodeCTCSS(rxCtcssCode || txCtcssCode) };
    case SQL.R_TONE:
      return { tx: { type: 'None' }, rx: decodeCTCSS(rxCtcssCode) };
    case SQL.DCS:
      return { tx: decodeDCS(txDcsCode), rx: decodeDCS(rxDcsCode || txDcsCode) };
    default:
      // Reverse tone opens the squelch without one, and pager is its own
      // thing; neither is a tone this app can show.
      return { tx: { type: 'None' }, rx: { type: 'None' } };
  }
}

/** Same tone, as far as this radio goes — it has no DCS polarity to compare. */
function sameTone(a: CTCSSDCS, b: CTCSSDCS): boolean {
  if (a.type !== b.type) return false;
  return a.type === 'None' || a.value === b.value;
}

// ---------------------------------------------------------------------------
// Channel parse / encode
// ---------------------------------------------------------------------------

interface SlotInfo {
  enabled: boolean;
  slotBase: number;
  name: string;
  txFreqBase: number;
}

function readSlotInfo(image: Uint8Array, idx: number): SlotInfo {
  return {
    enabled: isChannelEnabled(image, idx),
    slotBase: FT65_ADDR_CHANNELS + idx * FT65_CHANNEL_SIZE,
    name: decodeName(image, idx),
    txFreqBase: FT65_ADDR_TXFREQS + idx * 4,
  };
}

/**
 * Parse one channel from a full memory image.
 * Returns null if the channel slot is disabled/empty.
 */
export function parseChannel(image: Uint8Array, idx: number, offsetFactor: number): Channel | null {
  const { enabled, slotBase, name } = readSlotInfo(image, idx);
  if (!enabled) return null;

  const s = image;
  const rxMhz = decodeBCDFreq(s, slotBase + SLOT.FREQ);
  const txMhz = decodeTxFrequency(s, idx, offsetFactor, rxMhz);
  const { tx: txCtcssDcs, rx: rxCtcssDcs } = decodeTones(s, slotBase);

  const pwrMap: Channel['power'][] = ['Low', 'Medium', 'High'];
  const bandwidth: Channel['bandwidth'] = (s[slotBase + SLOT.TX_WIDTH] & 1) ? '12.5kHz' : '25kHz';

  return createDefaultChannel({
    number: idx + 1,
    name,
    rxFrequency: rxMhz,
    txFrequency: txMhz,
    mode: 'Analog',
    bandwidth,
    power: pwrMap[s[slotBase + SLOT.TX_PWR]] ?? 'High',
    rxCtcssDcs,
    txCtcssDcs,
  });
}

/**
 * Write one channel into the memory image.
 *
 * A slot the radio is already using is PATCHED, not rewritten: the fields
 * below are the ones this app models, and the ones it doesn't — the tuning
 * step at +13, the tone and shift values the CPS leaves on a memory that
 * doesn't use them, the unused byte at +15, the unknown bits of +9 and +12 —
 * keep the bytes the radio wrote. Clearing the whole slot set every memory's
 * step to "auto" on every write (hardware, 2026-09-20: 25 kHz on 53 memories,
 * 12.5 on 44 and 5 on 13, all gone in one write).
 *
 * maxNameLen: 8 for FT-65/FT-25, 6 for FT-4.
 */
export function encodeChannel(image: Uint8Array, ch: Channel, offsetFactor: number, maxNameLen = 8): void {
  const idx = ch.number - 1;
  const slotBase = FT65_ADDR_CHANNELS + idx * FT65_CHANNEL_SIZE;
  // A slot no memory holds can contain anything, including a deleted memory's
  // bytes, so a memory new to one starts from zero.
  const isNewMemory = !isChannelEnabled(image, idx);
  if (isNewMemory) image.fill(0x00, slotBase, slotBase + FT65_CHANNEL_SIZE);

  // Frequency (rx)
  encodeBCDFreq(ch.rxFrequency, image, slotBase + SLOT.FREQ);

  // Power
  // Three levels only; a 'Turbo' arriving from a D890-family codeplug (via
  // Convert) is not in the map and clamps to High via the ?? below.
  const pwrMap: Record<string, number> = { Low: 0, Medium: 1, High: 2 };
  image[slotBase + SLOT.TX_PWR] = pwrMap[ch.power] ?? 2;

  // Bandwidth is bit 0; the rest of that byte is the radio's.
  const narrow = ch.bandwidth === '12.5kHz' ? 1 : 0;
  image[slotBase + SLOT.TX_WIDTH] = (image[slotBase + SLOT.TX_WIDTH] & ~1) | narrow;

  // Offset / duplex, left alone when the slot already describes this TX
  // frequency, so a memory nobody edited keeps the radio's own way of saying
  // it — simplex as 1 rather than 4, an automatic shift as 5.
  if (Math.abs(decodeTxFrequency(image, idx, offsetFactor, ch.rxFrequency) - ch.txFrequency) > 1e-6) {
    const diffHz = Math.round((ch.txFrequency - ch.rxFrequency) * 1_000_000);
    if (Math.abs(diffHz) < 100) {
      setDuplex(image, slotBase, DUPLEX.OFF);
    } else {
      const offsetRaw = Math.round(Math.abs(diffHz) / offsetFactor);
      image[slotBase + SLOT.OFFSET] = offsetRaw & 0xff;
      image[slotBase + SLOT.OFFSET + 1] = (offsetRaw >> 8) & 0xff;
      setDuplex(image, slotBase, diffHz > 0 ? DUPLEX.PLUS : DUPLEX.MINUS);
    }
  }

  // CTCSS / DCS, likewise only when they differ from what the slot holds. The
  // radio has one squelch mode per memory, so a DCS on either side makes the
  // memory DCS and a CTCSS on the other side cannot be kept.
  const tones = decodeTones(image, slotBase);
  if (!sameTone(tones.tx, ch.txCtcssDcs) || !sameTone(tones.rx, ch.rxCtcssDcs)) {
    const usesDcs = ch.txCtcssDcs.type === 'DCS' || ch.rxCtcssDcs.type === 'DCS';
    image[slotBase + SLOT.TX_CTCSS] = !usesDcs ? encodeCTCSS(ch.txCtcssDcs) : 0;
    image[slotBase + SLOT.RX_CTCSS] = !usesDcs ? encodeCTCSS(ch.rxCtcssDcs) : 0;
    image[slotBase + SLOT.TX_DCS] = encodeDCS(ch.txCtcssDcs);
    image[slotBase + SLOT.RX_DCS] = encodeDCS(ch.rxCtcssDcs);
    image[slotBase + SLOT.SQL_TYPE] = usesDcs
      ? SQL.DCS
      : ch.txCtcssDcs.type === 'CTCSS' && ch.rxCtcssDcs.type === 'CTCSS'
        ? SQL.TSQL
        : ch.txCtcssDcs.type === 'CTCSS'
          ? SQL.T_TONE
          : ch.rxCtcssDcs.type === 'CTCSS'
            ? SQL.R_TONE
            : SQL.OFF;
  }

  // Name, scan and enable bit. A memory new to its slot is scanned, as a new
  // memory is in CHIRP; one the radio already had keeps its own scan setting,
  // which this app does not edit.
  //
  // The name is written only when it changed: a memory programmed from the
  // radio's VFO pads its name slot with 0x7f, which reads as a space, and
  // rewriting it with spaces would churn bytes to say the same thing.
  if (decodeName(image, idx) !== ch.name.slice(0, maxNameLen).trimEnd()) {
    encodeName(image, idx, ch.name, maxNameLen);
  }
  if (isNewMemory) setScanIncluded(image, idx, true);
  setChannelEnabled(image, idx, true);
}

/**
 * Delete the regular memories a write doesn't hold, the way CHIRP deletes one:
 * clear its enable bit and nothing else (ft4.py `set_memory` for an empty
 * memory). Every other memory keeps its slot, and so its number.
 *
 * This used to zero whole regions. The scan bitmap sat in the 64 bytes cleared,
 * and a clear bit there means skip, so every write set every memory to skip in
 * scan. The name and TX frequency arrays hold 220 entries, the last 20 for the
 * PMS memories, so every write wiped those as well.
 */
export function clearUnwrittenMemories(image: Uint8Array, written: ReadonlySet<number>): void {
  for (let idx = 0; idx < FT65_MAX_CHANNELS; idx++) {
    if (!written.has(idx)) setChannelEnabled(image, idx, false);
  }
}

/** Parse all 200 channel slots from a full memory image. */
export function parseAllChannels(image: Uint8Array, offsetFactor: number): Channel[] {
  const channels: Channel[] = [];
  for (let i = 0; i < FT65_MAX_CHANNELS; i++) {
    const ch = parseChannel(image, i, offsetFactor);
    if (ch) channels.push(ch);
  }
  return channels;
}
