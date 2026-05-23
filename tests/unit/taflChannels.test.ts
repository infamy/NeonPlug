import { describe, it, expect } from 'vitest';
import { generateTaflChannels } from '../../src/services/taflChannels';
import type { TaflData } from '../../src/data/taflData';

function tafl(code: string, lat: number, lon: number, freqKhz: number): TaflData {
  return { c: code, l: [lat, lon], f: freqKhz };
}

const entries: TaflData[] = [
  tafl('Dow_Chemical_Can', 42.5, -82.1, 470000),
  tafl('Dow_Chemical_US', 43.6, -83.9, 471000),
  tafl('Safety_Net', 49.2, -122.8, 155400),
];

describe('generateTaflChannels', () => {
  it('throws when no entries provided', () => {
    expect(() => generateTaflChannels(1, [])).toThrow();
  });

  it('generates one channel per entry', () => {
    const result = generateTaflChannels(1, entries);
    expect(result.channels).toHaveLength(entries.length);
  });

  it('assigns channel numbers starting at startChannelNumber', () => {
    const result = generateTaflChannels(20, entries);
    expect(result.channels[0].number).toBe(20);
    expect(result.channels[2].number).toBe(22);
  });

  it('converts frequency from kHz to MHz correctly', () => {
    const result = generateTaflChannels(1, [tafl('TEST', 43.0, -80.0, 470000)]);
    expect(result.channels[0].rxFrequency).toBeCloseTo(470.0, 3);
  });

  it('creates one zone per entry when groupByName is false', () => {
    const result = generateTaflChannels(1, entries, false, false);
    expect(result.zones.length).toBe(entries.length);
  });

  it('creates one zone when singleZone is true', () => {
    const result = generateTaflChannels(1, entries, true, false);
    expect(result.zones.length).toBe(1);
  });

  it('all channel names are 16 chars or fewer', () => {
    const result = generateTaflChannels(1, entries);
    result.channels.forEach(ch => {
      expect(ch.name.length).toBeLessThanOrEqual(16);
    });
  });

  it('zone channels reference actual channel numbers', () => {
    const result = generateTaflChannels(1, entries);
    const channelNumbers = new Set(result.channels.map(c => c.number));
    result.zones.forEach(z => {
      z.channels.forEach(n => {
        expect(channelNumbers.has(n)).toBe(true);
      });
    });
  });

  it('summary matches actual counts', () => {
    const result = generateTaflChannels(1, entries);
    expect(result.summary.channelsCreated).toBe(result.channels.length);
    expect(result.summary.zonesCreated).toBe(result.zones.length);
  });
});
