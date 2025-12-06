/**
 * Repeater Finder Service
 * Finds nearby repeaters and generates channels/zones based on location
 */

export interface Repeater {
  callsign: string;
  frequency: number; // Output frequency (repeater RX, user TX)
  inputOffset: number; // Offset in MHz (typically -0.6 for 2m, -5.0 for 70cm)
  ctcss?: number; // CTCSS tone in Hz
  dcs?: number; // DCS code
  location: string;
  city?: string;
  state?: string;
  county?: string;
  latitude?: number;
  longitude?: number;
  distance?: number; // Distance in miles/km
  band: '2m' | '70cm' | '1.25m' | '6m' | '10m' | 'other';
  mode: 'FM' | 'DMR' | 'D-STAR' | 'C4FM' | 'P25' | 'NXDN';
  notes?: string;
  status?: 'active' | 'inactive' | 'unknown';
}

export interface LocationInput {
  latitude: number;
  longitude: number;
  radius?: number; // Search radius in miles (default: 50)
  city?: string;
  state?: string;
}

export interface RepeaterSearchResult {
  repeaters: Repeater[];
  location: LocationInput;
  totalFound: number;
}

/**
 * Calculate distance between two coordinates using Haversine formula
 */
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 3959; // Earth radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Determine band from frequency
 */
export function getBandFromFrequency(freq: number): Repeater['band'] {
  if (freq >= 28 && freq <= 29.7) return '10m';
  if (freq >= 50 && freq <= 54) return '6m';
  if (freq >= 144 && freq <= 148) return '2m';
  if (freq >= 222 && freq <= 225) return '1.25m';
  if (freq >= 420 && freq <= 450) return '70cm';
  return 'other';
}

/**
 * Get standard offset for a band
 */
export function getStandardOffset(band: Repeater['band']): number {
  switch (band) {
    case '2m': return -0.6; // 600 kHz offset
    case '70cm': return -5.0; // 5 MHz offset
    case '1.25m': return -1.6; // 1.6 MHz offset
    case '6m': return -0.5; // 500 kHz offset
    case '10m': return -0.1; // 100 kHz offset
    default: return -0.6;
  }
}

/**
 * Parse CTCSS/DCS from string
 */
export function parseTone(toneStr: string | undefined): { ctcss?: number; dcs?: number } {
  if (!toneStr) return {};
  
  const str = String(toneStr).trim().toUpperCase();
  
  // Try CTCSS (e.g., "88.5", "CTCSS 88.5", "88.5 Hz")
  const ctcssMatch = str.match(/(\d+\.?\d*)\s*(?:HZ|HERTZ)?/i);
  if (ctcssMatch) {
    const value = parseFloat(ctcssMatch[1]);
    if (value >= 67.0 && value <= 254.1) {
      return { ctcss: value };
    }
  }
  
  // Try DCS (e.g., "023", "DCS 023", "023N")
  const dcsMatch = str.match(/DCS?\s*(\d+)([NP])?/i);
  if (dcsMatch) {
    const value = parseInt(dcsMatch[1]);
    if (value >= 1 && value <= 754) {
      return { dcs: value };
    }
  }
  
  return {};
}

/**
 * Search for repeaters by location
 * Uses the repeater database from src/data/repeaterDatabase.ts
 * Can be extended to use APIs or external files
 */
export async function searchRepeaters(
  location: LocationInput
): Promise<RepeaterSearchResult> {
  const { latitude, longitude, radius = 50 } = location;
  
  // Import repeater database
  const { 
    REPEATER_DATABASE, 
    DEFAULT_REPEATER_CONFIG,
    searchStaticRepeaters 
  } = await import('../data/repeaterDatabase');
  
  let foundRepeaters: Repeater[] = [];
  
  // Search static database if enabled
  if (DEFAULT_REPEATER_CONFIG.useStaticDatabase && REPEATER_DATABASE.length > 0) {
    foundRepeaters = searchStaticRepeaters(latitude, longitude, radius);
  }
  
  // TODO: Add API integration here
  // if (DEFAULT_REPEATER_CONFIG.useAPI && DEFAULT_REPEATER_CONFIG.apiEndpoint) {
  //   const apiRepeaters = await searchRepeaterAPI(latitude, longitude, radius);
  //   foundRepeaters = [...foundRepeaters, ...apiRepeaters];
  // }
  
  // If no repeaters found in database, return empty result
  // (Previously returned mock data - now requires actual data)
  if (foundRepeaters.length === 0) {
    console.warn('No repeaters found in database. Add repeaters to src/data/repeaterDatabase.ts or configure an API.');
  }
  
  return {
    repeaters: foundRepeaters,
    location,
    totalFound: foundRepeaters.length,
  };
}

/**
 * Geocode a city/state to coordinates
 * Uses locationService for actual geocoding
 */
export async function geocodeLocation(
  city: string,
  state?: string
): Promise<{ latitude: number; longitude: number } | null> {
  const { geocodeLocation: geocode } = await import('./locationService');
  const result = await geocode(city, state);
  return result ? { latitude: result.latitude, longitude: result.longitude } : null;
}

/**
 * Get user's current location from browser
 */
export async function getCurrentLocation(): Promise<{ latitude: number; longitude: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported by your browser'));
      return;
    }
    
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      (error) => {
        reject(new Error(`Geolocation error: ${error.message}`));
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  });
}

