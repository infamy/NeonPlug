/**
 * Airport Channels Service
 * Converts airport data to channels based on location
 */

import type { Channel, Zone } from '../models';
import { createDefaultChannel } from '../utils/channelHelpers';
import { generateZoneId } from '../utils/zoneHelpers';
import { getAirportFrequenciesWithTypes, type AirportData } from '../data/airportsData';
import { NO_TX_FREQUENCY } from './validation/frequencyValidator';

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
 * Generate channels and zones from airport data
 * Creates one zone per airport, with channels named "AIRPORT_CODE TYPE"
 * @param startChannelNumber - Starting channel number
 * @param selectedAirports - Array of airports to generate channels for (required)
 * @param singleZone - If true, creates one zone with all airports. If false, creates one zone per airport.
 */
export function generateAirportChannels(
  startChannelNumber: number = 1,
  selectedAirports: AirportData[], // Required: airports to generate channels for
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
  // Use selected airports if provided, otherwise this function should not be called
  // (The caller should load airports first using findNearbyAirports)
  if (!selectedAirports || selectedAirports.length === 0) {
    throw new Error('No airports provided. Load airports first using findNearbyAirports().');
  }
  
  // Remove distance property if present
  const airportsToProcess = selectedAirports.map(removeDistance);
  
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
      let channelName = `${airportCode} ${typeName}`;
      
      // Final safety check: ensure name is never longer than 16 characters
      if (channelName.length > 16) {
        channelName = channelName.substring(0, 16);
      }
      
      const channel = createDefaultChannel({
        number: channelNumber++,
        name: channelName,
        rxFrequency: freqInfo.frequency / 1000, // Convert kHz to MHz
        txFrequency: NO_TX_FREQUENCY, // Receive-only (87–136 MHz): TX stored as 0xFF on radio
        forbidTx: true,
        mode: 'Analog',
        bandwidth: '25kHz', // Aviation uses 25kHz spacing
        power: 'High',
        scanAdd: true,
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
        id: generateZoneId(),
        name: airportCode,
        channels: airportZoneChannels,
      });
    }
  }
  
  // Create single zone with all airports (if single zone mode)
  if (singleZone && allZoneChannels.length > 0) {
    zones.push({
      id: generateZoneId(),
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

