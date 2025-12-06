/**
 * Repeater Database
 * Centralized data file for repeater information
 * 
 * This can be:
 * 1. A static data file with common repeaters
 * 2. A placeholder for API integration
 * 3. A combination of both
 * 
 * To add repeaters, add entries to the REPEATER_DATABASE array below
 */

import type { Repeater } from '../services/repeaterFinder';

/**
 * Static repeater database
 * Add repeaters here for offline/local use
 * Format: Array of Repeater objects
 */
export const REPEATER_DATABASE: Repeater[] = [
  // Example entries (replace with real data):
  // {
  //   callsign: 'W1ABC',
  //   frequency: 146.940,
  //   inputOffset: -0.6,
  //   ctcss: 100.0,
  //   location: 'Downtown',
  //   city: 'Boston',
  //   state: 'MA',
  //   latitude: 42.3601,
  //   longitude: -71.0589,
  //   band: '2m',
  //   mode: 'FM',
  //   status: 'active',
  //   notes: 'Open repeater',
  // },
  // Add more repeaters here...
];

/**
 * Repeater database source configuration
 */
export interface RepeaterDatabaseConfig {
  useStaticDatabase: boolean; // Use the static REPEATER_DATABASE array
  useAPI: boolean; // Use external API (RepeaterBook, RadioReference, etc.)
  apiEndpoint?: string; // API endpoint URL
  apiKey?: string; // API key if required
}

/**
 * Default configuration
 */
export const DEFAULT_REPEATER_CONFIG: RepeaterDatabaseConfig = {
  useStaticDatabase: true,
  useAPI: false,
  // apiEndpoint: 'https://api.repeaterbook.com/...',
  // apiKey: undefined,
};

/**
 * Search static repeater database by location
 * This is a simple implementation - can be enhanced with better filtering
 */
export function searchStaticRepeaters(
  latitude: number,
  longitude: number,
  radius: number = 50
): Repeater[] {
  // Simple distance-based search
  // In production, you might want to use a spatial index or more sophisticated algorithm
  
  const results: Repeater[] = [];
  
  for (const repeater of REPEATER_DATABASE) {
    if (!repeater.latitude || !repeater.longitude) {
      continue; // Skip repeaters without coordinates
    }
    
    // Calculate distance (simple Haversine - can be optimized)
    const R = 3959; // Earth radius in miles
    const dLat = (repeater.latitude - latitude) * Math.PI / 180;
    const dLon = (repeater.longitude - longitude) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(latitude * Math.PI / 180) *
      Math.cos(repeater.latitude * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;
    
    if (distance <= radius) {
      results.push({
        ...repeater,
        distance,
      });
    }
  }
  
  // Sort by distance
  results.sort((a, b) => (a.distance || 0) - (b.distance || 0));
  
  return results;
}

/**
 * Load repeater database from external file
 * This allows users to provide their own repeater database file
 */
export async function loadRepeaterDatabaseFromFile(file: File): Promise<Repeater[]> {
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    
    // Validate structure
    if (!Array.isArray(data)) {
      throw new Error('Repeater database must be an array');
    }
    
    // Basic validation
    for (const repeater of data) {
      if (!repeater.callsign || !repeater.frequency) {
        throw new Error('Invalid repeater entry: missing required fields');
      }
    }
    
    return data as Repeater[];
  } catch (error) {
    throw new Error(`Failed to load repeater database: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Export repeater database to file
 */
export function exportRepeaterDatabase(repeaters: Repeater[]): string {
  return JSON.stringify(repeaters, null, 2);
}

