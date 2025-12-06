/**
 * Location Service
 * Geocoding and location utilities
 */

export interface GeocodeResult {
  latitude: number;
  longitude: number;
  formattedAddress?: string;
  city?: string;
  state?: string;
  country?: string;
}

/**
 * Geocode a city/state to coordinates using OpenStreetMap Nominatim
 * Free, no API key required, but has usage limits
 */
export async function geocodeLocation(
  city: string,
  state?: string,
  country?: string
): Promise<GeocodeResult | null> {
  try {
    // Build query string
    let query = city;
    if (state) {
      query += `, ${state}`;
    }
    if (country) {
      query += `, ${country}`;
    } else {
      query += ', USA'; // Default to USA if not specified
    }
    
    // Use OpenStreetMap Nominatim API (free, no API key needed)
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'NeonPlug/1.0', // Required by Nominatim
      },
    });
    
    if (!response.ok) {
      throw new Error(`Geocoding failed: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (!data || data.length === 0) {
      return null;
    }
    
    const result = data[0];
    
    return {
      latitude: parseFloat(result.lat),
      longitude: parseFloat(result.lon),
      formattedAddress: result.display_name,
      city: result.address?.city || result.address?.town || result.address?.village,
      state: result.address?.state,
      country: result.address?.country,
    };
  } catch (error) {
    console.error('Geocoding error:', error);
    return null;
  }
}

/**
 * Reverse geocode coordinates to address
 */
export async function reverseGeocode(
  latitude: number,
  longitude: number
): Promise<GeocodeResult | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'NeonPlug/1.0',
      },
    });
    
    if (!response.ok) {
      throw new Error(`Reverse geocoding failed: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (!data || !data.address) {
      return null;
    }
    
    return {
      latitude,
      longitude,
      formattedAddress: data.display_name,
      city: data.address.city || data.address.town || data.address.village,
      state: data.address.state,
      country: data.address.country,
    };
  } catch (error) {
    console.error('Reverse geocoding error:', error);
    return null;
  }
}

