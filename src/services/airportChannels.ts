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
 * Common / itinerant aircraft VHF frequencies (nationwide, not airport-specific).
 * Source: RadioReference "Aircraft" wiki – Common Civilian Frequencies.
 * These are receive-only airband channels useful alongside airport channels.
 */
export interface CommonAircraftFrequency {
  freq: number;
  name: string;
}

export const COMMON_AIRCRAFT_FREQUENCIES: CommonAircraftFrequency[] = [
  { freq: 121.5, name: 'Guard 121.5' },
  { freq: 122.7, name: 'Unicom 122.7' },
  { freq: 122.725, name: 'Unicom 122.725' },
  { freq: 122.75, name: 'Air-Air 122.75' },
  { freq: 122.8, name: 'Unicom 122.8' },
  { freq: 122.85, name: 'Multicom 122.85' },
  { freq: 122.9, name: 'Multicom 122.9' },
  { freq: 122.925, name: 'Multicom 122.92' },
  { freq: 122.95, name: 'Unicom 122.95' },
  { freq: 122.975, name: 'Unicom 122.975' },
  { freq: 123.0, name: 'Unicom 123.0' },
  { freq: 123.025, name: 'Helo A-A 123.02' },
  { freq: 123.05, name: 'Unicom 123.05' },
  { freq: 123.075, name: 'Unicom 123.075' },
  { freq: 123.1, name: 'SAR 123.1' },
  { freq: 123.45, name: 'Air-Air 123.45' },
];

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
 * @param commonFrequencies - Common/itinerant aircraft frequencies to also add. In single-zone mode they are
 *   appended to the "Airports" zone; in individual-zone mode they are placed in a separate "Aircraft" zone.
 */
export function generateAirportChannels(
  startChannelNumber: number = 1,
  selectedAirports: AirportData[], // Required: airports to generate channels for
  singleZone: boolean = false, // If true, group all airports in one zone
  commonFrequencies: CommonAircraftFrequency[] = [] // Common aircraft frequencies to also add
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
    // Optionally append common / itinerant aircraft frequencies to the zone
    for (const common of commonFrequencies) {
      const channel = createDefaultChannel({
        number: channelNumber++,
        name: common.name,
        rxFrequency: common.freq,
        txFrequency: NO_TX_FREQUENCY, // Receive-only: TX stored as 0xFF on radio
        forbidTx: true,
        mode: 'Analog',
        bandwidth: '25kHz', // Aviation uses 25kHz spacing
        power: 'High',
        scanAdd: true,
      });
      channels.push(channel);
      allZoneChannels.push(channel.number);
    }

    zones.push({
      id: generateZoneId(),
      name: 'Airports',
      channels: allZoneChannels,
    });
  }

  // In individual-zone mode, add common frequencies as their own "Aircraft" zone
  if (!singleZone && commonFrequencies.length > 0) {
    const commonZoneChannels: number[] = [];
    for (const common of commonFrequencies) {
      const channel = createDefaultChannel({
        number: channelNumber++,
        name: common.name,
        rxFrequency: common.freq,
        txFrequency: NO_TX_FREQUENCY, // Receive-only: TX stored as 0xFF on radio
        forbidTx: true,
        mode: 'Analog',
        bandwidth: '25kHz', // Aviation uses 25kHz spacing
        power: 'High',
        scanAdd: true,
      });
      channels.push(channel);
      commonZoneChannels.push(channel.number);
    }
    zones.push({
      id: generateZoneId(),
      name: 'Aircraft',
      channels: commonZoneChannels,
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


/**
 * Airband edges, in MHz. The civil VHF air band, which is AM and receive-only
 * on these radios.
 */
export const AIRBAND_MIN_MHZ = 108;
export const AIRBAND_MAX_MHZ = 137;

/** True when a frequency belongs in a separate AM airband table. */
export function isAirbandFrequency(mhz: number): boolean {
  return mhz >= AIRBAND_MIN_MHZ && mhz < AIRBAND_MAX_MHZ;
}

/**
 * Split generated channels by where the radio actually stores them.
 *
 * On a radio with `separateAirbandTable`, an AM airband frequency CANNOT go in
 * the main channel list: that record has no way to express AM receive-only, and
 * writing one there corrupts the codeplug. The airband entries are returned
 * separately so the caller can put them in the AM table instead.
 *
 * Zones are rebuilt to reference only the channels that stayed behind. A zone
 * pointing at a channel number that was diverted would dangle, and on this
 * family a dangling zone member is exactly the kind of thing that gets written
 * to the radio and then cannot be explained.
 */
export function splitAirbandChannels(
  channels: Channel[],
  zones: Zone[]
): { channels: Channel[]; zones: Zone[]; airband: Channel[] } {
  const airband = channels.filter((c) => isAirbandFrequency(c.rxFrequency));
  if (airband.length === 0) return { channels, zones, airband: [] };

  const diverted = new Set(airband.map((c) => c.number));
  const kept = channels.filter((c) => !diverted.has(c.number));
  const keptNumbers = new Set(kept.map((c) => c.number));

  const rebuiltZones = zones
    .map((z) => ({ ...z, channels: z.channels.filter((n) => keptNumbers.has(n)) }))
    // A zone whose every member was airband has nothing left to hold.
    .filter((z) => z.channels.length > 0);

  return { channels: kept, zones: rebuiltZones, airband };
}
