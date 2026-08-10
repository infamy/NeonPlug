/**
 * Channel Merger
 * Merges overlapping channels (same frequencies) from different sets
 */

import type { Channel } from '../models';


/**
 * Merge two overlapping channels into one
 * Combines names and uses the higher power setting
 */
function mergeChannels(ch1: Channel, ch2: Channel): Channel {
  // Combine names (e.g., "FRS 1" + "GMRS 1" = "FRS/GMRS 1")
  let mergedName = ch1.name;
  if (ch2.name && !ch1.name.includes(ch2.name.split(' ')[0])) {
    // Extract the service name (e.g., "FRS" from "FRS 1")
    const ch1Service = ch1.name.split(' ')[0];
    const ch2Service = ch2.name.split(' ')[0];
    
    if (ch1Service !== ch2Service) {
      mergedName = `${ch1Service}/${ch2Service} ${ch1.name.split(' ').slice(1).join(' ') || ch1.name.split(' ')[1] || ''}`.trim();
    }
  }
  
  // Truncate to 16 characters (channel name limit)
  if (mergedName.length > 16) {
    mergedName = mergedName.substring(0, 16);
  }
  
  // Use higher power (High > Medium > Low)
  const powerOrder = { 'Low': 0, 'Medium': 1, 'High': 2 };
  const power = powerOrder[ch1.power] >= powerOrder[ch2.power] ? ch1.power : ch2.power;
  
  // Merge other settings - prefer ch1 but use ch2 if ch1 has defaults
  return {
    ...ch1,
    name: mergedName,
    power,
    // Use scanAdd if either channel has it enabled
    scanAdd: ch1.scanAdd || ch2.scanAdd,
  };
}

/**
 * Merge overlapping channels from multiple channel sets
 * Returns merged channels and a map of original channel numbers to merged channel numbers
 */
export function mergeOverlappingChannels(
  channelSets: Channel[][],
  startChannelNumber: number = 1
): {
  mergedChannels: Channel[];
  channelMapping: Map<number, number>; // original channel number -> merged channel number
} {
  const mergedChannels: Channel[] = [];
  const channelMapping = new Map<number, number>();
  const frequencyMap = new Map<string, Channel>(); // "rx-tx" -> channel
  
  let nextChannelNumber = startChannelNumber;

  // Process all channels from all sets
  for (const channelSet of channelSets) {
    for (const channel of channelSet) {
      // Digital channels commonly share an RX/TX pair on purpose — multiple talk groups
      // or timeslots on the same repeater/hotspot frequency are distinct channels, not
      // duplicates. Only collapse them if color code, slot, and talk group also match;
      // analog channels keep the plain frequency-only key (e.g. FRS/GMRS overlap merging).
      const freqKey = channel.mode === 'Digital' || channel.mode === 'Fixed Digital'
        ? `${channel.rxFrequency.toFixed(4)}-${channel.txFrequency.toFixed(4)}-${channel.colorCode}-${channel.slotOperation ?? 0}-${channel.contactId}`
        : `${channel.rxFrequency.toFixed(4)}-${channel.txFrequency.toFixed(4)}`;

      if (frequencyMap.has(freqKey)) {
        // Channel with same frequencies exists - merge them
        const existingChannel = frequencyMap.get(freqKey)!;
        const mergedChannel = mergeChannels(existingChannel, channel);

        // Update the merged channel in the map
        frequencyMap.set(freqKey, mergedChannel);

        // Update the merged channel in the array
        const existingIndex = mergedChannels.findIndex(ch =>
          ch.number === existingChannel.number
        );
        if (existingIndex >= 0) {
          mergedChannels[existingIndex] = { ...mergedChannel, number: existingChannel.number };
        }

        // Map original channel number to merged channel number
        channelMapping.set(channel.number, existingChannel.number);
      } else {
        // New unique frequency - add as new channel
        const newChannel = {
          ...channel,
          number: nextChannelNumber++,
        };

        frequencyMap.set(freqKey, newChannel);
        mergedChannels.push(newChannel);

        // Map original channel number to new channel number
        channelMapping.set(channel.number, newChannel.number);
      }
    }
  }
  
  return { mergedChannels, channelMapping };
}

/**
 * Merge new channel sets against each other AND against the existing channel list.
 *
 * - Overlapping frequencies WITHIN the new sets are merged (combined name, higher power).
 * - A new channel whose full key (frequency + name + mode + bandwidth + power + tones)
 *   matches an existing channel is dropped and mapped to the existing channel's number.
 * - Existing channels are never renumbered, merged, or modified.
 *
 * IMPORTANT: channel numbers must be unique ACROSS all newChannelSets — the returned
 * mapping is keyed by them. Number each set with a distinct range before calling
 * (e.g. set 1 → 1..N, set 2 → N+1..M).
 *
 * Returns the channels to append and a mapping from each new channel's original
 * number to its final number, for remapping zone/scan-list references.
 */
export function mergeChannelSetsWithExisting(
  existingChannels: Channel[],
  newChannelSets: Channel[][],
  startChannelNumber: number
): {
  channelsToAdd: Channel[];
  channelMapping: Map<number, number>; // original number -> final number
} {
  const existingChannelMap = new Map<string, number>(); // full key -> channel number
  for (const ch of existingChannels) {
    existingChannelMap.set(getChannelFullKey(ch), ch.number);
  }

  const { mergedChannels, channelMapping } = mergeOverlappingChannels(newChannelSets, startChannelNumber);

  const finalChannelMapping = new Map<number, number>();
  const channelsToAdd: Channel[] = [];

  for (const newChannel of mergedChannels) {
    const fullKey = getChannelFullKey(newChannel);
    // An exact match reuses the existing channel; otherwise the channel is added.
    const finalNumber = existingChannelMap.get(fullKey) ?? newChannel.number;
    if (finalNumber === newChannel.number) {
      channelsToAdd.push(newChannel);
    }
    for (const [origNum, mergedNum] of channelMapping.entries()) {
      if (mergedNum === newChannel.number) {
        finalChannelMapping.set(origNum, finalNumber);
      }
    }
  }

  return { channelsToAdd, channelMapping: finalChannelMapping };
}

/**
 * Get a frequency key for a channel (for comparison)
 */
export function getChannelFrequencyKey(channel: Channel): string {
  return `${channel.rxFrequency.toFixed(4)}-${channel.txFrequency.toFixed(4)}`;
}

/**
 * Get a complete channel key for exact duplicate detection
 * Includes frequency, name, mode, bandwidth, power, and CTCSS/DCS
 */
export function getChannelFullKey(channel: Channel): string {
  const rxCtcss = channel.rxCtcssDcs 
    ? `${channel.rxCtcssDcs.type}-${channel.rxCtcssDcs.value}${channel.rxCtcssDcs.polarity || ''}`
    : 'none';
  const txCtcss = channel.txCtcssDcs
    ? `${channel.txCtcssDcs.type}-${channel.txCtcssDcs.value}${channel.txCtcssDcs.polarity || ''}`
    : 'none';
    
  return [
    channel.rxFrequency.toFixed(4),
    channel.txFrequency.toFixed(4),
    channel.name,
    channel.mode,
    channel.bandwidth,
    channel.power,
    rxCtcss,
    txCtcss,
  ].join('|');
}