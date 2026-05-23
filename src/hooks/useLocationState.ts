import { useState } from 'react';
import { getCurrentLocation, geocodeLocation } from '../services/repeaterFinder';

export type LocationType = 'coordinates' | 'city' | 'current';

export interface ResolvedLocation {
  lat: number;
  lon: number;
  radius: number;
}

export function useLocationState() {
  const [locationType, setLocationType] = useState<LocationType>('current');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [searchRadius, setSearchRadius] = useState('50');

  const resolveCoordinates = async (): Promise<ResolvedLocation> => {
    let lat: number;
    let lon: number;

    if (locationType === 'current') {
      const loc = await getCurrentLocation();
      lat = loc.latitude;
      lon = loc.longitude;
    } else if (locationType === 'coordinates') {
      const parsedLat = parseFloat(latitude);
      const parsedLon = parseFloat(longitude);
      if (isNaN(parsedLat) || isNaN(parsedLon) || !latitude.trim() || !longitude.trim()) {
        throw new Error('Invalid coordinates. Please enter valid latitude and longitude.');
      }
      if (parsedLat < -90 || parsedLat > 90) throw new Error('Latitude must be between -90 and 90');
      if (parsedLon < -180 || parsedLon > 180) throw new Error('Longitude must be between -180 and 180');
      lat = parsedLat;
      lon = parsedLon;
    } else {
      if (!city.trim()) throw new Error('Please enter a city name.');
      const geocoded = await geocodeLocation(city, state);
      if (!geocoded) throw new Error('Could not find location. Please check the city and state names, or use coordinates instead.');
      lat = geocoded.latitude;
      lon = geocoded.longitude;
      setLatitude(lat.toFixed(6));
      setLongitude(lon.toFixed(6));
    }

    const radius = parseFloat(searchRadius) || 50;
    if (isNaN(radius) || radius <= 0) throw new Error('Please enter a valid search radius (greater than 0).');

    return { lat, lon, radius };
  };

  return {
    locationType, setLocationType,
    latitude, setLatitude,
    longitude, setLongitude,
    city, setCity,
    state, setState,
    searchRadius, setSearchRadius,
    resolveCoordinates,
  };
}
