/**
 * UV5R-Mini channel format: 32 bytes per channel, BCD freq, tone encode/decode.
 * Ported from chirp-baofeng-uv5rmini.js.
 */

import {
  BAOFENG_CHANNEL_COUNT,
  BAOFENG_CHANNEL_SIZE,
} from './constants';

const DTCS_CODES = Object.freeze(
  [
    23, 25, 26, 31, 32, 36, 43, 47, 51, 53, 54, 65, 71, 72, 73, 74, 114, 115,
    116, 122, 125, 131, 132, 134, 143, 145, 152, 155, 156, 162, 165, 172, 174,
    205, 212, 223, 225, 226, 243, 244, 245, 246, 251, 252, 255, 261, 263, 265,
    266, 271, 274, 306, 311, 315, 325, 331, 332, 343, 346, 351, 356, 364, 365,
    371, 411, 412, 413, 423, 431, 432, 445, 446, 452, 454, 455, 462, 464, 465,
    466, 503, 506, 516, 523, 526, 532, 546, 565, 606, 612, 624, 627, 631, 632,
    654, 662, 664, 703, 712, 723, 731, 732, 734, 743, 754, 645,
  ].sort((a, b) => a - b)
);

export function decodeBcdFreq(bytes: Uint8Array): number {
  const digits: number[] = [];
  for (let i = 0; i < 4; i++) {
    digits.push(bytes[i] & 0x0f, (bytes[i] >> 4) & 0x0f);
  }
  let val = 0;
  let mult = 1;
  for (let i = 0; i < 8; i++) {
    val += digits[i] * mult;
    mult *= 10;
  }
  return val * 10; // tens of Hz -> Hz
}

export function encodeBcdFreq(hz: number): Uint8Array {
  let val = Math.floor(hz / 10);
  const digits: number[] = [];
  for (let i = 0; i < 8; i++) {
    digits.push(val % 10);
    val = Math.floor(val / 10);
  }
  const out = new Uint8Array(4);
  for (let i = 0; i < 4; i++) {
    out[i] = (digits[i * 2 + 1] << 4) | digits[i * 2];
  }
  return out;
}

export function decodeTone(bytes: Uint8Array): { mode: string; str: string; value?: number } {
  const val = bytes[0] | (bytes[1] << 8);
  if (val === 0 || val === 0xffff) return { mode: '', str: '—' };
  if (val >= 0x258) return { mode: 'Tone', str: (val / 10).toFixed(1), value: val / 10 };
  const idx = val > 0x69 ? val - 0x6a : val - 1;
  const code = DTCS_CODES[idx];
  return { mode: 'DTCS', str: code != null ? String(code) : String(val), value: code };
}

export function encodeTone(str: string): Uint8Array {
  if (!str || str === '—' || str.trim() === '') return new Uint8Array([0, 0]);
  const s = str.trim();
  const asNum = parseFloat(s);
  if (
    s.includes('.') &&
    !Number.isNaN(asNum) &&
    asNum >= 0.25 &&
    asNum < 6553.6
  ) {
    const val = Math.round(asNum * 10) >>> 0;
    if (val <= 0xffff) return new Uint8Array([val & 0xff, (val >> 8) & 0xff]);
  }
  const code = parseInt(s, 10);
  if (!Number.isNaN(code)) {
    const idx = DTCS_CODES.indexOf(code);
    if (idx >= 0)
      return new Uint8Array([(idx + 1) & 0xff, ((idx + 1) >> 8) & 0xff]);
  }
  return new Uint8Array([0, 0]);
}

export interface Uv5rMiniChannelRaw {
  num: number;
  empty: boolean;
  rxFreqHz: number;
  txFreqHz: number;
  duplex: string;
  rxtone: string;
  txtone: string;
  power: string;
  mode: string;
  name: string;
  rawBytes: Uint8Array;
}

