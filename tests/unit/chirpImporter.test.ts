import { describe, it, expect } from 'vitest';
import { importChannelsFromChirpCSV } from '../../src/services/csv/chirpImporter';

/**
 * CHIRP writes every tone column on every row (88.5 Hz, code 023 where nothing is set), and
 * the Tone column alone says which count (#175). Rows 1-4 are from the issue's sample CHIRP
 * export, renumbered, with the TSQL row given a name; the rest cover the other tone modes and
 * Duplex values.
 */
const CSV = `Location,Name,Frequency,Duplex,Offset,Tone,rToneFreq,cToneFreq,DtcsCode,DtcsPolarity,RxDtcsCode,CrossMode,Mode,TStep,Skip,Power,Comment,URCALL,RPT1CALL,RPT2CALL,DVCODE
1,VE7RVF,145.450000,-,0.600000,Tone,100.0,88.5,023,NN,023,Tone->Tone,FM,5.00,,4.0W,,,,,
2,VE7TEL,145.170000,-,0.600000,,88.5,88.5,023,NN,023,Tone->Tone,FM,5.00,,4.0W,,,,,
3,TSQL,146.460000,,0.000000,TSQL,100.0,100.0,023,NN,023,Tone->Tone,FM,5.00,,4.0W,,,,,
4,VE7RNV,147.260000,+,0.600000,,88.5,88.5,023,NN,023,Tone->Tone,FM,5.00,,4.0W,,,,,
5,DCS,446.100000,,0.000000,DTCS,88.5,88.5,074,NR,023,Tone->Tone,NFM,12.50,,1.0W,,,,,
6,X TONE DCS,446.200000,,0.000000,Cross,110.9,88.5,023,NR,125,Tone->DTCS,NFM,12.50,,1.0W,,,,,
7,X DCS OUT,446.300000,,0.000000,Cross,88.5,88.5,131,RN,023,DTCS->,NFM,12.50,,1.0W,,,,,
8,X RX TONE,446.400000,,0.000000,Cross,88.5,123.0,023,NN,023,->Tone,NFM,12.50,,1.0W,,,,,
9,SPLIT,146.940000,split,146.340000,,88.5,88.5,023,NN,023,Tone->Tone,FM,5.00,,4.0W,,,,,
10,RX ONLY,162.550000,off,0.000000,,88.5,88.5,023,NN,023,Tone->Tone,FM,5.00,,4.0W,,,,,`;

const NONE = { type: 'None' };
const imported = () => {
  const result = importChannelsFromChirpCSV(CSV);
  expect(result.errors).toBeUndefined();
  return result.channels!;
};
const byName = (name: string) => imported().find((ch) => ch.name === name)!;

describe('CHIRP CSV import', () => {
  it('ignores the placeholder tones CHIRP writes on a channel with no tone (#175)', () => {
    const ch = byName('VE7TEL');
    expect(ch.txCtcssDcs).toEqual(NONE);
    expect(ch.rxCtcssDcs).toEqual(NONE);
  });

  it('reads Tone as a TX tone from rToneFreq, and TSQL as both from cToneFreq', () => {
    expect(byName('VE7RVF').txCtcssDcs).toEqual({ type: 'CTCSS', value: 100 });
    expect(byName('VE7RVF').rxCtcssDcs).toEqual(NONE);
    expect(byName('TSQL').txCtcssDcs).toEqual({ type: 'CTCSS', value: 100 });
    expect(byName('TSQL').rxCtcssDcs).toEqual({ type: 'CTCSS', value: 100 });
  });

  it('reads DTCS with its polarity TX then RX, R being inverted', () => {
    expect(byName('DCS').txCtcssDcs).toEqual({ type: 'DCS', value: 74, polarity: 'N' });
    expect(byName('DCS').rxCtcssDcs).toEqual({ type: 'DCS', value: 74, polarity: 'P' });
  });

  it('reads each side of a Cross mode', () => {
    expect(byName('X TONE DCS').txCtcssDcs).toEqual({ type: 'CTCSS', value: 110.9 });
    expect(byName('X TONE DCS').rxCtcssDcs).toEqual({ type: 'DCS', value: 125, polarity: 'P' });
    expect(byName('X DCS OUT').txCtcssDcs).toEqual({ type: 'DCS', value: 131, polarity: 'P' });
    expect(byName('X DCS OUT').rxCtcssDcs).toEqual(NONE);
    expect(byName('X RX TONE').txCtcssDcs).toEqual(NONE);
    expect(byName('X RX TONE').rxCtcssDcs).toEqual({ type: 'CTCSS', value: 123 });
  });

  it('takes the TX direction from Duplex, not from the Offset alone', () => {
    expect(byName('VE7RVF').txFrequency).toBeCloseTo(144.85, 6);
    expect(byName('VE7RNV').txFrequency).toBeCloseTo(147.86, 6);
    expect(byName('TSQL').txFrequency).toBeCloseTo(146.46, 6);
    expect(byName('SPLIT').txFrequency).toBeCloseTo(146.34, 6);
    expect(byName('RX ONLY')).toMatchObject({ rxFrequency: 162.55, txFrequency: 162.55, forbidTx: true });
    expect(byName('VE7RVF').forbidTx).toBe(false);
  });
});
