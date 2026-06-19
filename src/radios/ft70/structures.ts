/**
 * Pure parse/encode functions for the FT-70D memory image.
 * Layout from CHIRP chirp/drivers/ft70.py MEM_FORMAT.
 */

import type { Channel, CTCSSDCS } from '../../models/Channel';
import {
  FT70_MAX_CHANNELS, FT70_CHANNEL_SIZE, FT70_ADDR_FLAGS, FT70_ADDR_CHANNELS,
  FT70_ADDR_CHECKSUM, MEM, FT70_DUPLEX,
  FT70_CTCSS_TONES, FT70_DCS_CODES, FT70_POWER_LEVELS,
} from './constants';
import { createDefaultChannel } from '../../utils/channelHelpers';

// ---------------------------------------------------------------------------
// 3-byte big-endian BCD frequency codec (radio stores frequencies in kHz)
// ---------------------------------------------------------------------------

/** Decode 3-byte big-endian BCD (6 decimal digits) to kHz. */
export function decodeBCDkHz(bytes: Uint8Array, offset = 0): number {
  let val = 0;
  for (let i = 0; i < 3; i++) {
    const b = bytes[offset + i];
    val = val * 100 + (b >> 4) * 10 + (b & 0xf);
  }
  return val;
}

/** Encode a kHz value to 3-byte big-endian BCD (6 decimal digits). */
export function encodeBCDkHz(khz: number, out: Uint8Array, offset = 0): void {
  let val = Math.round(khz);
  for (let i = 2; i >= 0; i--) {
    const lo = val % 10; val = Math.floor(val / 10);
    const hi = val % 10; val = Math.floor(val / 10);
    out[offset + i] = (hi << 4) | lo;
  }
}

// ---------------------------------------------------------------------------
// Checksum: sum of bytes [0x0000, 0xFEC9] mod 256, stored at 0xFECA.
// ---------------------------------------------------------------------------

export function computeChecksum(image: Uint8Array): number {
  let sum = 0;
  for (let i = 0; i <= 0xfec9; i++) sum += image[i];
  return sum & 0xff;
}

export function applyChecksum(image: Uint8Array): void {
  image[FT70_ADDR_CHECKSUM] = computeChecksum(image);
}

// ---------------------------------------------------------------------------
// flag[] bitfield (1 byte/channel): nosubvfo:1, unknown:3, pskip:1, skip:1, used:1, valid:1
// ---------------------------------------------------------------------------

function flagOffset(idx: number): number {
  return FT70_ADDR_FLAGS + idx;
}

function isValid(byte: number): boolean { return (byte & 0x01) !== 0; }
function isUsed(byte: number): boolean { return (byte & 0x02) !== 0; }
function isSkip(byte: number): boolean { return (byte & 0x04) !== 0; }
function isPskip(byte: number): boolean { return (byte & 0x08) !== 0; }

function isNoSubVfo(rxFrequencyMhz: number): boolean {
  const hz = rxFrequencyMhz * 1_000_000;
  return hz < 30_000_000 || (hz > 88_000_000 && hz < 108_000_000) || hz > 580_000_000;
}

// ---------------------------------------------------------------------------
// Name codec: 6-byte ASCII label, 0xFF padded
// ---------------------------------------------------------------------------

const LABEL_LEN = 6;

function decodeLabel(image: Uint8Array, slotBase: number): string {
  let name = '';
  for (let i = 0; i < LABEL_LEN; i++) {
    const b = image[slotBase + MEM.LABEL + i];
    if (b === 0xff) break;
    name += String.fromCharCode(b);
  }
  return name.trimEnd();
}

function encodeLabel(image: Uint8Array, slotBase: number, name: string): void {
  image.fill(0xff, slotBase + MEM.LABEL, slotBase + MEM.LABEL + LABEL_LEN);
  const capped = name.slice(0, LABEL_LEN);
  for (let i = 0; i < capped.length; i++) {
    image[slotBase + MEM.LABEL + i] = capped.charCodeAt(i) & 0xff;
  }
}

