/**
 * Fixed Channel Definitions
 * Standard channels that are location-agnostic (FRS, GMRS, MURS, etc.)
 * 
 * This file now uses the centralized data from src/data/fixedChannelsData.ts
 * All channel data is defined there for easy expansion
 */

import type { Channel } from '../models';
import { createDefaultChannel } from '../utils/channelHelpers';
import { ALL_FIXED_CHANNEL_SETS, type FixedChannelSetData } from '../data/fixedChannelsData';

export interface FixedChannelSet {
  name: string;
  description: string;
  channels: Channel[];
}

/**
 * Convert frequency data to Channel objects
 */
function frequenciesToChannels(
  setData: FixedChannelSetData,
  startChannelNumber: number = 1
): Channel[] {
  return setData.frequencies.map((freq, index) => {
    const channel = createDefaultChannel({
      number: startChannelNumber + index,
      name: freq.name,
      rxFrequency: freq.rx,
      txFrequency: freq.tx,
      mode: setData.defaultMode,
      bandwidth: setData.defaultBandwidth,
      power: setData.defaultPower,
      scanAdd: true,
    });
    
    // Add CTCSS/DCS if specified
    if (freq.ctcss) {
      channel.rxCtcssDcs = { type: 'CTCSS', value: freq.ctcss };
      channel.txCtcssDcs = { type: 'CTCSS', value: freq.ctcss };
    } else if (freq.dcs) {
      channel.rxCtcssDcs = { type: 'DCS', value: freq.dcs, polarity: 'N' };
      channel.txCtcssDcs = { type: 'DCS', value: freq.dcs, polarity: 'N' };
    }
    
    return channel;
  });
}

/**
 * Get channels for a specific set by name
 */
export function getChannelsForSet(setName: string, startChannelNumber: number = 1): Channel[] {
  const setData = ALL_FIXED_CHANNEL_SETS.find(set => set.name === setName);
  if (!setData) {
    return [];
  }
  return frequenciesToChannels(setData, startChannelNumber);
}

/**
 * Legacy functions for backward compatibility
 */
export function getFRSChannels(startChannelNumber: number = 1): Channel[] {
  return getChannelsForSet('FRS', startChannelNumber);
}

export function getGMRSChannels(startChannelNumber: number = 1): Channel[] {
  return getChannelsForSet('GMRS', startChannelNumber);
}

export function getMURSChannels(startChannelNumber: number = 1): Channel[] {
  return getChannelsForSet('MURS', startChannelNumber);
}

export function getHamCallingFrequencies(startChannelNumber: number = 1): Channel[] {
  return getChannelsForSet('Ham Calling', startChannelNumber);
}

/**
 * Get all available fixed channel sets
 * Now uses the centralized data file
 */
export function getAvailableFixedChannelSets(): FixedChannelSet[] {
  return ALL_FIXED_CHANNEL_SETS.map(setData => ({
    name: setData.name,
    description: setData.description,
    channels: frequenciesToChannels(setData),
  }));
}
