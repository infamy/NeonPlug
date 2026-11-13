/**
 * Airport frequencies near a place, from data.ferritefw.dev (OurAirports,
 * rebuilt daily). Only the map tiles around the search are downloaded
 * (services/ferrite).
 */

import { findFerriteRowsNear } from '../services/ferrite/client';
import type { ProgressCallback } from '../services/jsonLoader';

// Frequency format: [frequency_khz, type_code] or just frequency_khz (legacy)
type AirportFrequency = number | [number, string];

export interface AirportData {
  c: string; // ICAO code (e.g., "CZBB", "KLAX")
  l: [number, number]; // location: [latitude, longitude]
  f: AirportFrequency | AirportFrequency[]; // frequencies: single [freq, type] or array of [freq, type] or legacy number
}

/**
 * Airports within `radius` miles of a point, nearest first, each with its
 * frequencies and what each is for (TWR, GND, ATIS, CTAF, ...).
 */
export async function findNearbyAirports(
  latitude: number,
  longitude: number,
  radius: number = 50, // miles
  onProgress?: ProgressCallback
): Promise<(AirportData & { distance: number })[]> {
  const rows = await findFerriteRowsNear('airports', latitude, longitude, radius, onProgress);
  // One row per frequency; an airport is its name at its position.
  const airports = new Map<string, AirportData & { distance: number; f: [number, string][] }>();
  for (const row of rows) {
    const key = `${row.name}|${row.lat}|${row.lon}`;
    let airport = airports.get(key);
    if (!airport) {
      airport = { c: row.name, l: [row.lat, row.lon], f: [], distance: row.distance };
      airports.set(key, airport);
    }
    airport.f.push([Math.round(row.mhz * 2000) / 2, row.use ?? '']);
  }
  return [...airports.values()].sort((a, b) => a.distance - b.distance);
}

/**
 * Convert airport frequency from kHz to MHz
 */
export function convertAirportFrequency(khz: number): number {
  return khz / 1000.0;
}

/**
 * Get frequency type based on frequency value
 * Common aviation frequency ranges and their purposes
 */
export function getFrequencyType(freqMhz: number): string {
  const freq = freqMhz;
  
  // Emergency frequency
  if (freq === 121.5) {
    return 'Emergency';
  }
  
  // Ground control (121.6-121.9)
  if (freq >= 121.6 && freq <= 121.9) {
    return 'Ground';
  }
  
  // Common Traffic Advisory Frequency (CTAF) / UNICOM ranges
  if (freq >= 122.0 && freq <= 123.0) {
    // Common CTAF frequencies
    if ([122.7, 122.8, 122.9, 123.0, 123.05].includes(freq)) {
      return 'CTAF';
    }
    // UNICOM frequencies
    if ([122.725, 122.975, 122.95, 123.075].includes(freq)) {
      return 'UNICOM';
    }
    // Default to CTAF for this range
    return 'CTAF/UNICOM';
  }
  
  // Tower / Approach / Departure (118.0-136.975)
  if (freq >= 118.0 && freq <= 136.975) {
    // ATIS typically in lower end
    if (freq >= 118.0 && freq <= 121.0) {
      return 'ATIS/Tower';
    }
    // Approach/Departure typically in middle
    if (freq >= 121.0 && freq <= 124.0) {
      return 'Approach/Departure';
    }
    // Tower typically in upper end
    if (freq >= 124.0 && freq <= 136.975) {
      return 'Tower';
    }
    return 'Tower/Approach';
  }
  
  // AWOS/ASOS (Automated Weather)
  if (freq >= 108.0 && freq < 118.0) {
    return 'AWOS/ASOS';
  }
  
  return 'Aviation';
}

/**
 * Frequency type code mapping (from Python script)
 * Maps short codes back to full type names
 */
const TYPE_CODE_MAP: Record<string, string> = {
  'C': 'CTAF',
  'U': 'UNICOM',
  'T': 'TOWER',
  'G': 'GROUND',
  'A': 'APP',
  'I': 'ATIS',
  'D': 'DEP',
  'M': 'MISC',
  'S': 'ASOW',
  'F': 'FSS',
  'R': 'RADIO',
  'L': 'CLD',
  'N': 'INFO',
  'Z': 'AFIS',
  'Y': 'A/G',
  'O': 'OPS',
  'X': 'RADAR',
  'P': 'APRON',
  'H': 'ATF',
  'Q': 'RCO',
  'V': 'TRAFFIC',
  'W': 'TMA',
  'B': 'ASOS',
  'J': 'PAL',
  'K': 'AAS',
  'E': 'DIR',
  'AA': 'A/A',
  'FC': 'FCC',
  'AC': 'ACP',
  'TB': 'TIBA',
  'AD': 'A/D',
  'CC': 'ACC',
  'RT': 'ARTC',
};

/**
 * Decode frequency type code to full name (exported for use in UI)
 */
