/**
 * DMR Repeater Channels Service
 * Converts DMR repeater data to channels based on location
 */

import type { Channel, Zone } from '../models';
import { createDefaultChannel } from '../utils/channelHelpers';
import { generateZoneId } from '../utils/zoneHelpers';
import {
  type RptrData,
  convertRptrFrequency,
  convertRptrOffset,
  parseTimeslots,
  groupRptrsByLocation,
} from '../data/rptrsData';
import { isValidFrequencyRange } from './validation/frequencyValidator';

// Helper to remove distance property for compatibility
function removeDistance(entry: RptrData & { distance?: number }): RptrData {
  const { distance, ...entryData } = entry;
  return entryData;
}

/**
 * Generate channels and zones from DMR repeater data
 * Creates channels for each repeater, with separate channels for each timeslot if multiple timeslots are available
 * @param startChannelNumber - Starting channel number
 * @param selectedRptrs - Array of DMR repeaters to generate channels for (required)
 * @param singleZone - If true, creates one zone with all repeaters. If false, creates zones by grouping.
 * @param groupByLocation - If true, group repeaters by city/state into zones
 * @param createSeparateTimeslots - If true, create separate channels for TS1 and TS2. If false, create one channel per repeater.
 */
export function generateRptrsChannels(
  startChannelNumber: number = 1,
  selectedRptrs: (RptrData & { distance?: number })[], // Required: repeaters to generate channels for
  singleZone: boolean = false, // If true, group all repeaters in one zone
  groupByLocation: boolean = true, // If true, group repeaters by location into zones
  createSeparateTimeslots: boolean = true // If true, create separate channels for each timeslot
): {
  channels: Channel[];
  zones: Zone[];
  rptrs: RptrData[];
  summary: {
    rptrsFound: number;
    channelsCreated: number;
    zonesCreated: number;
  };
} {
  // Use selected repeaters if provided, otherwise this function should not be called
  if (!selectedRptrs || selectedRptrs.length === 0) {
    throw new Error('No DMR repeaters provided. Load repeaters first using findNearbyRptrs().');
  }
  
  // Remove distance property if present
  const rptrsToProcess = selectedRptrs.map(removeDistance);
  
  // Generate channels
  const channels: Channel[] = [];
  const zones: Zone[] = [];
  let channelNumber = startChannelNumber;
  
  // If single zone mode, collect all channels first
  const allZoneChannels: number[] = [];
  
  // Deduplicate repeaters: if same callsign AND frequency AND color code, only keep one
  const uniqueRptrs = new Map<string, RptrData>();
  for (const rptr of rptrsToProcess) {
    const freqMhz = convertRptrFrequency(rptr.frequency);
    const key = `${rptr.callsign}|${freqMhz.toFixed(3)}|${rptr.color_code}`;
    if (!uniqueRptrs.has(key)) {
      uniqueRptrs.set(key, rptr);
    }
  }
  
  // Group repeaters if requested
  let locationGroups: Map<string, RptrData[]> | null = null;
  
  if (!singleZone && groupByLocation) {
    locationGroups = groupRptrsByLocation(Array.from(uniqueRptrs.values()), 2);
  }
  
  // Track channels by repeater+timeslot to avoid duplicates
  const channelMap = new Map<string, Channel>();
  
  // Create channels for each repeater
  for (const rptr of uniqueRptrs.values()) {
    const freqMhz = convertRptrFrequency(rptr.frequency);
    const offsetMhz = convertRptrOffset(rptr.offset);
    const rxFrequency = freqMhz; // Repeater output (user RX)
    const txFrequency = freqMhz + offsetMhz; // User TX (repeater input)
    
    // Filter out repeaters with frequencies outside supported ranges (87-174 MHz or 400-470 MHz)
    if (!isValidFrequencyRange(rxFrequency) || !isValidFrequencyRange(txFrequency)) {
      console.warn(`Skipping DMR repeater ${rptr.callsign} - frequency ${rxFrequency.toFixed(4)} MHz outside supported range (87-174 MHz or 400-470 MHz)`);
      continue;
    }
    
    // Parse timeslots
    const timeslots = parseTimeslots(rptr.ts_linked);
    
    // Create channels for each timeslot (or just one if createSeparateTimeslots is false)
    const slotsToCreate = createSeparateTimeslots ? timeslots : [timeslots[0] || 1];
    
    for (const timeslot of slotsToCreate) {
      // Create channel name: "CALLSIGN-1" or "CALLSIGN-2" for timeslots, or just "CALLSIGN" if single timeslot
      let channelName = rptr.callsign;
      if (createSeparateTimeslots && timeslots.length > 1) {
        channelName += `-${timeslot}`;
      }
      // Truncate to 16 chars max
      if (channelName.length > 16) {
        channelName = channelName.substring(0, 16);
      }
      
      // Create unique key for this repeater+timeslot combination
      const channelKey = `${rptr.callsign}|${freqMhz.toFixed(3)}|${rptr.color_code}|TS${timeslot}`;
      let channel = channelMap.get(channelKey);
      
      if (!channel) {
        // Create new DMR channel
        channel = createDefaultChannel({
          number: channelNumber++,
          name: channelName,
          rxFrequency,
          txFrequency,
          mode: 'Digital', // DMR is always digital
          bandwidth: '12.5kHz', // DMR uses 12.5kHz bandwidth
          power: 'High',
          scanAdd: true,
          colorCode: rptr.color_code,
          // Note: timeslot information is typically handled via contact/talkgroup settings
          // The slotOperation field in Channel might be used, but it's not clear from the model
          // For now, we'll create separate channels for each timeslot
        });
        
        // Set slotOperation: stored at 0x1D bit 4 (0=TS1, 1=TS2)
        channel.slotOperation = timeslot === 1 ? 0 : 1; // TS1 → 0, TS2 → 1
        
        channelMap.set(channelKey, channel);
        channels.push(channel);
      }
      
      if (singleZone) {
        // Collect all channels for single zone
        if (!allZoneChannels.includes(channel.number)) {
          allZoneChannels.push(channel.number);
        }
      } else if (locationGroups) {
        // Group by location
        for (const [locationName, locationRptrs] of locationGroups.entries()) {
          if (locationRptrs.some(r => 
            r.callsign === rptr.callsign && 
            Math.abs(convertRptrFrequency(r.frequency) - freqMhz) < 0.001 &&
            r.color_code === rptr.color_code
          )) {
            // Add "DMR-" prefix to distinguish from other zone types
            const zoneName = `DMR-${locationName}`.substring(0, 10);
            let existingZone = zones.find(z => z.name === zoneName);
            if (!existingZone) {
              existingZone = {
                id: generateZoneId(),
                name: zoneName,
                channels: [],
              };
              zones.push(existingZone);
            }
            // Only add if not already present
            if (!existingZone.channels.includes(channel.number)) {
              existingZone.channels.push(channel.number);
            }
            break; // Repeater can only belong to one location
          }
        }
      } else {
        // Create individual zones for each repeater (using callsign, no prefix)
        const zoneName = rptr.callsign.length > 10 ? rptr.callsign.substring(0, 10) : rptr.callsign;
        let existingZone = zones.find(z => z.name === zoneName);
        if (!existingZone) {
          existingZone = {
            id: generateZoneId(),
            name: zoneName,
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
  
  // Create single zone with all repeaters (if single zone mode)
  if (singleZone && allZoneChannels.length > 0) {
    // Deduplicate channel numbers
    const uniqueChannels = Array.from(new Set(allZoneChannels));
    zones.push({
      id: generateZoneId(),
      name: 'DMR Rptrs',
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
    rptrs: rptrsToProcess,
    summary: {
      rptrsFound: rptrsToProcess.length,
      channelsCreated: channels.length,
      zonesCreated: zones.length,
    },
  };
}