/** Parse channel list from cloned image (first BAOFENG_CHANNEL_COUNT * 32 bytes). */
export function parseChannelsFromImage(image: Uint8Array): Uv5rMiniChannelRaw[] {
  const channels: Uv5rMiniChannelRaw[] = [];
  for (let i = 0; i < BAOFENG_CHANNEL_COUNT; i++) {
    const offset = i * BAOFENG_CHANNEL_SIZE;
    if (offset + BAOFENG_CHANNEL_SIZE > image.length) break;
    const raw = image.subarray(offset, offset + BAOFENG_CHANNEL_SIZE);
    const empty = raw[0] === 0xff;
    const rxFreqHz = empty ? 0 : decodeBcdFreq(raw.subarray(0, 4));
    let txFreqHz = 0;
    const txAllFF =
      raw[4] === 0xff && raw[5] === 0xff && raw[6] === 0xff && raw[7] === 0xff;
    const txAllZero = raw[4] === 0 && raw[5] === 0 && raw[6] === 0 && raw[7] === 0;
    const txFilled = !empty && !txAllFF && !txAllZero;
    if (txFilled) txFreqHz = decodeBcdFreq(raw.subarray(4, 8));
    const rxtone = decodeTone(raw.subarray(8, 10));
    const txtone = decodeTone(raw.subarray(10, 12));
    let name = '';
    for (let j = 20; j < 32; j++) {
      const c = raw[j];
      if (c === 0xff || c === 0x00) break;
      name += String.fromCharCode(c < 32 ? 32 : c);
    }
    name = name.replace(/\s+$/, '');
    // UV5R-Mini uses inverted bit: 1 = Narrow (NFM), 0 = Wide (FM)
    const wideBit = (raw[15] >> 6) & 1;
    const lowpower = raw[14] & 0x03;
    channels.push({
      num: i + 1,
      empty,
      rxFreqHz,
      txFreqHz,
      duplex: empty ? '' : !txFilled ? 'off' : rxFreqHz === txFreqHz ? '' : txFreqHz > rxFreqHz ? '+' : '-',
      rxtone: rxtone.str,
      txtone: txtone.str,
      power: lowpower === 0 ? 'High' : 'Low',
      mode: wideBit ? 'NFM' : 'FM',
      name: name || '—',
      rawBytes: raw.slice(0, BAOFENG_CHANNEL_SIZE),
    });
  }
  return channels;
}

/** Write one raw channel into image at channelIndex (0-based). */
export function writeChannelToImage(
  image: Uint8Array,
  channelIndex: number,
  raw: Uv5rMiniChannelRaw
): void {
  const offset = channelIndex * BAOFENG_CHANNEL_SIZE;
  if (offset + BAOFENG_CHANNEL_SIZE > image.length)
    throw new Error('Channel index out of range');
  const out = image.subarray(offset, offset + BAOFENG_CHANNEL_SIZE);
  if (raw.empty) {
    out.fill(0xff);
    return;
  }
  out.set(raw.rawBytes);
  out.set(encodeBcdFreq(raw.rxFreqHz), 0);
  if (raw.duplex === 'off') {
    for (let i = 4; i < 8; i++) out[i] = 0xff;
  } else {
    const txHz = raw.txFreqHz || raw.rxFreqHz;
    out.set(encodeBcdFreq(txHz), 4);
  }
  out.set(encodeTone(raw.rxtone), 8);
  out.set(encodeTone(raw.txtone), 10);
  const nameStr = (raw.name || '').trim().slice(0, 12);
  const nameBytes = new TextEncoder().encode(nameStr);
  for (let i = 20; i < 32; i++) {
    out[i] = i - 20 < nameBytes.length ? nameBytes[i - 20] : 0x00;
  }
  const lowpower = raw.power === 'Low' ? 1 : 0;
  out[14] = (out[14] & 0xcc) | (lowpower & 3);
  // UV5R-Mini uses inverted bit: 1 = Narrow (NFM), 0 = Wide (FM)
  const wideBit = raw.mode === 'FM' ? 0 : 1;
  out[15] = (out[15] & 0x82) | (wideBit << 6);
}
