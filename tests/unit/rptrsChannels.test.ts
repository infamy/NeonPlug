import { describe, it, expect } from 'vitest';
import { generateRptrsChannels } from '../../src/services/rptrsChannels';
import type { RptrData } from '../../src/data/rptrsData';

function rptr(overrides: Partial<RptrData> = {}): RptrData {
  return {
    locator: 1,
    id: 1,
    callsign: 'VE7XYZ',
    city: 'Vancouver',
    state: 'BC',
    country: 'CA',
    frequency: '440.58750',
    color_code: 1,
    offset: '+5.000',
    assigned: '',
    ts_linked: 'TS1 TS2',
    trustee: '',
    map_info: '',
    map: 0,
    ipsc_network: 'Brandmeister',
    lat: '49.194',
    lng: '-123.183',
    status: 'ACTIVE',
    ...overrides,
  };
}

const repeater1 = rptr({ id: 1, callsign: 'VE7XYZ', frequency: '440.58750', ts_linked: 'TS1 TS2' });
const repeater2 = rptr({ id: 2, callsign: 'VE7ABC', frequency: '443.00000', offset: '+5.000', city: 'Victoria', state: 'BC', ts_linked: 'TS1' });

describe('generateRptrsChannels', () => {
  it('throws when no repeaters provided', () => {
    expect(() => generateRptrsChannels(1, [])).toThrow();
  });

  it('creates two channels per repeater when ts_linked has TS1 and TS2', () => {
    const result = generateRptrsChannels(1, [repeater1], false, false, true);
    expect(result.channels.length).toBe(2);
  });

  it('creates one channel per repeater when createSeparateTimeslots is false', () => {
    const result = generateRptrsChannels(1, [repeater1], false, false, false);
    expect(result.channels.length).toBe(1);
  });

  it('creates one channel when repeater only has TS1', () => {
    const ts1Only = rptr({ ts_linked: 'TS1' });
    const result = generateRptrsChannels(1, [ts1Only], false, false, true);
    expect(result.channels.length).toBe(1);
  });

  it('assigns channel numbers starting at startChannelNumber', () => {
    const result = generateRptrsChannels(10, [repeater2], false, false, false);
    expect(result.channels[0].number).toBe(10);
  });

  it('creates one zone when singleZone is true', () => {
    const result = generateRptrsChannels(1, [repeater1, repeater2], true, false, false);
    expect(result.zones.length).toBe(1);
  });

  it('all channel names are 16 chars or fewer', () => {
    const result = generateRptrsChannels(1, [repeater1, repeater2], false, false, true);
    result.channels.forEach(ch => {
      expect(ch.name.length).toBeLessThanOrEqual(16);
    });
  });

  it('zone channels reference actual channel numbers', () => {
    const result = generateRptrsChannels(1, [repeater1], false, false, true);
    const channelNumbers = new Set(result.channels.map(c => c.number));
    result.zones.forEach(z => {
      z.channels.forEach(n => {
        expect(channelNumbers.has(n)).toBe(true);
      });
    });
  });

  it('summary matches actual counts', () => {
    const result = generateRptrsChannels(1, [repeater1, repeater2], false, false, true);
    expect(result.summary.channelsCreated).toBe(result.channels.length);
    expect(result.summary.zonesCreated).toBe(result.zones.length);
  });
});
