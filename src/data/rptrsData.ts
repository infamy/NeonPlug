/**
 * DMR Repeater Data Service
 * Loads and processes DMR repeater data from rptrs.json
 * rptrs.json contains DMR repeater information with location data
 * Data is loaded dynamically with fallback paths for different deployment scenarios
 */

import { calculateDistance } from '../services/repeaterFinder';
import { loadJsonFileCached, type ProgressCallback } from '../services/jsonLoader';

export interface RptrData {
  locator: number;
  id: number;
  callsign: string;
  city: string;
  state: string;
  country: string;
  frequency: string; // Frequency as string (e.g., "440.58750")
  color_code: number;
  offset: string; // Offset as string (e.g., "+5.000", "-5.000")
  assigned: string;
  ts_linked: string; // Timeslots linked (e.g., "TS1 TS2", "TS1", "Mixed Mode")
  trustee: string;
  map_info: string;
  map: number;
  ipsc_network: string; // Network name (e.g., "Brandmeister", "DMR-MARC")
  lat: string; // Latitude as string
  lng: string; // Longitude as string
  status: string; // e.g., "ACTIVE", "INACTIVE"
}

export interface RptrsJson {
  rptrs: RptrData[];
}

// Cache for loaded rptrs data
let rptrsCache: RptrData[] | null = null;
let rptrsLoadPromise: Promise<RptrData[]> | null = null;

/**
 * Load all DMR repeaters from JSON (dynamically with fallback paths)
 * This is a large dataset, so we'll filter by location when needed
 * @param onProgress - Optional progress callback
 * @returns Promise resolving to array of DMR repeaters
 */
export async function loadRptrsData(onProgress?: ProgressCallback): Promise<RptrData[]> {
  if (rptrsCache) {
    // Already loaded, report 100% if callback provided
    if (onProgress) {
      onProgress({ loaded: 1, total: 1, percent: 100 });
    }
    return rptrsCache;
  }
  
  // If already loading, return the existing promise
  if (rptrsLoadPromise) {
    return rptrsLoadPromise;
  }
  
  // Start loading with fallback paths
  rptrsLoadPromise = loadJsonFileCached<RptrsJson>('rptrs.json', onProgress).then(data => data.rptrs);
  rptrsCache = await rptrsLoadPromise;
  
  return rptrsCache;
}

/**
 * Get all DMR repeaters (synchronous, requires data to be loaded first)
 * @throws Error if data hasn't been loaded yet
 */
export function getAllRptrs(): RptrData[] {
  if (!rptrsCache) {
    throw new Error('DMR repeater data not loaded. Call loadRptrsData() first.');
  }
  return rptrsCache;
}

/**
 * Find DMR repeaters near a location (async, loads data if needed)
 */
export async function findNearbyRptrs(
  latitude: number,
  longitude: number,
  radius: number = 50, // miles
  onProgress?: ProgressCallback
): Promise<(RptrData & { distance: number })[]> {
  // Ensure data is loaded
  await loadRptrsData(onProgress);
  const allRptrs = getAllRptrs();
  const rptrsWithDistance: (RptrData & { distance: number })[] = [];
  
  for (const rptr of allRptrs) {
    // Skip inactive repeaters
    if (rptr.status !== 'ACTIVE') {
      continue;
    }
    
    // Parse lat/lng from strings
    const lat = parseFloat(rptr.lat);
    const lng = parseFloat(rptr.lng);
    
    // Skip if coordinates are invalid
    if (isNaN(lat) || isNaN(lng)) {
      continue;
    }
    
    // Validate coordinate ranges
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      continue;
    }
    
    const distance = calculateDistance(
      latitude,
      longitude,
      lat,
      lng
    );
    
    // Only include repeaters within the specified radius
    if (distance <= radius) {
      rptrsWithDistance.push({
        ...rptr,
        distance,
      });
    }
  }
  
  // Sort by distance
  rptrsWithDistance.sort((a, b) => a.distance - b.distance);
  
  return rptrsWithDistance;
}

/**
 * Convert frequency string to MHz number
 */
export function convertRptrFrequency(freqStr: string): number {
  return parseFloat(freqStr);
}

/**
 * Convert offset string to MHz number
 * Examples: "+5.000" -> 5.0, "-5.000" -> -5.0, "-0.600" -> -0.6
 */
export function convertRptrOffset(offsetStr: string): number {
  return parseFloat(offsetStr);
}

/**
 * Parse timeslot information from ts_linked string
 * Examples: "TS1 TS2" -> [1, 2], "TS1" -> [1], "Mixed Mode" -> [1, 2]
 */
export function parseTimeslots(tsLinked: string): number[] {
  if (!tsLinked || tsLinked.trim() === '') {
    return [1]; // Default to TS1
  }
  
  const upper = tsLinked.toUpperCase();
  
  // Handle "Mixed Mode" or similar
  if (upper.includes('MIXED')) {
    return [1, 2];
  }
  
  // Extract TS numbers
  const tsMatches = upper.match(/TS(\d+)/g);
  if (tsMatches) {
    return tsMatches.map(match => parseInt(match.replace('TS', '')));
  }
  
  // Default to TS1 if we can't parse
  return [1];
}

/**
 * Get unique frequencies from nearby DMR repeaters
 * Returns a map of frequency (MHz) -> repeater callsigns using it
 */
