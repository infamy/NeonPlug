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
 * Geocode a free-form place query, returning several candidates.
 *
 * Deliberately separate from `geocodeLocation`, which appends ", USA" whenever
 * no country is given — correct for the US repeater search it was written for,
 * wrong for anyone entering a place anywhere else. This sends the query as
 * typed.
 *
 * Returns candidates rather than a single best match: "Springfield" is a real
 * question, not a lookup, and silently taking the first hit would drop a
 * geofence in the wrong country.
 *
 * Network-dependent. Callers must handle the offline case — this is an
 * offline-first app and the feature it serves has to degrade, not break.
 */
export async function geocodePlaces(
  query: string,
  limit = 5
): Promise<GeocodeResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const url =
    `https://nominatim.openstreetmap.org/search?format=json` +
    `&q=${encodeURIComponent(trimmed)}&limit=${limit}`;

  const response = await fetch(url, {
    headers: { 'User-Agent': 'NeonPlug/1.0' },
  });
  if (!response.ok) throw new Error(`Location search failed: ${response.statusText}`);

  const data = await response.json();
  if (!Array.isArray(data)) return [];

  return data.map((r: { lat: string; lon: string; display_name?: string }) => ({
    latitude: parseFloat(r.lat),
    longitude: parseFloat(r.lon),
    formattedAddress: r.display_name,
  }));
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

