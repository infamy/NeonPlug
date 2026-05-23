import { describe, it, expect } from 'vitest';
import { generateAirportChannels } from '../../src/services/airportChannels';
import type { AirportData } from '../../src/data/airportsData';

function airport(code: string, lat: number, lon: number, frequencies: number | [number, string][]): AirportData {
  return { c: code, l: [lat, lon], f: frequencies };
}

const yvr = airport('CYVR', 49.194, -123.183, [[118100, 'TWR'], [121900, 'GND']]);
const klax = airport('KLAX', 33.942, -118.408, [[119800, 'TWR'], [121650, 'GND']]);

describe('generateAirportChannels', () => {
  it('throws when no airports provided', () => {
    expect(() => generateAirportChannels(1, [])).toThrow();
  });

  it('generates at least one channel per airport', () => {
    const result = generateAirportChannels(1, [yvr]);
    expect(result.channels.length).toBeGreaterThan(0);
  });

  it('assigns channel numbers starting at startChannelNumber', () => {
    const result = generateAirportChannels(10, [yvr]);
    expect(result.channels[0].number).toBe(10);
  });

  it('creates sequential channel numbers', () => {
    const result = generateAirportChannels(1, [yvr]);
    result.channels.forEach((ch, i) => {
      expect(ch.number).toBe(i + 1);
    });
  });

  it('creates one zone per airport by default', () => {
    const result = generateAirportChannels(1, [yvr, klax]);
    expect(result.zones.length).toBe(2);
  });

  it('creates one zone total when singleZone is true', () => {
    const result = generateAirportChannels(1, [yvr, klax], true);
    expect(result.zones.length).toBe(1);
  });

  it('all channel names are 16 chars or fewer', () => {
    const result = generateAirportChannels(1, [yvr, klax]);
    result.channels.forEach(ch => {
      expect(ch.name.length).toBeLessThanOrEqual(16);
    });
  });

  it('all zone names are 16 chars or fewer', () => {
    const result = generateAirportChannels(1, [yvr, klax]);
    result.zones.forEach(z => {
      expect(z.name.length).toBeLessThanOrEqual(16);
    });
  });

  it('zone channels reference actual channel numbers', () => {
    const result = generateAirportChannels(1, [yvr]);
    const channelNumbers = new Set(result.channels.map(c => c.number));
    result.zones.forEach(z => {
      z.channels.forEach(n => {
        expect(channelNumbers.has(n)).toBe(true);
      });
    });
  });

  it('summary matches actual counts', () => {
    const result = generateAirportChannels(1, [yvr, klax]);
    expect(result.summary.channelsCreated).toBe(result.channels.length);
    expect(result.summary.zonesCreated).toBe(result.zones.length);
  });
});