export function decodeFrequencyType(code: string): string {
  return TYPE_CODE_MAP[code] || code;
}

/**
 * Get frequency type description
 */
export function getFrequencyTypeDescription(type: string): string {
  // First decode if it's a code
  const fullType = decodeFrequencyType(type);
  
  const descriptions: Record<string, string> = {
    'Emergency': 'Emergency frequency (121.5 MHz)',
    'Ground': 'Ground control - aircraft movement on ground',
    'CTAF': 'Common Traffic Advisory Frequency - pilot-to-pilot communication',
    'UNICOM': 'Universal Communications - advisory services',
    'CTAF/UNICOM': 'CTAF or UNICOM frequency',
    'ATIS/Tower': 'ATIS (weather) or Tower control',
    'Approach/Departure': 'Approach and departure control',
    'Tower': 'Tower control - runway operations',
    'TOWER': 'Tower control - runway operations',
    'TOWER/APP': 'Tower or approach control',
    'AWOS/ASOS': 'Automated weather observing system',
    'ASOS': 'Automated Surface Observing System',
    'ASOW': 'Automated Weather Observing System',
    'APP': 'Approach control',
    'DEP': 'Departure control',
    'GROUND': 'Ground control - aircraft movement on ground',
    'ATIS': 'Automated Terminal Information Service',
    'FSS': 'Flight Service Station',
    'RADIO': 'Radio frequency',
    'MISC': 'Miscellaneous',
    'INFO': 'Information',
    'AFIS': 'Aerodrome Flight Information Service',
    'OPS': 'Operations',
    'RADAR': 'Radar',
    'APRON': 'Apron control',
    'ATF': 'Aerodrome Traffic Frequency',
    'RCO': 'Remote Communications Outlet',
    'TRAFFIC': 'Traffic frequency',
    'TMA': 'Terminal Control Area',
    'Aviation': 'Aviation frequency',
    // OurAirports' own names, which data.ferritefw.dev passes on.
    'TWR': 'Tower control - runway operations',
    'GND': 'Ground control - aircraft movement on ground',
    'UNIC': 'Universal Communications - advisory services',
    'ARR': 'Arrival control',
    'CLD': 'Clearance delivery',
    'DEL': 'Clearance delivery',
    'AWOS': 'Automated weather observing system',
    'RDO': 'Radio frequency',
    'A/G': 'Air to ground',
  };
  
  return descriptions[fullType] || fullType;
}

/**
 * Get unique frequencies from nearby airports
 * Returns a map of frequency (MHz) -> airport names using it
 */
export function getUniqueAirportFrequencies(airports: AirportData[]): Map<number, string[]> {
  const freqMap = new Map<number, string[]>();
  
  for (const airport of airports) {
    // Handle frequency format: single [freq, type], array of [freq, type], or legacy number
    const freqArray = Array.isArray(airport.f) ? airport.f : [airport.f];
    const freqList = freqArray.map(f => {
      if (typeof f === 'number') {
        return f; // Legacy format
      } else if (Array.isArray(f)) {
        return f[0]; // [freq, type] format
      } else {
        return (f as any).f || f; // Old object format (backward compat)
      }
    });
    
    for (const freqKhz of freqList) {
      const freqMhz = convertAirportFrequency(freqKhz);
      
      if (!freqMap.has(freqMhz)) {
        freqMap.set(freqMhz, []);
      }
      
      const airportNames = freqMap.get(freqMhz)!;
      const airportCode = airport.c;
      if (!airportNames.includes(airportCode)) {
        airportNames.push(airportCode);
      }
    }
  }
  
  return freqMap;
}

/**
 * Get frequency information with type for an airport
 */
export function getAirportFrequenciesWithTypes(airport: AirportData): Array<{ frequency: number; type: string; description: string }> {
  const result: Array<{ frequency: number; type: string; description: string }> = [];
  
  // Handle frequency format: single [freq, type], array of [freq, type], or legacy number
  const freqArray = Array.isArray(airport.f) ? airport.f : [airport.f];
  
  for (const freq of freqArray) {
    let freqKhz: number;
    let typeCode: string | undefined;
    
    if (typeof freq === 'number') {
      // Legacy format: just a number
      freqKhz = freq;
      typeCode = undefined;
    } else if (Array.isArray(freq)) {
      // New format: [freq, type]
      freqKhz = freq[0];
      typeCode = freq[1] || undefined;
    } else {
      // Old object format (backward compat): {f: freq, t: type}
      freqKhz = (freq as any).f || freq;
      typeCode = (freq as any).t;
    }
    
    const freqMhz = convertAirportFrequency(freqKhz);
    const type = typeCode ? decodeFrequencyType(typeCode) : getFrequencyType(freqMhz);
    const description = getFrequencyTypeDescription(type);
    
    result.push({
      frequency: freqKhz,
      type,
      description,
    });
  }
  
  return result;
}

