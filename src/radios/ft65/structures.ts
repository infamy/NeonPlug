/**
 * Pure parse/encode functions for the FT-65/FT-4/FT-25 memory image.
 */

import type { Channel, CTCSSDCS } from '../../models/Channel';
import {
  FT65_MAX_CHANNELS, FT65_CHANNEL_SIZE, FT65_ADDR_CHANNELS,
  FT65_ADDR_ENABLE, FT65_ADDR_NAMES, FT65_ADDR_TXFREQS,
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
  // Clear the full 8-byte slot first, then write up to maxLen chars
  image.fill(0x00, base, base + NAME_SLOT_LEN);
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

  // Offset: little-endian uint16 × offsetFactor (Hz)
  const offsetRaw = s[slotBase + SLOT.OFFSET] | (s[slotBase + SLOT.OFFSET + 1] << 8);
  const offsetHz = offsetRaw * offsetFactor;
  const offsetMhz = offsetHz / 1_000_000;

  const duplexField = s[slotBase + SLOT.DUPLEX] & 0x7;
  let txMhz: number;
  if (duplexField === DUPLEX.SPLIT) {
    txMhz = decodeBCDFreq(s, FT65_ADDR_TXFREQS + idx * 4);
  } else if (duplexField === DUPLEX.PLUS || duplexField === DUPLEX.AUTO) {
    txMhz = rxMhz + offsetMhz;
  } else if (duplexField === DUPLEX.MINUS) {
    txMhz = rxMhz - offsetMhz;
  } else {
    txMhz = rxMhz; // simplex
  }

  const sqlType = s[slotBase + SLOT.SQL_TYPE];
  const txCtcssCode = s[slotBase + SLOT.TX_CTCSS];
  const rxCtcssCode = s[slotBase + SLOT.RX_CTCSS];
  const txDcsCode   = s[slotBase + SLOT.TX_DCS];
  const rxDcsCode   = s[slotBase + SLOT.RX_DCS];

  let txCtcssDcs: CTCSSDCS = { type: 'None' };
  let rxCtcssDcs: CTCSSDCS = { type: 'None' };

  switch (sqlType) {
    case SQL.T_TONE:
    case SQL.TSQL:
      txCtcssDcs = decodeCTCSS(txCtcssCode);
      rxCtcssDcs = decodeCTCSS(rxCtcssCode || txCtcssCode);
      break;
    case SQL.R_TONE:
      rxCtcssDcs = decodeCTCSS(rxCtcssCode);
      break;
    case SQL.DCS:
      txCtcssDcs = decodeDCS(txDcsCode);
      rxCtcssDcs = decodeDCS(rxDcsCode || txDcsCode);
      break;
    case SQL.REV_TN:
      rxCtcssDcs = { type: 'None' }; // reverse tone = squelch opens without tone
      break;
  }

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
 * Write one channel back into the memory image.
 * Caller must clear the channel regions first (see clearChannelRegions).
 * maxNameLen: 8 for FT-65/FT-25, 6 for FT-4.
 */
export function encodeChannel(image: Uint8Array, ch: Channel, offsetFactor: number, maxNameLen = 8): void {
  const idx = ch.number - 1;
  const slotBase = FT65_ADDR_CHANNELS + idx * FT65_CHANNEL_SIZE;

  // Clear slot (in case caller didn't pre-clear)
  image.fill(0x00, slotBase, slotBase + FT65_CHANNEL_SIZE);

  // Frequency (rx)
  encodeBCDFreq(ch.rxFrequency, image, slotBase + SLOT.FREQ);

  // Power
  // Three levels only; a 'Turbo' arriving from a D890-family codeplug (via
  // Convert) is not in the map and clamps to High via the ?? below.
  const pwrMap: Record<string, number> = { Low: 0, Medium: 1, High: 2 };
  image[slotBase + SLOT.TX_PWR] = pwrMap[ch.power] ?? 2;

  // Bandwidth
  image[slotBase + SLOT.TX_WIDTH] = ch.bandwidth === '12.5kHz' ? 1 : 0;

  // Offset / duplex
  const txMhz = ch.txFrequency;
  const rxMhz = ch.rxFrequency;
  const diffHz = Math.round((txMhz - rxMhz) * 1_000_000);
  if (Math.abs(diffHz) < 100) {
    image[slotBase + SLOT.DUPLEX] = DUPLEX.OFF;
  } else {
    const offsetRaw = Math.round(Math.abs(diffHz) / offsetFactor);
    image[slotBase + SLOT.OFFSET] = offsetRaw & 0xff;
    image[slotBase + SLOT.OFFSET + 1] = (offsetRaw >> 8) & 0xff;
    image[slotBase + SLOT.DUPLEX] = diffHz > 0 ? DUPLEX.PLUS : DUPLEX.MINUS;
  }

  // CTCSS / DCS
  const hasTxTone = ch.txCtcssDcs.type !== 'None';
  const hasRxTone = ch.rxCtcssDcs.type !== 'None';

  if (hasTxTone && hasRxTone) {
    image[slotBase + SLOT.SQL_TYPE] = SQL.TSQL;
  } else if (hasTxTone) {
    image[slotBase + SLOT.SQL_TYPE] = SQL.T_TONE;
  } else if (hasRxTone) {
    image[slotBase + SLOT.SQL_TYPE] = SQL.R_TONE;
  } else {
    image[slotBase + SLOT.SQL_TYPE] = SQL.OFF;
  }

  if (ch.txCtcssDcs.type === 'CTCSS') {
    image[slotBase + SLOT.TX_CTCSS] = encodeCTCSS(ch.txCtcssDcs);
  } else if (ch.txCtcssDcs.type === 'DCS') {
    image[slotBase + SLOT.TX_DCS] = encodeDCS(ch.txCtcssDcs);
  }

  if (ch.rxCtcssDcs.type === 'CTCSS') {
    image[slotBase + SLOT.RX_CTCSS] = encodeCTCSS(ch.rxCtcssDcs);
  } else if (ch.rxCtcssDcs.type === 'DCS') {
    image[slotBase + SLOT.RX_DCS] = encodeDCS(ch.rxCtcssDcs);
  }

  // Name and enable bit
  encodeName(image, idx, ch.name, maxNameLen);
  setChannelEnabled(image, idx, true);
}

/**
 * Zero out all channel-data regions before re-encoding.
 * Must be called before the encodeChannel loop in writeChannels.
 */
export function clearChannelRegions(image: Uint8Array): void {
  // Channel slots
  image.fill(0x00, FT65_ADDR_CHANNELS, FT65_ADDR_CHANNELS + FT65_MAX_CHANNELS * FT65_CHANNEL_SIZE);
  // Enable + scan bitmaps
  image.fill(0x00, FT65_ADDR_ENABLE, FT65_ADDR_ENABLE + 64);
  // Name slots (8 bytes each × 220 entries)
  image.fill(0x00, FT65_ADDR_NAMES, FT65_ADDR_NAMES + 220 * 8);
  // TX freq slots (4 bytes each × 220 entries)
  image.fill(0x00, FT65_ADDR_TXFREQS, FT65_ADDR_TXFREQS + 220 * 4);
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
