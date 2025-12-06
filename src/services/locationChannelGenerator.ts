/**
 * Location-based Channel and Zone Generator
 * Converts repeater data into channels and zones
 */

import type { Channel, Zone } from '../models';
import type { Repeater } from './repeaterFinder';
import { createDefaultChannel } from '../utils/channelHelpers';
import { getStandardOffset } from './repeaterFinder';

export interface GenerationOptions {
  startChannelNumber?: number; // Starting channel number (default: find next available)
  groupByDistance?: boolean; // Group repeaters into zones by distance
  groupByBand?: boolean; // Group repeaters into zones by band
  maxDistancePerZone?: number; // Max distance in miles for zone grouping (default: 25)
  zoneNameTemplate?: string; // Template for zone names (default: "{band} - {region}")
}

export interface GenerationResult {
  channels: Channel[];
  zones: Zone[];
  summary: {
    channelsCreated: number;
    zonesCreated: number;
    repeatersProcessed: number;
  };
}

/**
 * Generate channels from repeaters
 */
export function generateChannelsFromRepeaters(
  repeaters: Repeater[],
  existingChannels: Channel[],
  options: GenerationOptions = {}
): Channel[] {
  const {
    startChannelNumber,
  } = options;
  
  // Find starting channel number
  const existingNumbers = new Set(existingChannels.map(ch => ch.number));
  let nextChannelNumber = startChannelNumber || 1;
  while (existingNumbers.has(nextChannelNumber)) {
    nextChannelNumber++;
  }
  
  const channels: Channel[] = [];
  
  for (const repeater of repeaters) {
    // Calculate input frequency (user TX, repeater RX)
    const inputOffset = repeater.inputOffset || getStandardOffset(repeater.band);
    const txFrequency = repeater.frequency + inputOffset;
    const rxFrequency = repeater.frequency;
    
    // Determine mode
    let mode: Channel['mode'] = 'Analog';
    if (repeater.mode === 'DMR') mode = 'Digital';
    else if (repeater.mode === 'D-STAR' || repeater.mode === 'C4FM' || repeater.mode === 'P25' || repeater.mode === 'NXDN') {
      mode = 'Fixed Digital';
    }
    
    // Parse CTCSS/DCS
    let rxCtcssDcs: Channel['rxCtcssDcs'] = { type: 'None' };
    let txCtcssDcs: Channel['txCtcssDcs'] = { type: 'None' };
    
    if (repeater.ctcss) {
      rxCtcssDcs = { type: 'CTCSS', value: repeater.ctcss };
      txCtcssDcs = { type: 'CTCSS', value: repeater.ctcss };
    } else if (repeater.dcs) {
      rxCtcssDcs = { type: 'DCS', value: repeater.dcs, polarity: 'N' };
      txCtcssDcs = { type: 'DCS', value: repeater.dcs, polarity: 'N' };
    }
    
    // Create channel name
    let channelName = repeater.callsign;
    if (repeater.location) {
      channelName += ` ${repeater.location}`;
    }
    if (channelName.length > 16) {
      channelName = channelName.substring(0, 16);
    }
    
    // Determine bandwidth based on band
    let bandwidth: Channel['bandwidth'] = '25kHz';
    if (repeater.band === '2m' || repeater.band === '70cm') {
      bandwidth = '25kHz'; // Most modern repeaters use 25kHz
    } else if (repeater.band === '6m' || repeater.band === '10m') {
      bandwidth = '25kHz';
    }
    
    // Create channel
    const channel = createDefaultChannel({
      number: nextChannelNumber++,
      name: channelName,
      rxFrequency,
      txFrequency,
      mode,
      bandwidth,
      rxCtcssDcs,
      txCtcssDcs,
      power: 'High', // Repeaters typically need high power
      scanAdd: true, // Add to scan by default
      busyLock: 'Off',
    });
    
    channels.push(channel);
  }
  
  return channels;
}

/**
 * Generate zones from repeaters and channels
 */
