/**
 * TAFL Data Service
 * Loads and processes TAFL (Technical Acceptance and Frequency List) data from tafl_min.json
 * TAFL contains Canadian radio frequency licenses
 */

import taflJson from './tafl_min.json';
import { calculateDistance } from '../services/repeaterFinder';

export interface TaflData {
  c: string; // Code/name (e.g., "Dow_Chemical_Can")
  l: [number, number]; // location: [latitude, longitude]
  f: number; // frequency in kHz (e.g., 470000 = 470 MHz)
}

/**
 * Load all TAFL entries from JSON
 * This is a large dataset, so we'll filter by location when needed
 */
export function getAllTaflEntries(): TaflData[] {
  return taflJson as unknown as TaflData[];
}

/**
 * Find TAFL entries near a location
 */
export function findNearbyTaflEntries(
  latitude: number,
  longitude: number,
  radius: number = 50 // miles
): (TaflData & { distance: number })[] {
  const allEntries = getAllTaflEntries();
  const entriesWithDistance: (TaflData & { distance: number })[] = [];
  
  for (const entry of allEntries) {
    const [lat, lon] = entry.l;
    const distance = calculateDistance(
      latitude,
      longitude,
      lat,
      lon
    );
    
    if (distance <= radius) {
      entriesWithDistance.push({
        ...entry,
        distance,
      });
    }
  }
  
  // Sort by distance
  entriesWithDistance.sort((a, b) => a.distance - b.distance);
  
  return entriesWithDistance;
}

/**
 * Convert TAFL frequency from kHz to MHz
 */
export function convertTaflFrequency(khz: number): number {
  return khz / 1000.0;
}

/**
 * Get unique frequencies from nearby TAFL entries
 * Returns a map of frequency (MHz) -> entry codes using it
 */
export function getUniqueTaflFrequencies(entries: TaflData[]): Map<number, string[]> {
  const freqMap = new Map<number, string[]>();
  
  for (const entry of entries) {
    const freqMhz = convertTaflFrequency(entry.f);
    
    if (!freqMap.has(freqMhz)) {
      freqMap.set(freqMhz, []);
    }
    
    const entryCodes = freqMap.get(freqMhz)!;
    if (!entryCodes.includes(entry.c)) {
      entryCodes.push(entry.c);
    }
  }
  
  return freqMap;
}

/**
 * Group TAFL entries by name prefix
 * Groups entries that start with the same word(s) together
 * @param entries - TAFL entries to group
 * @param minGroupSize - Minimum number of entries needed to form a group (default: 2)
 * @returns Map of group name -> array of entries in that group
 */
export function groupTaflEntriesByName(
  entries: TaflData[],
  minGroupSize: number = 2
): Map<string, TaflData[]> {
  const groups = new Map<string, TaflData[]>();
  
  // Group by first word (split by underscore or space)
  const firstWordGroups = new Map<string, TaflData[]>();
  for (const entry of entries) {
    // Split by underscore first, then by space if no underscore
    const parts = entry.c.includes('_') 
      ? entry.c.split('_')
      : entry.c.split(' ');
    const firstWord = parts[0] || entry.c;
    
    if (!firstWordGroups.has(firstWord)) {
      firstWordGroups.set(firstWord, []);
    }
    firstWordGroups.get(firstWord)!.push(entry);
  }
  
  // Process groups: use first word if group is large enough, otherwise try two words
  for (const [firstWord, wordEntries] of firstWordGroups.entries()) {
    if (wordEntries.length >= minGroupSize) {
      // Try grouping by first two words
      const twoWordGroups = new Map<string, TaflData[]>();
      for (const entry of wordEntries) {
        const parts = entry.c.includes('_') 
          ? entry.c.split('_')
          : entry.c.split(' ');
        const twoWords = parts.length >= 2 
          ? (entry.c.includes('_') ? `${parts[0]}_${parts[1]}` : `${parts[0]} ${parts[1]}`)
          : parts[0];
        
        if (!twoWordGroups.has(twoWords)) {
          twoWordGroups.set(twoWords, []);
        }
        twoWordGroups.get(twoWords)!.push(entry);
      }
      
      // Use two-word groups if they're substantial, otherwise use first word
      let useTwoWords = false;
      for (const [, groupEntries] of twoWordGroups.entries()) {
        if (groupEntries.length >= minGroupSize) {
          useTwoWords = true;
          break;
        }
      }
      
      if (useTwoWords && twoWordGroups.size > 1) {
        // Use two-word groups
        for (const [groupName, groupEntries] of twoWordGroups.entries()) {
          if (groupEntries.length >= minGroupSize) {
            groups.set(groupName, groupEntries);
          } else {
            // Too small, use first word group
            groups.set(firstWord, wordEntries);
            break; // Only need to set once
          }
        }
      } else {
        // Use first word as group name
        groups.set(firstWord, wordEntries);
      }
    } else {
      // Too few entries, create individual groups
      for (const entry of wordEntries) {
        groups.set(entry.c, [entry]);
      }
    }
  }
  
  return groups;
}