export function getUniqueRptrFrequencies(rptrs: RptrData[]): Map<number, string[]> {
  const freqMap = new Map<number, string[]>();
  
  for (const rptr of rptrs) {
    const freqMhz = convertRptrFrequency(rptr.frequency);
    
    if (!freqMap.has(freqMhz)) {
      freqMap.set(freqMhz, []);
    }
    
    const callsigns = freqMap.get(freqMhz)!;
    if (!callsigns.includes(rptr.callsign)) {
      callsigns.push(rptr.callsign);
    }
  }
  
  return freqMap;
}

/**
 * Group DMR repeaters by network
 * Groups repeaters that use the same IPSC network together
 * @param rptrs - DMR repeaters to group
 * @param minGroupSize - Minimum number of repeaters needed to form a group (default: 2)
 * @returns Map of network name -> array of repeaters in that network
 */
export function groupRptrsByNetwork(
  rptrs: RptrData[],
  minGroupSize: number = 2
): Map<string, RptrData[]> {
  const groups = new Map<string, RptrData[]>();
  
  // Group by network
  for (const rptr of rptrs) {
    const network = rptr.ipsc_network || 'Unknown';
    
    if (!groups.has(network)) {
      groups.set(network, []);
    }
    groups.get(network)!.push(rptr);
  }
  
  // Filter out groups that are too small
  const filteredGroups = new Map<string, RptrData[]>();
  for (const [network, networkRptrs] of groups.entries()) {
    if (networkRptrs.length >= minGroupSize) {
      filteredGroups.set(network, networkRptrs);
    } else {
      // Too small, create individual groups or add to "Other"
      for (const rptr of networkRptrs) {
        const key = `${network}_${rptr.callsign}`;
        filteredGroups.set(key, [rptr]);
      }
    }
  }
  
  return filteredGroups;
}

/**
 * Get state abbreviation (simple mapping for common states)
 */
function getStateAbbrev(state: string): string {
  // Common state abbreviations - expand as needed
  const stateMap: Record<string, string> = {
    'California': 'CA',
    'Texas': 'TX',
    'Florida': 'FL',
    'New York': 'NY',
    'Pennsylvania': 'PA',
    'Illinois': 'IL',
    'Ohio': 'OH',
    'Georgia': 'GA',
    'North Carolina': 'NC',
    'Michigan': 'MI',
    'New Jersey': 'NJ',
    'Virginia': 'VA',
    'Washington': 'WA',
    'Arizona': 'AZ',
    'Massachusetts': 'MA',
    'Tennessee': 'TN',
    'Indiana': 'IN',
    'Missouri': 'MO',
    'Maryland': 'MD',
    'Wisconsin': 'WI',
    'Colorado': 'CO',
    'Minnesota': 'MN',
    'South Carolina': 'SC',
    'Alabama': 'AL',
    'Louisiana': 'LA',
    'Kentucky': 'KY',
    'Oregon': 'OR',
    'Oklahoma': 'OK',
    'Connecticut': 'CT',
    'Utah': 'UT',
    'Iowa': 'IA',
    'Nevada': 'NV',
    'Arkansas': 'AR',
    'Mississippi': 'MS',
    'Kansas': 'KS',
    'New Mexico': 'NM',
    'Nebraska': 'NE',
    'West Virginia': 'WV',
    'Idaho': 'ID',
    'Hawaii': 'HI',
    'New Hampshire': 'NH',
    'Maine': 'ME',
    'Montana': 'MT',
    'Rhode Island': 'RI',
    'Delaware': 'DE',
    'South Dakota': 'SD',
    'North Dakota': 'ND',
    'Alaska': 'AK',
    'Vermont': 'VT',
    'Wyoming': 'WY',
  };
  
  // If already an abbreviation (2 chars), return as-is
  if (state.length <= 2) {
    return state.toUpperCase();
  }
  
  // Look up full state name
  return stateMap[state] || state.substring(0, 2).toUpperCase();
}

/**
 * Group DMR repeaters by city/state
 * Groups repeaters in the same city together, using city name and state abbreviation
 * @param rptrs - DMR repeaters to group
 * @param minGroupSize - Minimum number of repeaters needed to form a group (default: 2)
 * @returns Map of location name -> array of repeaters in that location
 */
export function groupRptrsByLocation(
  rptrs: RptrData[],
  minGroupSize: number = 2
): Map<string, RptrData[]> {
  const groups = new Map<string, RptrData[]>();
  
  // Group by city, state abbreviation
  for (const rptr of rptrs) {
    const stateAbbrev = rptr.state ? getStateAbbrev(rptr.state) : '';
    const location = stateAbbrev 
      ? `${rptr.city}, ${stateAbbrev}`
      : rptr.city;
    
    if (!groups.has(location)) {
      groups.set(location, []);
    }
    groups.get(location)!.push(rptr);
  }
  
  // Filter out groups that are too small
  const filteredGroups = new Map<string, RptrData[]>();
  for (const [location, locationRptrs] of groups.entries()) {
    if (locationRptrs.length >= minGroupSize) {
      filteredGroups.set(location, locationRptrs);
    } else {
      // Too small, create individual groups
      for (const rptr of locationRptrs) {
        const key = `${rptr.callsign}_${rptr.city}`;
        filteredGroups.set(key, [rptr]);
      }
    }
  }
  
  return filteredGroups;
}
