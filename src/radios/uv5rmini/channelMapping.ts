/**
 * Map between UV5R-Mini raw channel format and NeonPlug Channel model.
 */

import type { Channel, CTCSSDCS } from '../../models';
import type { Uv5rMiniChannelRaw } from './channelFormat';
import { encodeBcdFreq, encodeTone } from './channelFormat';

export const DEFAULT_CTCSSDCS: CTCSSDCS = { type: 'None' };

function toneStrToCtcssDcs(str: string): CTCSSDCS {
  if (!str || str === '—' || str.trim() === '') return DEFAULT_CTCSSDCS;
  const s = str.trim();
  const asNum = parseFloat(s);
  if (!Number.isNaN(asNum) && s.includes('.')) {
    return { type: 'CTCSS', value: asNum };
  }
  const code = parseInt(s, 10);
  if (!Number.isNaN(code) && Number.isInteger(code)) {
    return { type: 'DCS', value: code };
  }
  return DEFAULT_CTCSSDCS;
}

function ctcssDcsToStr(c: CTCSSDCS): string {
  if (c.type === 'None') return '—';
  if (c.type === 'CTCSS' && c.value != null) return c.value.toFixed(1);
  if (c.type === 'DCS' && c.value != null) return String(c.value);
  return '—';
}

/** Convert NeonPlug Channel to UV5R-Mini raw shape (for write). */
export function channelToUv5rMiniRaw(ch: Channel): Uv5rMiniChannelRaw {
  const rxHz = Math.round((ch.rxFrequency || 0) * 1e6);
  const txHz = Math.round((ch.txFrequency ?? ch.rxFrequency ?? 0) * 1e6);
  let duplex = '';
  if (rxHz > 0) {
    if (txHz === 0 || txHz === rxHz) duplex = '';
    else duplex = txHz > rxHz ? '+' : '-';
  }
  const rawBytes = new Uint8Array(32);
  if (rxHz === 0) {
    rawBytes.fill(0xff);
    return {
      num: ch.number,
      empty: true,
      rxFreqHz: 0,
      txFreqHz: 0,
      duplex: '',
      rxtone: '—',
      txtone: '—',
      power: 'High',
      mode: 'NFM',
      name: '—',
      rawBytes,
    };
  }
  rawBytes.fill(0);
  rawBytes.set(encodeBcdFreq(rxHz), 0);
  if (duplex !== 'off') {
    rawBytes.set(encodeBcdFreq(txHz), 4);
  } else {
    rawBytes[4] = rawBytes[5] = rawBytes[6] = rawBytes[7] = 0xff;
  }
  rawBytes.set(encodeTone(ctcssDcsToStr(ch.rxCtcssDcs ?? DEFAULT_CTCSSDCS)), 8);
  rawBytes.set(encodeTone(ctcssDcsToStr(ch.txCtcssDcs ?? DEFAULT_CTCSSDCS)), 10);
  rawBytes[12] = 1;
  rawBytes[13] = 0;
  const lowpower = (ch.power ?? 'High') === 'Low' ? 1 : 0;
  const wide = (ch.bandwidth ?? '12.5kHz') === '25kHz' ? 1 : 0;
  rawBytes[14] = lowpower & 3;
  rawBytes[15] = (wide << 6);
  const nameStr = (ch.name?.trim() || '—').slice(0, 12);
  const nameBytes = new TextEncoder().encode(nameStr);
  for (let i = 20; i < 32; i++) {
    rawBytes[i] = i - 20 < nameBytes.length ? nameBytes[i - 20] : 0x00;
  }
  return {
    num: ch.number,
    empty: false,
    rxFreqHz: rxHz,
    txFreqHz: duplex === 'off' ? 0 : txHz,
    duplex,
    rxtone: ctcssDcsToStr(ch.rxCtcssDcs ?? DEFAULT_CTCSSDCS),
    txtone: ctcssDcsToStr(ch.txCtcssDcs ?? DEFAULT_CTCSSDCS),
    power: ch.power ?? 'High',
    mode: (ch.bandwidth ?? '12.5kHz') === '25kHz' ? 'FM' : 'NFM',
    name: ch.name?.trim() || '—',
    rawBytes,
  };
}

/** Convert UV5R-Mini raw channel to NeonPlug Channel. */
export function uv5rMiniRawToChannel(raw: Uv5rMiniChannelRaw): Channel {
  const rxMhz = raw.rxFreqHz / 1e6;
  const txMhz = raw.txFreqHz > 0 ? raw.txFreqHz / 1e6 : rxMhz;
  return {
    number: raw.num,
    name: raw.name || '—',
    rxFrequency: rxMhz,
    txFrequency: txMhz,
    mode: 'Analog',
    forbidTx: false,
    loneWorker: false,
    bandwidth: raw.mode === 'FM' ? '25kHz' : '12.5kHz',
    scanAdd: false,
    scanListId: 0,
    forbidTalkaround: false,
    unknown1A_6_4: 0,
    unknown1A_3: false,
    aprsReceive: false,
    emergencyIndicator: false,
    emergencyAck: false,
    emergencySystemId: 0,
    digitalEmergencySystemId: 0,
    power: raw.power === 'Low' ? 'Low' : 'High',
    aprsReportMode: 'Off',
    unknown1C_1_0: 0,
    voxFunction: false,
    scramble: false,
    compander: false,
    talkback: false,
    unknown1D_3_0: 0,
    squelchLevel: 0,
    pttIdDisplay: false,
    pttId: 0,
    colorCode: 0,
    rxCtcssDcs: toneStrToCtcssDcs(raw.rxtone),
    txCtcssDcs: toneStrToCtcssDcs(raw.txtone),
    unknown25_7_6: 0,
    companderDup: false,
    voxRelated: false,
    unknown25_3_0: 0,
    pttIdDisplay2: false,
    rxSquelchMode: 'Carrier/CTC',
    unknown26_3_1: 0,
    unknown26_0: false,
    stepFrequency: 0,
    signalingType: 'None',
    pttIdType: 'Off',
    unknown29_3_2: 0,
    unknown29_1_0: 0,
    unknown2A: 0,
    contactId: 0,
  };
}
