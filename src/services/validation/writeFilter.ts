/**
 * What a write actually sends, once what the radio cannot hold is left out.
 *
 * A channel outside the radio's bands is left out, and zones and scan lists
 * lose their references to it and to any channel that does not exist. A zone or
 * scan list left with no channels is left out too.
 *
 * One function for the write and its confirmation, so the dialog cannot
 * describe a different write from the one sent.
 */

import type { Channel } from '../../models/Channel';
import type { Zone } from '../../models/Zone';
import type { ScanList } from '../../models/ScanList';
import type { RadioBandLimits } from '../../types/radioCapabilities';
import { isWritableChannelFrequency } from './frequencyValidator';

export interface WriteFilterOptions {
  /** False on the DA-7X2, whose write planner checks channel frequencies itself. */
  filterBand: boolean;
  bandLimits?: RadioBandLimits | null;
  blankTxAnyBand?: boolean;
  outOfBand?: boolean;
}

export interface WritableCodeplug {
  channels: Channel[];
  zones: Zone[];
  scanLists: ScanList[];
  /** Channels left out because the radio cannot hold them. */
  droppedChannels: Channel[];
  /** Zones left out because none of their channels are written. */
  droppedZones: string[];
  /** Scan lists left out because none of their channels are written. */
  droppedScanLists: string[];
}

export function planWritableCodeplug(
  channels: Channel[],
  zones: Zone[],
  scanLists: ScanList[],
  options: WriteFilterOptions
): WritableCodeplug {
  const kept = options.filterBand
    ? channels.filter((ch) =>
        isWritableChannelFrequency(ch, options.bandLimits, {
          blankTxAnyBand: options.blankTxAnyBand,
          outOfBand: options.outOfBand,
        })
      )
    : channels;
  const keptNumbers = new Set(kept.map((ch) => ch.number));

  const trimmedZones = zones.map((zone) => ({ ...zone, channels: zone.channels.filter((n) => keptNumbers.has(n)) }));
  const trimmedScanLists = scanLists.map((list) => ({
    ...list,
    channels: list.channels.filter((n) => keptNumbers.has(n)),
  }));

  return {
    channels: kept,
    zones: trimmedZones.filter((zone) => zone.channels.length > 0),
    scanLists: trimmedScanLists.filter((list) => list.channels.length > 0),
    droppedChannels: kept === channels ? [] : channels.filter((ch) => !keptNumbers.has(ch.number)),
    droppedZones: trimmedZones.filter((zone) => zone.channels.length === 0).map((zone) => zone.name),
    droppedScanLists: trimmedScanLists.filter((list) => list.channels.length === 0).map((list) => list.name),
  };
}
