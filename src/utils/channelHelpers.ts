/**
 * Channel creation and manipulation helpers
 */

import type { Channel } from '../models';

export interface ChannelRenumberResult {
  /** Channels renumbered to a contiguous 1..N sequence, sorted by their prior number */
  channels: Channel[];
  /** Prior channel.number -> new channel.number, for remapping zone/scan-list references */
  oldToNew: Map<number, number>;
  /** True if any renumbering actually happened (numbers weren't already 1..N matching array order) */
  hadGaps: boolean;
}

/**
 * Renumber channels to a contiguous 1..N sequence matching sorted order.
 *
 * The radio's write path (generateChannelBlocks) packs channels back-to-back purely by
 * array position and ignores channel.number entirely; zones and scan lists then reference
 * channels by the raw .number value. Reading skips blank slots on the radio without
 * reserving their number, so channel.number can come back with gaps (e.g. ...50, 52, 53...
 * if slot 51 was blank). Left uncompacted, the next write silently shifts every channel
 * after a gap into the wrong physical slot and any zone/scan-list referencing the old
 * numbers ends up pointing at the wrong channel. Call this right after reading channels,
 * and remap zone/scan-list channel references with the returned oldToNew map.
 */
export function compactChannelNumbers(channels: Channel[]): ChannelRenumberResult {
  const sorted = [...channels].sort((a, b) => a.number - b.number);
  const hadGaps = sorted.some((ch, i) => ch.number !== i + 1);
  const oldToNew = new Map(sorted.map((ch, i) => [ch.number, i + 1]));
  const renumbered = hadGaps ? sorted.map((ch, i) => ({ ...ch, number: i + 1 })) : sorted;
  return { channels: renumbered, oldToNew, hadGaps };
}

/** Remap a list of channel numbers (e.g. a zone's or scan list's .channels) through an oldToNew map, dropping any that no longer exist. */
export function remapChannelNumbers(numbers: number[], oldToNew: Map<number, number>): number[] {
  return numbers
    .map(n => oldToNew.get(n))
    .filter((n): n is number => n !== undefined);
}

/** Remap a single optional channel reference (e.g. a scan list's priority/designated-TX channel) through an oldToNew map. */
export function remapChannelNumber(n: number | undefined, oldToNew: Map<number, number>): number | undefined {
  return n === undefined ? undefined : oldToNew.get(n);
}

/**
 * Create a new channel with sensible defaults
 * All unknown fields are set to 0/false to match typical radio defaults
 * 
 * @param overrides Partial channel data to override defaults
 * @returns A complete Channel object ready for encoding
 */
export function createDefaultChannel(overrides: Partial<Channel> = {}): Channel {
  return {
    number: 1,
    name: '',
    rxFrequency: 146.5200,
    txFrequency: 146.5200,
    mode: 'Analog',
    forbidTx: false,
    loneWorker: false,
    bandwidth: '25kHz',
    scanAdd: false,
    scanListId: 0,
    forbidTalkaround: false,
    unknown1A_6_4: 0,
    unknown1A_3: false,
    aprsReceive: false,
    emergencyIndicator: false,
    emergencyAck: false,
    emergencySystemId: 0,
    power: 'High',
    aprsReportMode: 'Off',
    unknown1C_1_0: 0,
    voxFunction: false,
    scramble: false,
    compander: false,
    talkback: false,
    unknown1D_3_0: 0,
    squelchLevel: 3,
    digitalEmergencySystemId: 0, // 0 = None
    pttIdDisplay: false,
    pttId: 0,
    colorCode: 0,
    rxCtcssDcs: { type: 'None' },
    txCtcssDcs: { type: 'None' },
    companderDup: false,
    voxRelated: false,
    unknown25_7_6: 0,
    unknown25_3_0: 0,
    pttIdDisplay2: false,
    rxSquelchMode: 'Carrier/CTC',
    unknown26_3_1: 0,
    unknown26_0: false,
    stepFrequency: 5, // 25kHz
    signalingType: 'None',
    pttIdType: 'Off',
    unknown29_3_2: 0,
    unknown29_1_0: 0,
    unknown2A: 0,
    contactId: 0,
    ...overrides,
  };
}

/**
 * Validate that a channel has all required fields for encoding
 * @param channel Channel to validate
 * @returns true if valid, throws error if invalid
 */
export function validateChannelForEncoding(channel: Partial<Channel>): channel is Channel {
  const requiredFields: (keyof Channel)[] = [
    'number',
    'name',
    'rxFrequency',
    'txFrequency',
    'mode',
    'bandwidth',
    'power',
    'rxCtcssDcs',
    'txCtcssDcs',
    'rxSquelchMode',
    'signalingType',
    'pttIdType',
  ];

  for (const field of requiredFields) {
    if (channel[field] === undefined || channel[field] === null) {
      throw new Error(`Channel missing required field: ${field}`);
    }
  }

  return true;
}

