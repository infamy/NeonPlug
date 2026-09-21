import { describe, it, expect } from 'vitest';
import {
  matchesChannelSearch,
  parseChannelSearch,
  sortChannelsForView,
} from '../../src/components/channels/channelSearch';
import { DEFAULT_BAND_LIMITS } from '../../src/types/radioCapabilities';
import type { Channel } from '../../src/models/Channel';
import { createDefaultChannel } from '../../src/utils/channelHelpers';
import { isVFOChannel } from '../../src/utils/vfoChannels';

const ch = (number: number, name: string, over: Partial<Channel> = {}) =>
  createDefaultChannel({
    number,
    name,
    rxFrequency: 146.52,
    txFrequency: 146.52,
    mode: 'Analog',
    bandwidth: '25kHz',
    power: 'High',
    rxCtcssDcs: { type: 'None' },
    txCtcssDcs: { type: 'None' },
    ...over,
  });

const channels = [
  ch(12, 'Twelve'),
  ch(112, 'Hundred', { rxFrequency: 145.5, txFrequency: 145.5 }),
  ch(3, 'Rptr 12', { rxFrequency: 446.1, txFrequency: 441.1, mode: 'Digital', bandwidth: '12.5kHz' }),
  ch(4, 'Andy', {
    rxFrequency: 146.5125,
    txFrequency: 146.5125,
    rxCtcssDcs: { type: 'CTCSS', value: 123 },
    txCtcssDcs: { type: 'CTCSS', value: 123 },
  }),
  ch(5, 'Bob', { rxFrequency: 147, txFrequency: 147, mode: 'Fixed Digital', bandwidth: '12.5kHz', power: 'Low' }),
];
const zonesByChannel = new Map([
  [12, ['Local']],
  [3, ['Local', 'DMR']],
]);
const find = (query: string) =>
  channels
    .filter((c) => matchesChannelSearch(c, parseChannelSearch(query), { zonesByChannel, bandLimits: DEFAULT_BAND_LIMITS }))
    .map((c) => c.number);

describe('the channel search', () => {
  it('matches a number exactly, not every number, frequency or tone containing it', () => {
    expect(find('12')).toEqual([12, 3]);
  });

  it('matches the start of a frequency, with a decimal point or comma', () => {
    expect(find('146.52')).toEqual([12]);
    expect(find('146,51')).toEqual([4]);
    expect(find('146')).toEqual([12, 4]);
  });

  it('matches names, and no longer the mode, as words', () => {
    expect(find('an')).toEqual([4]);
  });

  it('matches mode, bandwidth, power, band, zone and tone only with a prefix', () => {
    expect(find('mode:dig')).toEqual([3, 5]);
    expect(find('mode:fixed')).toEqual([5]);
    expect(find('bw:n')).toEqual([3, 5]);
    expect(find('bw:25')).toEqual([12, 112, 4]);
    expect(find('power:l')).toEqual([5]);
    expect(find('band:uhf')).toEqual([3]);
    expect(find('zone:none')).toEqual([112, 4, 5]);
    expect(find('zone:loc')).toEqual([12, 3]);
    expect(find('tone:123')).toEqual([4]);
  });

  it('needs every word to match', () => {
    expect(find('mode:dig zone:none')).toEqual([5]);
    expect(find('#12 twelve')).toEqual([12]);
    expect(find('foo:bar')).toEqual([]);
  });

  it('scrolls to a lone #number rather than filtering', () => {
    expect(parseChannelSearch(' #12 ')).toEqual({ jumpTo: 12, terms: [] });
  });
});

describe('sorting the channel grid', () => {
  const isVfo = (n: number) => isVFOChannel(n);
  const numbers = (list: Channel[]) => list.map((c) => c.number);

  it('sorts the view by a column, either way, keeping channel order for ties', () => {
    expect(numbers(sortChannelsForView(channels, { key: 'name', descending: false }, isVfo))).toEqual([4, 5, 112, 3, 12]);
    expect(numbers(sortChannelsForView(channels, { key: 'rxFrequency', descending: true }, isVfo))).toEqual([
      3, 5, 12, 4, 112,
    ]);
    const tied = [ch(9, 'Same'), ch(2, 'Same')];
    expect(numbers(sortChannelsForView(tied, { key: 'name', descending: true }, isVfo))).toEqual([2, 9]);
  });

  it('puts "Ch 2" before "Ch 10"', () => {
    const list = [ch(1, 'Ch 10'), ch(2, 'Ch 2')];
    expect(numbers(sortChannelsForView(list, { key: 'name', descending: false }, isVfo))).toEqual([2, 1]);
  });

  it('keeps VFO rows at the top, and the list itself when unsorted', () => {
    const withVfo = [...channels, ch(4001, 'VFO')];
    expect(numbers(sortChannelsForView(withVfo, { key: 'name', descending: false }, isVfo))[0]).toBe(4001);
    expect(sortChannelsForView(channels, null, isVfo)).toBe(channels);
  });
});