export function generateZonesFromRepeaters(
  repeaters: Repeater[],
  channels: Channel[],
  options: GenerationOptions = {}
): Zone[] {
  const {
    groupByDistance = false,
    groupByBand = true,
    maxDistancePerZone = 25,
  } = options;
  
  const zones: Zone[] = [];
  
  if (groupByBand) {
    // Group by band (2m, 70cm, etc.)
    const bands = new Set(repeaters.map(r => r.band));
    
    for (const band of bands) {
      const bandRepeaters = repeaters.filter(r => r.band === band);
      const bandChannels = channels.filter(ch => {
        const repeater = bandRepeaters.find(r => {
          const offset = r.inputOffset || getStandardOffset(r.band);
          return Math.abs(ch.rxFrequency - r.frequency) < 0.001 &&
                 Math.abs(ch.txFrequency - (r.frequency + offset)) < 0.001;
        });
        return !!repeater;
      });
      
      if (bandChannels.length > 0) {
        zones.push({
          name: `${band.toUpperCase()} Repeaters`,
          channels: bandChannels.map(ch => ch.number),
        });
      }
    }
  } else if (groupByDistance) {
    // Group by distance regions
    const sortedRepeaters = [...repeaters].sort((a, b) => 
      (a.distance || 0) - (b.distance || 0)
    );
    
    let currentZoneRepeaters: Repeater[] = [];
    let currentZoneStartDistance = 0;
    
    for (const repeater of sortedRepeaters) {
      const distance = repeater.distance || 0;
      
      if (currentZoneRepeaters.length === 0) {
        currentZoneRepeaters = [repeater];
        currentZoneStartDistance = distance;
      } else if (distance - currentZoneStartDistance <= maxDistancePerZone) {
        currentZoneRepeaters.push(repeater);
      } else {
        // Create zone from current group
        const zoneChannels = channels.filter(ch => {
          return currentZoneRepeaters.some(r => {
            const offset = r.inputOffset || getStandardOffset(r.band);
            return Math.abs(ch.rxFrequency - r.frequency) < 0.001 &&
                   Math.abs(ch.txFrequency - (r.frequency + offset)) < 0.001;
          });
        });
        
        if (zoneChannels.length > 0) {
          const zoneName = `${currentZoneStartDistance.toFixed(1)}-${(currentZoneStartDistance + maxDistancePerZone).toFixed(1)} mi`;
          zones.push({
            name: zoneName,
            channels: zoneChannels.map(ch => ch.number),
          });
        }
        
        // Start new zone
        currentZoneRepeaters = [repeater];
        currentZoneStartDistance = distance;
      }
    }
    
    // Create final zone
    if (currentZoneRepeaters.length > 0) {
      const zoneChannels = channels.filter(ch => {
        return currentZoneRepeaters.some(r => {
          const offset = r.inputOffset || getStandardOffset(r.band);
          return Math.abs(ch.rxFrequency - r.frequency) < 0.001 &&
                 Math.abs(ch.txFrequency - (r.frequency + offset)) < 0.001;
        });
      });
      
      if (zoneChannels.length > 0) {
        const zoneName = `${currentZoneStartDistance.toFixed(1)}+ mi`;
        zones.push({
          name: zoneName,
          channels: zoneChannels.map(ch => ch.number),
        });
      }
    }
  } else {
    // Single zone with all repeaters
    zones.push({
      name: 'Location Repeaters',
      channels: channels.map(ch => ch.number),
    });
  }
  
  return zones;
}

/**
 * Generate channels and zones from repeaters
 */
export function generateChannelsAndZones(
  repeaters: Repeater[],
  existingChannels: Channel[],
  options: GenerationOptions = {}
): GenerationResult {
  const channels = generateChannelsFromRepeaters(repeaters, existingChannels, options);
  const zones = generateZonesFromRepeaters(repeaters, channels, options);
  
  return {
    channels,
    zones,
    summary: {
      channelsCreated: channels.length,
      zonesCreated: zones.length,
      repeatersProcessed: repeaters.length,
    },
  };
}

