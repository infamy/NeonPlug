/**
 * Licensed land-mobile sites near a place, from data.ferritefw.dev: Canada's
 * TAFL (ISED) and the US's FCC ULS, both rebuilt from the regulators' own files.
 * Only the map tiles around the search are downloaded (services/ferrite).
 *
 * The name stays TaflData: the Channel Wizard's licensed-sites search, its
 * grouping and its channel builder all speak this shape.
 */

import { findFerriteRowsNear, type FerriteRowNear } from '../services/ferrite/client';
import type { ProgressCallback } from '../services/jsonLoader';

export interface TaflData {
  c: string; // Licensee name, shortened to 16 characters
  l: [number, number]; // location: [latitude, longitude]
  f: number; // frequency in kHz (e.g., 470000 = 470 MHz)
  /** Narrow or wide FM, where the licence says. */
  bw?: '12.5kHz' | '25kHz';
  /** Which regulator's data the site came from. */
  src?: 'tafl' | 'fcc';
}

function toTaflData(row: FerriteRowNear): TaflData & { distance: number } {
  const entry: TaflData & { distance: number } = {
    c: row.name,
    l: [row.lat, row.lon],
    f: Math.round(row.mhz * 2000) / 2, // half-kHz steps, as the source has them
    src: row.source === 'fcc' ? 'fcc' : 'tafl',
    distance: row.distance,
  };
  if (row.bandwidth) entry.bw = row.bandwidth;
  return entry;
}

/**
 * Licensed sites within `radius` miles of a point, Canadian and US together,
 * nearest first. A search near the border gets both; one far from it reads
 * only the other country's empty index.
 */
export async function findNearbyTaflEntries(
  latitude: number,
  longitude: number,
  radius: number = 50, // miles
  onProgress?: ProgressCallback
): Promise<(TaflData & { distance: number })[]> {
  const percent = { tafl: 0, fcc: 0 };
  const report = (source: 'tafl' | 'fcc') => (p: { percent: number }) => {
    percent[source] = p.percent;
    const total = (percent.tafl + percent.fcc) / 2;
    onProgress?.({ loaded: total, total: 100, percent: total });
  };
  const [canada, us] = await Promise.all([
    findFerriteRowsNear('tafl', latitude, longitude, radius, report('tafl')),
    findFerriteRowsNear('fcc', latitude, longitude, radius, report('fcc')),
  ]);
  return [...canada, ...us].map(toTaflData).sort((a, b) => a.distance - b.distance);
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

