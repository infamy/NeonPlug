import { describe, it, expect } from 'vitest';
import { generateAirportChannels, COMMON_AIRCRAFT_FREQUENCIES } from '../../src/services/airportChannels';
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

describe('generateAirportChannels with common frequencies', () => {
  it('does not add common frequencies by default', () => {
    const base = generateAirportChannels(1, [yvr, klax], true);
    expect(base.channels.length).toBe(4); // 2 freqs x 2 airports
  });

  it('appends common frequencies to the Airports zone in single zone mode', () => {
    const result = generateAirportChannels(1, [yvr, klax], true, COMMON_AIRCRAFT_FREQUENCIES);
    expect(result.channels.length).toBe(4 + COMMON_AIRCRAFT_FREQUENCIES.length);
    expect(result.zones.length).toBe(1);
    expect(result.zones[0].name).toBe('Airports');
    expect(result.zones[0].channels.length).toBe(4 + COMMON_AIRCRAFT_FREQUENCIES.length);
  });

  it('adds common frequencies as a separate Aircraft zone in individual mode', () => {
    const result = generateAirportChannels(1, [yvr, klax], false, COMMON_AIRCRAFT_FREQUENCIES);
    expect(result.channels.length).toBe(4 + COMMON_AIRCRAFT_FREQUENCIES.length);
    expect(result.zones.length).toBe(3); // 2 airport zones + 1 Aircraft zone
    const aircraftZone = result.zones.find(z => z.name === 'Aircraft');
    expect(aircraftZone).toBeDefined();
    expect(aircraftZone!.channels.length).toBe(COMMON_AIRCRAFT_FREQUENCIES.length);
  });

  it('only adds the selected subset of common frequencies', () => {
    const subset = COMMON_AIRCRAFT_FREQUENCIES.slice(0, 3);
    const result = generateAirportChannels(1, [yvr], true, subset);
    expect(result.channels.length).toBe(2 + 3);
  });

  it('adds no common frequencies when the list is empty', () => {
    const result = generateAirportChannels(1, [yvr, klax], false, []);
    expect(result.channels.length).toBe(4);
    expect(result.zones.every(z => z.name !== 'Aircraft')).toBe(true);
  });

  it('common frequency channels are receive-only', () => {
    const result = generateAirportChannels(1, [yvr], true, COMMON_AIRCRAFT_FREQUENCIES);
    const commonChannels = result.channels.slice(-COMMON_AIRCRAFT_FREQUENCIES.length);
    commonChannels.forEach(ch => {
      expect(ch.forbidTx).toBe(true);
    });
  });

  it('common frequency channel names are 16 chars or fewer', () => {
    COMMON_AIRCRAFT_FREQUENCIES.forEach(f => {
      expect(f.name.length).toBeLessThanOrEqual(16);
    });
  });
});
