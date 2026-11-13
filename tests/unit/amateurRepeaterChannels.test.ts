import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { decodeFerriteTile, type FerriteTile } from '../../src/services/ferrite/tile';
import { describeRepeater, generateAmateurRepeaterChannels, type AmateurRepeater } from '../../src/services/amateurRepeaterChannels';

// HearHam repeaters in Colombia and Panama, from data.ferritefw.dev (tests/fixtures/ferrite).
const tile = JSON.parse(readFileSync(join(__dirname, '../fixtures/ferrite/repeaters-FJ.json'), 'utf8')) as FerriteTile;
const repeaters: AmateurRepeater[] = decodeFerriteTile(tile).map((r) => ({ ...r, distance: 1, source: 'repeaters' }));

describe('channels from amateur repeaters', () => {
  const { channels, zones } = generateAmateurRepeaterChannels(101, repeaters);

  it('listens on the output and transmits on the input', () => {
    expect(channels[0]).toMatchObject({ number: 101, name: 'HK3LRB2', mode: 'Analog' });
    expect(channels[0].rxFrequency).toBeCloseTo(147.09, 5);
    expect(channels[0].txFrequency).toBeCloseTo(147.69, 5);
    expect(channels[1].txFrequency).toBeCloseTo(channels[1].rxFrequency - 0.6, 5);
    // Simplex: no shift.
    expect(channels[3].txFrequency).toBe(channels[3].rxFrequency);
  });

  it('sends the tone that opens the repeater, and listens for the one it sends', () => {
    expect(channels[0].txCtcssDcs).toEqual({ type: 'CTCSS', value: 131.8 });
    expect(channels[0].rxCtcssDcs).toEqual({ type: 'CTCSS', value: 131.8 });
    // HearHam lists no decode tone here: receive stays open.
    expect(channels[1].txCtcssDcs).toEqual({ type: 'CTCSS', value: 85.4 });
    expect(channels[1].rxCtcssDcs).toEqual({ type: 'None' });
  });

  it('carries DCS and its polarity', () => {
    const [dcs] = generateAmateurRepeaterChannels(1, [
      { ...repeaters[0], encodeTone: { type: 'DCS', code: 23, inverted: true }, decodeTone: undefined },
    ]).channels;
    expect(dcs.txCtcssDcs).toEqual({ type: 'DCS', value: 23, polarity: 'P' });
  });

  it('is wide unless HearHam says narrow', () => {
    expect(channels[0].bandwidth).toBe('25kHz');
    const [narrow] = generateAmateurRepeaterChannels(1, [{ ...repeaters[0], bandwidth: '12.5kHz' }]).channels;
    expect(narrow.bandwidth).toBe('12.5kHz');
  });

  it('puts them in one zone', () => {
    expect(zones).toHaveLength(1);
    expect(zones[0].name).toBe('Repeaters');
    expect(zones[0].channels).toEqual([101, 102, 103, 104]);
    expect(generateAmateurRepeaterChannels(1, []).zones).toEqual([]);
  });

  it('describes a repeater the way a ham writes it', () => {
    expect(describeRepeater(repeaters[0])).toBe('147.0900 MHz+0.600 · 131.8');
    expect(describeRepeater(repeaters[3])).toMatch(/simplex · 156\.7$/);
  });
});
