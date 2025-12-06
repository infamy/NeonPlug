/**
 * TAFL Channels Service
 * Converts TAFL data to channels based on location
 */

import type { Channel, Zone } from '../models';
import { createDefaultChannel } from '../utils/channelHelpers';
import { findNearbyTaflEntries, groupTaflEntriesByName, type TaflData } from '../data/taflData';

// Helper to remove distance property for compatibility
function removeDistance(entry: TaflData & { distance?: number }): TaflData {
  const { distance, ...entryData } = entry;
  return entryData;
}

/**
 * Get entry code from TAFL data
 */
function getEntryCode(entry: TaflData): string {
  return entry.c;
}

/**
 * Generate channels and zones from nearby TAFL entries
 * Creates one zone per entry, with channels named "ENTRY_CODE"
 * @param singleZone - If true, creates one zone with all entries. If false, creates one zone per entry.
 */
export function generateTaflChannels(
  latitude: number,
  longitude: number,
  radius: number = 50, // miles
  startChannelNumber: number = 1,
  selectedEntries?: TaflData[], // Optional: only generate for these entries
  singleZone: boolean = false, // If true, group all entries in one zone
  groupByName: boolean = true // If true, group entries by name prefix into zones
): {
  channels: Channel[];
  zones: Zone[];
  entries: TaflData[];
  summary: {
    entriesFound: number;
    channelsCreated: number;
    zonesCreated: number;
  };
} {
  // Find nearby TAFL entries (returns with distance property)
  const nearbyEntriesWithDistance = findNearbyTaflEntries(latitude, longitude, radius);
  const nearbyEntries = nearbyEntriesWithDistance.map(removeDistance);
  
  // Filter to selected entries if provided
  const entriesToProcess = selectedEntries || nearbyEntries;
  
  // Generate channels
  const channels: Channel[] = [];
  const zones: Zone[] = [];
  let channelNumber = startChannelNumber;
  
  // If single zone mode, collect all channels first
  const allZoneChannels: number[] = [];
  
  // Deduplicate entries: if same name AND frequency, only keep one
  const uniqueEntries = new Map<string, TaflData>();
  for (const entry of entriesToProcess) {
    const freqMhz = entry.f / 1000.0; // Convert kHz to MHz
    const key = `${entry.c}|${freqMhz.toFixed(3)}`; // Use name + frequency as unique key
    if (!uniqueEntries.has(key)) {
      uniqueEntries.set(key, entry);
    }
  }
  
  // Now group by frequency for channel creation (using deduplicated entries)
  const freqMap = new Map<number, TaflData[]>();
  for (const entry of uniqueEntries.values()) {
    const freqMhz = entry.f / 1000.0;
    if (!freqMap.has(freqMhz)) {
      freqMap.set(freqMhz, []);
    }
    freqMap.get(freqMhz)!.push(entry);
  }
  
  // Group entries by name if requested (using deduplicated entries)
  let nameGroups: Map<string, TaflData[]> | null = null;
  if (groupByName && !singleZone) {
    nameGroups = groupTaflEntriesByName(Array.from(uniqueEntries.values()), 2);
  }
  
  // Track channels by name+frequency to avoid duplicates
  const channelMap = new Map<string, Channel>();
  
  for (const [freqMhz, entries] of freqMap.entries()) {
    // Create channel name from entry codes
    const entryCodes = entries.map(e => getEntryCode(e));
    const channelName = entryCodes.length === 1 
      ? entryCodes[0].substring(0, 16) // Single entry, use its code
      : `${entryCodes[0].substring(0, 12)} +${entryCodes.length - 1}`; // Multiple entries, show first + count
    
    // Check if we already have a channel with this name and frequency
    const channelKey = `${channelName}|${freqMhz.toFixed(3)}`;
    let channel = channelMap.get(channelKey);
    
    if (!channel) {
      // Create new channel
      channel = createDefaultChannel({
        number: channelNumber++,
        name: channelName,
        rxFrequency: freqMhz,
        txFrequency: freqMhz,
        mode: 'Analog',
        bandwidth: '25kHz', // Default bandwidth
        power: 'High',
        scanAdd: true,
        busyLock: 'Off',
      });
      channelMap.set(channelKey, channel);
      channels.push(channel);
    }
    
    if (singleZone) {
      // Collect all channels for single zone
      allZoneChannels.push(channel.number);
    } else if (nameGroups) {
      // Group by name prefix
      // Find which name group(s) contain entries using this frequency
      // Use a Set to track which groups this channel should be in (avoid duplicates)
      const groupsForThisChannel = new Set<string>();
      
      // For each entry at this frequency, find which group it belongs to
      for (const entry of entries) {
        for (const [groupName, groupEntries] of nameGroups.entries()) {
          // Check if this exact entry (by name and frequency) is in the group
          if (groupEntries.some(e => e.c === entry.c && Math.abs(e.f - entry.f) < 0.001)) {
            groupsForThisChannel.add(groupName);
            break; // Entry can only belong to one group
          }
        }
      }
      
      // Add this channel to each relevant zone (only once per zone)
      for (const groupName of groupsForThisChannel) {
        const zoneName = groupName.substring(0, 16);
        let existingZone = zones.find(z => z.name === zoneName);
        if (!existingZone) {
          existingZone = {
            name: zoneName, // Zone names limited to 16 chars
            channels: [],
          };
          zones.push(existingZone);
        }
        // Only add if not already present (deduplicate)
        if (!existingZone.channels.includes(channel.number)) {
          existingZone.channels.push(channel.number);
        }
      }
    } else {
      // Create individual zones for each entry using this frequency
      for (const entry of entries) {
        const entryCode = getEntryCode(entry);
        // Check if zone already exists for this entry code
        let existingZone = zones.find(z => z.name === entryCode);
        if (!existingZone) {
          existingZone = {
            name: entryCode.substring(0, 16), // Zone names limited to 16 chars
            channels: [],
          };
          zones.push(existingZone);
        }
        if (!existingZone.channels.includes(channel.number)) {
          existingZone.channels.push(channel.number);
        }
      }
    }
  }
  
  // Create single zone with all entries (if single zone mode)
  if (singleZone && allZoneChannels.length > 0) {
    // Deduplicate channel numbers
    const uniqueChannels = Array.from(new Set(allZoneChannels));
    zones.push({
      name: 'TAFL',
      channels: uniqueChannels,
    });
  }
  
  // Final pass: ensure no duplicate channels in any zone
  for (const zone of zones) {
    zone.channels = Array.from(new Set(zone.channels));
  }
  
  return {
    channels,
    zones,
    entries: entriesToProcess,
    summary: {
      entriesFound: entriesToProcess.length,
      channelsCreated: channels.length,
      zonesCreated: zones.length,
    },
  };
}