// ---------------------------------------------------------------------------
// Tone / DCS — FT-70 has a single tone+dcs pair per channel (no independent
// TX/RX codes); tone_mode selects which side(s) actually use it:
//   0 ''     no tone
//   1 Tone   TX-encode only
//   2 TSQL   TX-encode + RX-decode, same CTCSS tone
//   3 DTCS   TX+RX, same DCS code (no polarity support on this radio)
// ---------------------------------------------------------------------------

function decodeTone(toneMode: number, toneIdx: number, dcsIdx: number): { rx: CTCSSDCS; tx: CTCSSDCS } {
  switch (toneMode) {
    case 1: {
      const hz = FT70_CTCSS_TONES[toneIdx];
      return { tx: hz != null ? { type: 'CTCSS', value: hz } : { type: 'None' }, rx: { type: 'None' } };
    }
    case 2: {
      const hz = FT70_CTCSS_TONES[toneIdx];
      const tone: CTCSSDCS = hz != null ? { type: 'CTCSS', value: hz } : { type: 'None' };
      return { tx: tone, rx: tone };
    }
    case 3: {
      const code = FT70_DCS_CODES[dcsIdx];
      const dcs: CTCSSDCS = code != null ? { type: 'DCS', value: code, polarity: 'N' } : { type: 'None' };
      return { tx: dcs, rx: dcs };
    }
    default:
      return { tx: { type: 'None' }, rx: { type: 'None' } };
  }
}

/** Returns { toneMode, toneIdx, dcsIdx }. Best effort when tx/rx tones differ (hardware has only one code). */
function encodeTone(tx: CTCSSDCS, rx: CTCSSDCS): { toneMode: number; toneIdx: number; dcsIdx: number } {
  const hasTx = tx.type !== 'None';
  const hasRx = rx.type !== 'None';

  if (tx.type === 'DCS' || rx.type === 'DCS') {
    const code = (tx.type === 'DCS' ? tx.value : rx.value) ?? 0;
    const dcsIdx = FT70_DCS_CODES.findIndex((c) => c === code);
    return { toneMode: 3, toneIdx: 0, dcsIdx: dcsIdx >= 0 ? dcsIdx : 0 };
  }

  const ctcss = hasTx ? tx : hasRx ? rx : null;
  if (!ctcss || ctcss.value == null) return { toneMode: 0, toneIdx: 0, dcsIdx: 0 };
  const toneIdx = FT70_CTCSS_TONES.findIndex((t) => Math.abs(t - ctcss.value!) < 0.05);
  const idx = toneIdx >= 0 ? toneIdx : 0;
  // TSQL when both sides carry a tone (or only RX does — hardware has no RX-only mode).
  const toneMode = hasTx && !hasRx ? 1 : 2;
  return { toneMode, toneIdx: idx, dcsIdx: 0 };
}

// ---------------------------------------------------------------------------
// Channel parse / encode
// ---------------------------------------------------------------------------

