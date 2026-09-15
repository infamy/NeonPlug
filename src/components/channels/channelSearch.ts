/**
 * Searching and sorting the channel grid.
 *
 * The search used to match any substring of the number, both frequencies, the
 * mode, bandwidth, power and tone values, so "12" found channel 112, every
 * 12.5 kHz channel and a 123.0 Hz tone, and "an" found every Analog channel. A
 * word now matches the name, the channel number exactly, or the start of a
 * frequency. Everything else takes a prefix: mode:dig, bw:n, power:low,
 * band:uhf, zone:none, tone:123. A lone "#12" scrolls to channel 12.
 */

import type { Channel } from '../../models/Channel';
import type { RadioBandLimits } from '../../types/radioCapabilities';
import { getFrequencyBand } from '../../services/validation/frequencyValidator';

type SearchField = 'text' | 'number' | 'mode' | 'bw' | 'power' | 'band' | 'zone' | 'tone';

interface SearchTerm {
  field: SearchField;
  value: string;
}

export interface ParsedChannelSearch {
  /** A lone "#12": scroll to that channel instead of filtering. */
  jumpTo: number | null;
  /** Every term must match. */
  terms: SearchTerm[];
}

export interface ChannelSearchContext {
  /** Zone names by channel number. */
  zonesByChannel: ReadonlyMap<number, readonly string[]>;
  bandLimits?: RadioBandLimits | null;
}

const PREFIXES: Record<string, SearchField> = {
  mode: 'mode',
  bw: 'bw',
  bandwidth: 'bw',
  power: 'power',
  pwr: 'power',
  band: 'band',
  zone: 'zone',
  tone: 'tone',
};

/** What the search box understands, for its tooltip. */
export const CHANNEL_SEARCH_HELP =
  'Words match the name, a channel number exactly, or the start of a frequency. ' +
  'Narrow further with mode:dig, bw:n, power:low, band:uhf, zone:none, zone:<name> or tone:123. ' +
  '#12 scrolls to channel 12.';

export function parseChannelSearch(query: string): ParsedChannelSearch {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 1 && /^#\d+$/.test(tokens[0])) {
    return { jumpTo: Number(tokens[0].slice(1)), terms: [] };
  }
  const terms = tokens.map((token): SearchTerm => {
    if (/^#\d+$/.test(token)) return { field: 'number', value: token.slice(1) };
    const colon = token.indexOf(':');
    const field = colon > 0 ? PREFIXES[token.slice(0, colon)] : undefined;
    return field ? { field, value: token.slice(colon + 1) } : { field: 'text', value: token };
  });
  return { jumpTo: null, terms };
}

export function matchesChannelSearch(
  channel: Channel,
  search: ParsedChannelSearch,
  context: ChannelSearchContext
): boolean {
  return search.terms.every((term) => matchesTerm(channel, term, context));
}

function matchesTerm(channel: Channel, { field, value }: SearchTerm, context: ChannelSearchContext): boolean {
  switch (field) {
    case 'number':
      return String(channel.number) === value;
    case 'mode':
      return channel.mode.toLowerCase().split(/\s+/).some((word) => word.startsWith(value));
    case 'bw':
      return bandwidthMatches(channel.bandwidth, value);
    case 'power':
      return channel.power.toLowerCase().startsWith(value);
    case 'band':
      return getFrequencyBand(channel.rxFrequency, context.bandLimits).toLowerCase().startsWith(value);
    case 'zone': {
      const zones = context.zonesByChannel.get(channel.number) ?? [];
      return value === 'none' ? zones.length === 0 : zones.some((zone) => zone.toLowerCase().includes(value));
    }
    case 'tone':
      return [channel.rxCtcssDcs, channel.txCtcssDcs].some(
        (tone) => tone.type !== 'None' && tone.value !== undefined && String(tone.value).startsWith(value)
      );
    case 'text':
      return (
        channel.name.toLowerCase().includes(value) || String(channel.number) === value || frequencyMatches(channel, value)
      );
  }
}

/** "n", "narrow" or "12.5" for 12.5 kHz; "w", "wide" or "25" for 25 kHz. */
function bandwidthMatches(bandwidth: Channel['bandwidth'], value: string): boolean {
  if (value === '') return true;
  const narrow = bandwidth === '12.5kHz';
  if ('narrow'.startsWith(value)) return narrow;
  if ('wide'.startsWith(value)) return !narrow;
  return bandwidth.toLowerCase().startsWith(value);
}

/** The start of either frequency, for a word that looks like one: with a decimal point, or three digits or more. */
function frequencyMatches(channel: Channel, value: string): boolean {
  const typed = value.replace(',', '.');
  if (!/^\d+(\.\d*)?$/.test(typed) || (!typed.includes('.') && typed.length < 3)) return false;
  return [channel.rxFrequency, channel.txFrequency].some((mhz) => mhz.toFixed(4).startsWith(typed));
}

export type ChannelSortKey = 'number' | 'name' | 'rxFrequency' | 'txFrequency' | 'mode';

export interface ChannelSort {
  key: ChannelSortKey;
  descending: boolean;
}

const COMPARE: Record<ChannelSortKey, (a: Channel, b: Channel) => number> = {
  number: (a, b) => a.number - b.number,
  name: (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }),
  rxFrequency: (a, b) => a.rxFrequency - b.rxFrequency,
  txFrequency: (a, b) => a.txFrequency - b.txFrequency,
  mode: (a, b) => a.mode.localeCompare(b.mode),
};

/**
 * The order the grid shows. Only the view: sorting never renumbers a channel,
 * and VFO rows stay at the top. Ties keep channel order.
 */
export function sortChannelsForView(
  channels: Channel[],
  sort: ChannelSort | null,
  isVfo: (channelNumber: number) => boolean
): Channel[] {
  if (!sort) return channels;
  const compare = COMPARE[sort.key];
  const direction = sort.descending ? -1 : 1;
  const vfos = channels.filter((ch) => isVfo(ch.number));
  const rest = channels
    .filter((ch) => !isVfo(ch.number))
    .sort((a, b) => direction * compare(a, b) || a.number - b.number);
  return [...vfos, ...rest];
}
