import { describe, it, expect } from 'vitest';
import type { CTCSSDCS } from '../../src/models';
import { exportChannelsToChirpCSV } from '../../src/services/csv/chirpExporter';
import { importChannelsFromChirpCSV } from '../../src/services/csv/chirpImporter';
import { parseCSV } from '../../src/services/csv/csvImporter';
import { NO_TX_FREQUENCY } from '../../src/services/validation/frequencyValidator';
import { createDefaultChannel } from '../../src/utils/channelHelpers';

const NONE: CTCSSDCS = { type: 'None' };
const ctcss = (value: number): CTCSSDCS => ({ type: 'CTCSS', value });
const dcs = (value: number, polarity: 'N' | 'P' = 'N'): CTCSSDCS => ({ type: 'DCS', value, polarity });

interface Case {
  name: string;
  rx?: number;
  tx?: number;
  txTone?: CTCSSDCS;
  rxTone?: CTCSSDCS;
  forbidTx?: boolean;
}

// Each channel is named for the case it covers
const cases: Case[] = [
  { name: 'SIMPLEX' },
  { name: 'MINUS', rx: 145.45, tx: 144.85, txTone: ctcss(100) },
  { name: 'PLUS', rx: 147.26, tx: 147.86, txTone: ctcss(127.3), rxTone: ctcss(127.3) },
  { name: 'RX TONE', rxTone: ctcss(131.8) },
  { name: 'TWO TONES', txTone: ctcss(100), rxTone: ctcss(123) },
  { name: 'DCS', txTone: dcs(74), rxTone: dcs(74, 'P') },
  { name: 'TWO CODES', txTone: dcs(23), rxTone: dcs(125, 'P') },
  { name: 'TX DCS', txTone: dcs(131, 'P') },
  { name: 'TONE DCS', txTone: ctcss(110.9), rxTone: dcs(245) },
  { name: 'NO TX', forbidTx: true },
  { name: 'BLANK TX', rx: 118.1, tx: NO_TX_FREQUENCY },
];

const channels = cases.map(({ name, rx = 446.1, tx = rx, txTone = NONE, rxTone = NONE, forbidTx = false }, i) =>
  createDefaultChannel({
    number: i + 1,
    name,
    mode: 'Analog',
    rxFrequency: rx,
    txFrequency: tx,
    txCtcssDcs: txTone,
    rxCtcssDcs: rxTone,
    forbidTx,
  })
);

const csv = exportChannelsToChirpCSV(channels);
const [headers, ...rows] = parseCSV(csv);
const columns = (name: string) => {
  const cells = rows.find((row) => row[1] === name)!;
  return Object.fromEntries(headers.map((header, i) => [header, cells[i]]));
};

describe('CHIRP CSV export', () => {
  it('writes the columns the way CHIRP reads them (#175)', () => {
    expect(columns('SIMPLEX')).toMatchObject({ Duplex: '', Offset: '0.000000', Tone: '' });
    expect(columns('MINUS')).toMatchObject({ Duplex: '-', Offset: '0.600000', Tone: 'Tone', rToneFreq: '100.0' });
    expect(columns('PLUS')).toMatchObject({ Duplex: '+', Offset: '0.600000', Tone: 'TSQL', cToneFreq: '127.3' });
    expect(columns('RX TONE')).toMatchObject({ Tone: 'Cross', CrossMode: '->Tone', cToneFreq: '131.8' });
    expect(columns('DCS')).toMatchObject({ Tone: 'DTCS', DtcsCode: '074', DtcsPolarity: 'NR' });
    expect(columns('TX DCS')).toMatchObject({ Tone: 'Cross', CrossMode: 'DTCS->', DtcsCode: '131', DtcsPolarity: 'RN' });
    expect(columns('NO TX')).toMatchObject({ Duplex: 'off' });
    expect(columns('BLANK TX')).toMatchObject({ Duplex: 'off' });
  });

  it('reads back through the CHIRP import as the same channels', () => {
    const result = importChannelsFromChirpCSV(csv);
    expect(result.errors).toBeUndefined();
    expect(result.channels).toHaveLength(channels.length);
    result.channels!.forEach((back, i) => {
      const sent = channels[i];
      const noTx = sent.forbidTx || sent.txFrequency === NO_TX_FREQUENCY;
      expect(back).toMatchObject({
        name: sent.name,
        txCtcssDcs: sent.txCtcssDcs,
        rxCtcssDcs: sent.rxCtcssDcs,
        forbidTx: noTx,
      });
      expect(back.rxFrequency).toBeCloseTo(sent.rxFrequency, 6);
      expect(back.txFrequency).toBeCloseTo(noTx ? sent.rxFrequency : sent.txFrequency, 6);
    });
  });
});