export function parseChannel(image: Uint8Array, idx: number): Channel | null {
  const flag = image[flagOffset(idx)];
  if (!isValid(flag) || !isUsed(flag)) return null;

  const slotBase = FT70_ADDR_CHANNELS + idx * FT70_CHANNEL_SIZE;
  const s = image;

  const flags1 = s[slotBase + MEM.FLAGS1];
  const deviation = (flags1 >> 5) & 1; // 0 = wide(FM), 1 = narrow(NFM)

  const modeDuplex = s[slotBase + MEM.MODE_DUPLEX];
  const duplexIdx = (modeDuplex >> 4) & 0x3;

  const rxKhz = decodeBCDkHz(s, slotBase + MEM.FREQ);
  const offsetKhz = decodeBCDkHz(s, slotBase + MEM.OFFSET);
  const rxMhz = rxKhz / 1000;

  let txMhz: number;
  switch (FT70_DUPLEX[duplexIdx]) {
    case '+': txMhz = rxMhz + offsetKhz / 1000; break;
    case '-': txMhz = rxMhz - offsetKhz / 1000; break;
    case 'split': txMhz = offsetKhz / 1000; break;
    default: txMhz = rxMhz;
  }

  const flags2 = s[slotBase + MEM.FLAGS2];
  const power = (flags2 >> 6) & 0x3;
  const toneMode = flags2 & 0xf;

  const toneIdx = s[slotBase + MEM.TONE] & 0x3f;
  const dcsIdx = s[slotBase + MEM.DCS] & 0x7f;
  const { tx: txCtcssDcs, rx: rxCtcssDcs } = decodeTone(toneMode, toneIdx, dcsIdx);

  return createDefaultChannel({
    number: idx + 1,
    name: decodeLabel(image, slotBase),
    rxFrequency: rxMhz,
    txFrequency: txMhz,
    mode: 'Analog',
    bandwidth: deviation ? '12.5kHz' : '25kHz',
    power: FT70_POWER_LEVELS[power] ?? 'High',
    rxCtcssDcs,
    txCtcssDcs,
    scanAdd: !(isSkip(flag) || isPskip(flag)),
  });
}

/** Write one channel back into the memory image. Caller must clear regions first for deletions to take. */
export function encodeChannel(image: Uint8Array, ch: Channel): void {
  const idx = ch.number - 1;
  const slotBase = FT70_ADDR_CHANNELS + idx * FT70_CHANNEL_SIZE;

  image.fill(0x00, slotBase, slotBase + FT70_CHANNEL_SIZE);

  const diffKhz = Math.round((ch.txFrequency - ch.rxFrequency) * 1000);
  const duplexIdx = Math.abs(diffKhz) < 1 ? 0 : diffKhz > 0 ? 2 : 1; // '', '+', '-'

  encodeBCDkHz(Math.round(ch.rxFrequency * 1000), image, slotBase + MEM.FREQ);
  encodeBCDkHz(Math.abs(diffKhz), image, slotBase + MEM.OFFSET);

  image[slotBase + MEM.MODE_DUPLEX] = (duplexIdx & 0x3) << 4; // mode=FM(0), tune_step=0(auto)

  const deviation = ch.bandwidth === '12.5kHz' ? 1 : 0;
  image[slotBase + MEM.FLAGS1] = (1 << 7) | (deviation << 5); // display_tag=1 (show name)

  const powerMap: Record<string, number> = { Low: 1, Medium: 2, High: 3 };
  const { toneMode, toneIdx, dcsIdx } = encodeTone(ch.txCtcssDcs, ch.rxCtcssDcs);
  image[slotBase + MEM.FLAGS2] = ((powerMap[ch.power] ?? 3) << 6) | (toneMode & 0xf);
  image[slotBase + MEM.TONE] = toneIdx & 0x3f;
  image[slotBase + MEM.DCS] = dcsIdx & 0x7f;

  encodeLabel(image, slotBase, ch.name);

  const flag = (isNoSubVfo(ch.rxFrequency) ? 0x80 : 0) | 0x02 /* used */ | 0x01 /* valid */
    | (ch.scanAdd === false ? 0x04 /* skip */ : 0);
  image[flagOffset(idx)] = flag;
}

/** Zero out flag[] and memory[] regions before re-encoding, so deleted channels don't leave ghost entries. */
export function clearChannelRegions(image: Uint8Array): void {
  image.fill(0x00, FT70_ADDR_FLAGS, FT70_ADDR_FLAGS + FT70_MAX_CHANNELS);
  image.fill(0x00, FT70_ADDR_CHANNELS, FT70_ADDR_CHANNELS + FT70_MAX_CHANNELS * FT70_CHANNEL_SIZE);
}

/** Parse all 900 channel slots from a full memory image. */
export function parseAllChannels(image: Uint8Array): Channel[] {
  const channels: Channel[] = [];
  for (let i = 0; i < FT70_MAX_CHANNELS; i++) {
    const ch = parseChannel(image, i);
    if (ch) channels.push(ch);
  }
  return channels;
}
