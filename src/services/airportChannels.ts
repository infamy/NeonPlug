/**
 * Airport Channels Service
 * Converts airport data to channels based on location
 */

import type { Channel, Zone } from '../models';
import { createDefaultChannel } from '../utils/channelHelpers';
import { findNearbyAirports, getAirportFrequenciesWithTypes, type AirportData } from '../data/airportsData';

// Helper to remove distance property for compatibility
function removeDistance(airport: AirportData & { distance?: number }): AirportData {
  const { distance, ...airportData } = airport;
  return airportData;
}

/**
 * Get airport code (ICAO) from airport data
 */
function getAirportCode(airport: AirportData): string {
  return airport.c;
}

/**
 * Generate channels and zones from nearby airports
 * Creates one zone per airport, with channels named "AIRPORT_CODE TYPE"
 * @param singleZone - If true, creates one zone with all airports. If false, creates one zone per airport.
 */
export function generateAirportChannels(
  latitude: number,
  longitude: number,
  radius: number = 50, // miles
  startChannelNumber: number = 1,
  selectedAirports?: AirportData[], // Optional: only generate for these airports
  singleZone: boolean = false // If true, group all airports in one zone
): {
  channels: Channel[];
  zones: Zone[];
  airports: AirportData[];
  summary: {
    airportsFound: number;
    channelsCreated: number;
    zonesCreated: number;
  };
} {
  // Find nearby airports (returns with distance property)
  const nearbyAirportsWithDistance = findNearbyAirports(latitude, longitude, radius);
  const nearbyAirports = nearbyAirportsWithDistance.map(removeDistance);
  
  // Filter to selected airports if provided
  const airportsToProcess = selectedAirports || nearbyAirports;
  
  // Generate channels
  const channels: Channel[] = [];
  const zones: Zone[] = [];
  let channelNumber = startChannelNumber;
  
  // If single zone mode, collect all channels first
  const allZoneChannels: number[] = [];
  
  for (const airport of airportsToProcess) {
    const airportCode = getAirportCode(airport);
    const frequencies = getAirportFrequenciesWithTypes(airport);
    
    if (frequencies.length === 0) {
      continue;
    }
    
    const airportZoneChannels: number[] = [];
    
    // Create a channel for each frequency
    for (const freqInfo of frequencies) {
      // Channel name: "AIRPORT_CODE TYPE" (e.g., "CZBB TWR" or "CZBB CTAF")
      // Use shorter abbreviations for common types to save space
      const typeAbbrevs: Record<string, string> = {
        'CTAF': 'CTAF',
        'UNICOM': 'UNI',
        'TOWER': 'TWR',
        'GROUND': 'GND',
        'APP': 'APP',
        'ATIS': 'ATIS',
        'DEP': 'DEP',
        'MISC': 'MISC',
        'ASOW': 'ASOW',
        'FSS': 'FSS',
        'RADIO': 'RAD',
        'CLD': 'CLD',
        'INFO': 'INFO',
        'AFIS': 'AFIS',
        'A/G': 'A/G',
        'OPS': 'OPS',
        'RADAR': 'RDR',
        'APRON': 'APR',
        'ATF': 'ATF',
        'RCO': 'RCO',
        'TRAFFIC': 'TRF',
        'TMA': 'TMA',
        'ASOS': 'ASOS',
        'PAL': 'PAL',
        'AAS': 'AAS',
        'DIR': 'DIR',
        'A/A': 'A/A',
        'FCC': 'FCC',
        'ACP': 'ACP',
        'TIBA': 'TIBA',
        'A/D': 'A/D',
        'ACC': 'ACC',
        'ARTC': 'ARTC',
      };
      
      const typeAbbrev = typeAbbrevs[freqInfo.type] || freqInfo.type;
      const maxTypeLength = 16 - airportCode.length - 1; // -1 for space
      let typeName = typeAbbrev;
      if (typeName.length > maxTypeLength) {
        typeName = typeName.substring(0, maxTypeLength);
      }
      const channelName = `${airportCode} ${typeName}`;
      
      const channel = createDefaultChannel({
        number: channelNumber++,
        name: channelName,
        rxFrequency: freqInfo.frequency / 1000, // Convert kHz to MHz
        txFrequency: freqInfo.frequency / 1000,
        mode: 'Analog',
        bandwidth: '25kHz', // Aviation uses 25kHz spacing
        power: 'High',
        scanAdd: true,
        busyLock: 'Off',
      });
      
      channels.push(channel);
      
      if (singleZone) {
        // Collect all channels for single zone
        allZoneChannels.push(channel.number);
      } else {
        // Collect channels for individual airport zone
        airportZoneChannels.push(channel.number);
      }
    }
    
    // Create zone with airport code as name (only in individual mode)
    if (!singleZone && airportZoneChannels.length > 0) {
      zones.push({
        name: airportCode,
        channels: airportZoneChannels,
      });
    }
  }
  
  // Create single zone with all airports (if single zone mode)
  if (singleZone && allZoneChannels.length > 0) {
    zones.push({
      name: 'Airports',
      channels: allZoneChannels,
    });
  }
  
  return {
    channels,
    zones,
    airports: airportsToProcess,
    summary: {
      airportsFound: airportsToProcess.length,
      channelsCreated: channels.length,
      zonesCreated: zones.length,
    },
  };
}

