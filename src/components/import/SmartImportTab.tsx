import React, { useState } from 'react';
import { useChannelsStore } from '../../store/channelsStore';
import { useZonesStore } from '../../store/zonesStore';
import { searchRepeaters, getCurrentLocation, geocodeLocation, type Repeater, type LocationInput } from '../../services/repeaterFinder';
import { generateChannelsAndZones, type GenerationOptions } from '../../services/locationChannelGenerator';
import { getAvailableFixedChannelSets, getChannelsForSet } from '../../services/fixedChannels';
import { mergeOverlappingChannels } from '../../services/channelMerger';
import { generateAirportChannels } from '../../services/airportChannels';
import { findNearbyAirports, getAirportFrequenciesWithTypes, type AirportData } from '../../data/airportsData';
import { generateTaflChannels } from '../../services/taflChannels';
import { findNearbyTaflEntries, groupTaflEntriesByName, type TaflData } from '../../data/taflData';
import type { Channel } from '../../models';
import type { Zone } from '../../models';
import { Button } from '../ui/Button';
import { formatBytes } from '../../utils/formatHelpers';

export const SmartImportTab: React.FC = () => {
  const { channels, setChannels } = useChannelsStore();
  const { zones, setZones } = useZonesStore();
  
  const [locationType, setLocationType] = useState<'coordinates' | 'city' | 'current'>('current');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [radius, setRadius] = useState('50');
  const [isSearching, setIsSearching] = useState(false);
  const [repeaters, setRepeaters] = useState<Repeater[]>([]);
  const [selectedRepeaters, setSelectedRepeaters] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  
  // Generation options
  const [groupByBand, setGroupByBand] = useState(true);
  const [groupByDistance, setGroupByDistance] = useState(false);
  const [maxDistancePerZone, setMaxDistancePerZone] = useState('25');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationResult, setGenerationResult] = useState<{ channels: number; zones: number } | null>(null);
  
  // Fixed channels state
  const [selectedFixedSets, setSelectedFixedSets] = useState<Set<string>>(new Set());
  const [isAddingFixed, setIsAddingFixed] = useState(false);
  const [expandedChannelSet, setExpandedChannelSet] = useState<string | null>(null);
  
  // Airport channels state
  const [airportRadius, setAirportRadius] = useState('50');
  const [isAddingAirports, setIsAddingAirports] = useState(false);
  const [isSearchingAirports, setIsSearchingAirports] = useState(false);
  const [airports, setAirports] = useState<AirportData[]>([]);
  const [selectedAirports, setSelectedAirports] = useState<Set<number>>(new Set());
  const [airportZoneGrouping, setAirportZoneGrouping] = useState<'individual' | 'single'>('individual');
  const [airportLoadProgress, setAirportLoadProgress] = useState<{ percent: number; loaded: number; total: number } | null>(null);
  
  // TAFL channels state
  const [taflRadius, setTaflRadius] = useState('10'); // Reduced default from 50 to 10
  const [taflSearchFilter, setTaflSearchFilter] = useState('');
  const [isAddingTafl, setIsAddingTafl] = useState(false);
  const [isSearchingTafl, setIsSearchingTafl] = useState(false);
  const [taflEntries, setTaflEntries] = useState<TaflData[]>([]);
  const [selectedTaflEntries, setSelectedTaflEntries] = useState<Set<number>>(new Set());
  const [expandedTaflGroups, setExpandedTaflGroups] = useState<Set<string>>(new Set());
  const [taflLoadProgress, setTaflLoadProgress] = useState<{ percent: number; loaded: number; total: number } | null>(null);

  const handleUseCurrentLocation = async () => {
    setIsSearching(true);
    setError(null);
    
    try {
      const location = await getCurrentLocation();
      setLatitude(location.latitude.toFixed(6));
      setLongitude(location.longitude.toFixed(6));
      setLocationType('coordinates');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get current location');
    } finally {
      setIsSearching(false);
    }
  };

  const handleGeocodeCityState = async () => {
    if (!city.trim()) {
      setError('Please enter a city name');
      return;
    }
    
    setIsSearching(true);
    setError(null);
    
    try {
      const geocoded = await geocodeLocation(city, state);
      if (!geocoded) {
        throw new Error('Could not find location. Please check the city and state names.');
      }
      
      // Populate coordinates
      setLatitude(geocoded.latitude.toFixed(6));
      setLongitude(geocoded.longitude.toFixed(6));
      
      // Switch to coordinates view so user can see/verify them
      setLocationType('coordinates');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to geocode location');
    } finally {
      setIsSearching(false);
    }
  };

  const handleSearch = async () => {
    setIsSearching(true);
    setError(null);
    setRepeaters([]);
    setSelectedRepeaters(new Set());
    
    try {
      let location: LocationInput;
      
      if (locationType === 'current') {
        const currentLoc = await getCurrentLocation();
        location = {
          latitude: currentLoc.latitude,
          longitude: currentLoc.longitude,
          radius: parseFloat(radius) || 50,
        };
      } else if (locationType === 'coordinates') {
        const lat = parseFloat(latitude);
        const lon = parseFloat(longitude);
        
        if (isNaN(lat) || isNaN(lon)) {
          throw new Error('Invalid coordinates');
        }
        
        if (lat < -90 || lat > 90) {
          throw new Error('Latitude must be between -90 and 90');
        }
        
        if (lon < -180 || lon > 180) {
          throw new Error('Longitude must be between -180 and 180');
        }
        
        location = {
          latitude: lat,
          longitude: lon,
          radius: parseFloat(radius) || 50,
        };
      } else {
        // City/State - need to geocode
        const geocoded = await geocodeLocation(city, state);
        if (!geocoded) {
          throw new Error('Could not find location. Please use coordinates instead.');
        }
        
        location = {
          latitude: geocoded.latitude,
          longitude: geocoded.longitude,
          radius: parseFloat(radius) || 50,
          city,
          state,
        };
      }
      
      const result = await searchRepeaters(location);
      setRepeaters(result.repeaters);
      
      // Auto-select all repeaters
      setSelectedRepeaters(new Set(result.repeaters.map((_, i) => i)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to search repeaters');
    } finally {
      setIsSearching(false);
    }
  };

  const handleToggleRepeater = (index: number) => {
    const newSelected = new Set(selectedRepeaters);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedRepeaters(newSelected);
  };

  const handleSelectAll = () => {
    setSelectedRepeaters(new Set(repeaters.map((_, i) => i)));
  };

  const handleDeselectAll = () => {
    setSelectedRepeaters(new Set());
  };

  const handleGenerate = () => {
    if (selectedRepeaters.size === 0) {
      setError('Please select at least one repeater');
      return;
    }
    
    setIsGenerating(true);
    setError(null);
    
    try {
      const selectedRepeaterList = Array.from(selectedRepeaters)
        .map(i => repeaters[i])
        .filter(Boolean);
      
      const options: GenerationOptions = {
        groupByBand,
        groupByDistance,
        maxDistancePerZone: parseFloat(maxDistancePerZone) || 25,
      };
      
      const result = generateChannelsAndZones(selectedRepeaterList, channels, options);
      
      // Add channels
      const newChannels = [...channels, ...result.channels];
      setChannels(newChannels);
      
      // Add zones
      const newZones = [...zones, ...result.zones];
      setZones(newZones);
      
      setGenerationResult({
        channels: result.channels.length,
        zones: result.zones.length,
      });
      
      // Clear selection
      setSelectedRepeaters(new Set());
      setRepeaters([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate channels and zones');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAddFixedChannels = () => {
    if (selectedFixedSets.size === 0) {
      setError('Please select at least one channel set');
      return;
    }
    
    setIsAddingFixed(true);
    setError(null);
    
    try {
      // Find next available channel number
      const existingNumbers = new Set(channels.map(ch => ch.number));
      let nextChannelNumber = 1;
      while (existingNumbers.has(nextChannelNumber)) {
        nextChannelNumber++;
      }
      
      // Generate channels for each selected set (with temporary numbers)
      const channelSets: Channel[][] = [];
      const setNames: string[] = [];
      
      for (const setName of selectedFixedSets) {
        // Use generic function to get channels for any set
        const setChannels = getChannelsForSet(setName, 1);
        
        if (setChannels.length > 0) {
          channelSets.push(setChannels);
          setNames.push(setName);
        }
      }
      
      // Merge overlapping channels
      const { mergedChannels, channelMapping } = mergeOverlappingChannels(channelSets, nextChannelNumber);
      
      // Create zones with merged channel numbers
      const newZones: Zone[] = [];
      for (let i = 0; i < channelSets.length; i++) {
        const setChannels = channelSets[i];
        const setName = setNames[i];
        
        // Map original channel numbers to merged channel numbers
        const zoneChannelNumbers = setChannels
          .map(ch => channelMapping.get(ch.number))
          .filter((num): num is number => num !== undefined)
          .sort((a, b) => a - b);
        
        if (zoneChannelNumbers.length > 0) {
          newZones.push({
            name: setName,
            channels: zoneChannelNumbers,
          });
        }
      }
      
      // Add channels and zones
      const updatedChannels = [...channels, ...mergedChannels];
      setChannels(updatedChannels);
      
      const updatedZones = [...zones, ...newZones];
      setZones(updatedZones);
      
      setGenerationResult({
        channels: mergedChannels.length,
        zones: newZones.length,
      });
      
      // Clear selection
      setSelectedFixedSets(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add fixed channels');
    } finally {
      setIsAddingFixed(false);
    }
  };

  const handleToggleFixedSet = (setName: string) => {
    const newSelected = new Set(selectedFixedSets);
    if (newSelected.has(setName)) {
      newSelected.delete(setName);
    } else {
      newSelected.add(setName);
    }
    setSelectedFixedSets(newSelected);
  };

  const fixedChannelSets = getAvailableFixedChannelSets();

  const handleSearchAirports = async () => {
    setIsSearchingAirports(true);
    setError(null);
    setAirports([]);
    setSelectedAirports(new Set());
    setAirportLoadProgress({ percent: 0, loaded: 0, total: 0 });
    
    try {
      let lat: number;
      let lon: number;
      
      if (locationType === 'current') {
        const currentLoc = await getCurrentLocation();
        lat = currentLoc.latitude;
        lon = currentLoc.longitude;
      } else if (locationType === 'coordinates') {
        const parsedLat = parseFloat(latitude);
        const parsedLon = parseFloat(longitude);
        
        if (isNaN(parsedLat) || isNaN(parsedLon)) {
          throw new Error('Invalid coordinates');
        }
        
        if (parsedLat < -90 || parsedLat > 90) {
          throw new Error('Latitude must be between -90 and 90');
        }
        
        if (parsedLon < -180 || parsedLon > 180) {
          throw new Error('Longitude must be between -180 and 180');
        }
        
        lat = parsedLat;
        lon = parsedLon;
      } else {
        // City/State - need to geocode
        const geocoded = await geocodeLocation(city, state);
        if (!geocoded) {
          throw new Error('Could not find location. Please use coordinates instead.');
        }
        
        lat = geocoded.latitude;
        lon = geocoded.longitude;
      }
      
      // Load airports data with progress tracking
      const nearbyAirports = await findNearbyAirports(
        lat, 
        lon, 
        parseFloat(airportRadius) || 50,
        (progress) => {
          setAirportLoadProgress({
            percent: progress.percent,
            loaded: progress.loaded,
            total: progress.total,
          });
        }
      );
      setAirports(nearbyAirports);
      
      // Auto-select all airports
      setSelectedAirports(new Set(nearbyAirports.map((_, i) => i)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to search airports');
    } finally {
      setIsSearchingAirports(false);
      setAirportLoadProgress(null);
    }
  };

  const handleToggleAirport = (index: number) => {
    const newSelected = new Set(selectedAirports);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedAirports(newSelected);
  };

  const handleSelectAllAirports = () => {
    setSelectedAirports(new Set(airports.map((_, i) => i)));
  };

  const handleDeselectAllAirports = () => {
    setSelectedAirports(new Set());
  };

  const handleAddAirportChannels = async () => {
    if (selectedAirports.size === 0) {
      setError('Please select at least one airport');
      return;
    }
    
    setIsAddingAirports(true);
    setError(null);
    
    try {
      // Get selected airports
      const selectedAirportList = Array.from(selectedAirports)
        .map(i => airports[i])
        .filter(Boolean);
      
      if (selectedAirportList.length === 0) {
        throw new Error('No airports selected');
      }
      
      // Find next available channel number
      const existingNumbers = new Set(channels.map(ch => ch.number));
      let nextChannelNumber = 1;
      while (existingNumbers.has(nextChannelNumber)) {
        nextChannelNumber++;
      }
      
      // Generate channels and zones for selected airports
      const result = generateAirportChannels(
        nextChannelNumber,
        selectedAirportList, // Pass selected airports
        airportZoneGrouping === 'single' // Group all in one zone if selected
      );
      
      if (result.channels.length === 0) {
        setError('No channels to add from selected airports');
        return;
      }
      
      // Add channels
      const updatedChannels = [...channels, ...result.channels];
      setChannels(updatedChannels);
      
      // Add zones (one per airport)
      const updatedZones = [...zones, ...result.zones];
      setZones(updatedZones);
      
      setGenerationResult({
        channels: result.channels.length,
        zones: result.zones.length,
      });
      
      // Clear selection
      setSelectedAirports(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add airport channels');
    } finally {
      setIsAddingAirports(false);
    }
  };

  const handleSearchTafl = async () => {
    setIsSearchingTafl(true);
    setError(null);
    setTaflEntries([]);
    setSelectedTaflEntries(new Set());
    setTaflLoadProgress({ percent: 0, loaded: 0, total: 0 });
    
    try {
      let lat: number;
      let lon: number;
      
      if (locationType === 'current') {
        const currentLoc = await getCurrentLocation();
        lat = currentLoc.latitude;
        lon = currentLoc.longitude;
      } else if (locationType === 'coordinates') {
        const parsedLat = parseFloat(latitude);
        const parsedLon = parseFloat(longitude);
        
        if (isNaN(parsedLat) || isNaN(parsedLon)) {
          throw new Error('Invalid coordinates');
        }
        
        if (parsedLat < -90 || parsedLat > 90) {
          throw new Error('Latitude must be between -90 and 90');
        }
        
        if (parsedLon < -180 || parsedLon > 180) {
          throw new Error('Longitude must be between -180 and 180');
        }
        
        lat = parsedLat;
        lon = parsedLon;
      } else {
        // City/State - need to geocode
        const geocoded = await geocodeLocation(city, state);
        if (!geocoded) {
          throw new Error('Could not find location. Please use coordinates instead.');
        }
        
        lat = geocoded.latitude;
        lon = geocoded.longitude;
      }
      
      // Load TAFL data with progress tracking
      const nearbyTafl = await findNearbyTaflEntries(
        lat, 
        lon, 
        parseFloat(taflRadius) || 10,
        (progress) => {
          setTaflLoadProgress({
            percent: progress.percent,
            loaded: progress.loaded,
            total: progress.total,
          });
        }
      );
      setTaflEntries(nearbyTafl);
      
      // Don't auto-select - let user filter and select manually
      setSelectedTaflEntries(new Set());
      
      // Auto-expand all groups by default
      const groups = groupTaflEntriesByName(nearbyTafl, 2);
      setExpandedTaflGroups(new Set(groups.keys()));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to search TAFL entries');
    } finally {
      setIsSearchingTafl(false);
      setTaflLoadProgress(null);
    }
  };

  // Note: handleToggleTafl is now handled inline in the render for deduplicated entries

  // Compute filtered TAFL entries for display
  const filteredTaflEntries = taflSearchFilter.trim()
    ? taflEntries.filter(entry => 
        entry.c.toLowerCase().includes(taflSearchFilter.toLowerCase())
      )
    : taflEntries;
  
  // Deduplicate entries: if same name AND frequency, only keep one
  const uniqueFilteredEntries = new Map<string, TaflData>();
  const entryIndexMap = new Map<string, number>(); // Map unique key to original index
  
  for (let i = 0; i < filteredTaflEntries.length; i++) {
    const entry = filteredTaflEntries[i];
    const key = `${entry.c}|${entry.f}`; // Use name + frequency (in kHz) as unique key
    if (!uniqueFilteredEntries.has(key)) {
      uniqueFilteredEntries.set(key, entry);
      entryIndexMap.set(key, i);
    }
  }
  
  const deduplicatedEntries = Array.from(uniqueFilteredEntries.values());
  
  // Map deduplicated entries to their original indices in filteredTaflEntries
  const filteredTaflIndices = deduplicatedEntries.map(entry => {
    const key = `${entry.c}|${entry.f}`;
    return entryIndexMap.get(key) ?? filteredTaflEntries.findIndex(e => e === entry);
  });
  
  // Group deduplicated entries by name prefix for display
  const taflGroups = groupTaflEntriesByName(deduplicatedEntries, 2);
  const taflGroupArray = Array.from(taflGroups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  
  const handleSelectAllFilteredTafl = () => {
    const newSelected = new Set(selectedTaflEntries);
    filteredTaflIndices.forEach(idx => newSelected.add(idx));
    setSelectedTaflEntries(newSelected);
  };

  const handleDeselectAllTafl = () => {
    setSelectedTaflEntries(new Set());
  };

  const handleAddTaflChannels = async () => {
    if (selectedTaflEntries.size === 0) {
      setError('Please select at least one TAFL entry');
      return;
    }
    
    setIsAddingTafl(true);
    setError(null);
    
    try {
      // Get selected entries
      const selectedTaflList = Array.from(selectedTaflEntries)
        .map(i => taflEntries[i])
        .filter(Boolean);
      
      if (selectedTaflList.length === 0) {
        throw new Error('No TAFL entries selected');
      }
      
      // Find next available channel number
      const existingNumbers = new Set(channels.map(ch => ch.number));
      let nextChannelNumber = 1;
      while (existingNumbers.has(nextChannelNumber)) {
        nextChannelNumber++;
      }
      
      // Generate channels and zones for selected entries
      // TAFL always uses individual zones grouped by name
      const result = generateTaflChannels(
        nextChannelNumber,
        selectedTaflList, // Pass selected entries
        false, // Always use individual zones (not single zone)
        true // Always group by name
      );
      
      if (result.channels.length === 0) {
        setError('No channels to add from selected TAFL entries');
        return;
      }
      
      // Add channels
      const updatedChannels = [...channels, ...result.channels];
      setChannels(updatedChannels);
      
      // Add zones
      const updatedZones = [...zones, ...result.zones];
      setZones(updatedZones);
      
      setGenerationResult({
        channels: result.channels.length,
        zones: result.zones.length,
      });
      
      // Clear selection
      setSelectedTaflEntries(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add TAFL channels');
    } finally {
      setIsAddingTafl(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-neon-cyan mb-2">Channel Wizard</h2>
        <p className="text-cool-gray">
          Find nearby repeaters and automatically generate channels and zones based on your location
        </p>
      </div>

      {/* Location Input */}
      <div className="bg-deep-gray rounded-lg border border-neon-cyan p-4 mb-4">
        <h3 className="text-lg font-semibold text-neon-cyan mb-4">Location</h3>
        
        <div className="mb-4">
          <label className="block text-sm text-cool-gray mb-2">Location Type</label>
          <div className="flex gap-4">
            <label className="flex items-center">
              <input
                type="radio"
                value="current"
                checked={locationType === 'current'}
                onChange={(e) => setLocationType(e.target.value as any)}
                className="mr-2"
              />
              <span className="text-cool-gray">Use Current Location</span>
            </label>
            <label className="flex items-center">
              <input
                type="radio"
                value="coordinates"
                checked={locationType === 'coordinates'}
                onChange={(e) => setLocationType(e.target.value as any)}
                className="mr-2"
              />
              <span className="text-cool-gray">Coordinates</span>
            </label>
            <label className="flex items-center">
              <input
                type="radio"
                value="city"
                checked={locationType === 'city'}
                onChange={(e) => setLocationType(e.target.value as any)}
                className="mr-2"
              />
              <span className="text-cool-gray">City/State</span>
            </label>
          </div>
        </div>

        {locationType === 'coordinates' && (
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm text-cool-gray mb-2">Latitude</label>
              <input
                type="number"
                value={latitude}
                onChange={(e) => setLatitude(e.target.value)}
                placeholder="42.3601"
                step="any"
                className="w-full bg-black border border-neon-cyan rounded px-3 py-2 text-white"
              />
            </div>
            <div>
              <label className="block text-sm text-cool-gray mb-2">Longitude</label>
              <input
                type="number"
                value={longitude}
                onChange={(e) => setLongitude(e.target.value)}
                placeholder="-71.0589"
                step="any"
                className="w-full bg-black border border-neon-cyan rounded px-3 py-2 text-white"
              />
            </div>
          </div>
        )}

        {locationType === 'city' && (
          <div className="mb-4">
            <div className="grid grid-cols-2 gap-4 mb-3">
              <div>
                <label className="block text-sm text-cool-gray mb-2">City</label>
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Boston"
                  className="w-full bg-black border border-neon-cyan rounded px-3 py-2 text-white"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && city.trim()) {
                      handleGeocodeCityState();
                    }
                  }}
                />
              </div>
              <div>
                <label className="block text-sm text-cool-gray mb-2">State/Province</label>
                <input
                  type="text"
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  placeholder="MA"
                  className="w-full bg-black border border-neon-cyan rounded px-3 py-2 text-white"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && city.trim()) {
                      handleGeocodeCityState();
                    }
                  }}
                />
              </div>
            </div>
            <Button
              onClick={handleGeocodeCityState}
              disabled={isSearching || !city.trim()}
              className="w-full mb-3"
            >
              {isSearching ? 'Getting Coordinates...' : 'Get Coordinates'}
            </Button>
            <p className="text-xs text-cool-gray">
              Click to convert city/state to coordinates. The view will switch to coordinates after geocoding.
            </p>
          </div>
        )}

        <div className="mb-4">
          <label className="block text-sm text-cool-gray mb-2">Search Radius (miles)</label>
          <input
            type="number"
            value={radius}
            onChange={(e) => setRadius(e.target.value)}
            min="1"
            max="200"
            className="w-full bg-black border border-neon-cyan rounded px-3 py-2 text-white"
          />
        </div>

        <div className="flex gap-2">
          {locationType === 'current' && (
            <Button
              onClick={handleUseCurrentLocation}
              disabled={isSearching}
              className="bg-neon-cyan text-dark-charcoal hover:bg-neon-cyan-bright"
            >
              Get Current Location
            </Button>
          )}
          <Button
            onClick={handleSearch}
            disabled={isSearching}
            className="bg-neon-cyan text-dark-charcoal hover:bg-neon-cyan-bright"
          >
            {isSearching ? 'Searching...' : 'Search Repeaters'}
          </Button>
        </div>
      </div>

      {/* Airport Search Section */}
      <div className="bg-deep-gray rounded-lg border border-neon-cyan p-4 mb-4">
        <h3 className="text-lg font-semibold text-neon-cyan mb-4">Local Airports</h3>
        <p className="text-sm text-cool-gray mb-4">
          Search for nearby airports and add their frequencies as channels (readonly data from airports_min.json)
        </p>

        <div className="mb-4">
          <label className="block text-sm text-cool-gray mb-2">Search Radius (miles)</label>
          <input
            type="number"
            value={airportRadius}
            onChange={(e) => setAirportRadius(e.target.value)}
            min="1"
            max="200"
            className="w-full bg-black border border-neon-cyan rounded px-3 py-2 text-white mb-2"
          />
        </div>

        <Button
          onClick={handleSearchAirports}
          disabled={isSearchingAirports}
          className="bg-neon-cyan text-dark-charcoal hover:bg-neon-cyan-bright w-full mb-4"
        >
          {isSearchingAirports ? 'Loading...' : 'Search Airports'}
        </Button>

        {/* Progress Bar */}
        {airportLoadProgress && (
          <div className="mb-4">
            <div className="flex justify-between items-center mb-1">
              <span className="text-sm text-cool-gray">
                Loading airport data...
              </span>
              <span className="text-sm text-cool-gray">
                {airportLoadProgress.percent.toFixed(1)}%
              </span>
            </div>
            <div className="w-full bg-black rounded-full h-2 border border-neon-cyan overflow-hidden">
              <div
                className="h-full bg-neon-cyan transition-all duration-300"
                style={{ width: `${airportLoadProgress.percent}%` }}
              />
            </div>
            {airportLoadProgress.total > 0 && (
              <div className="text-xs text-cool-gray mt-1">
                {formatBytes(airportLoadProgress.loaded)} / {formatBytes(airportLoadProgress.total)}
              </div>
            )}
          </div>
        )}

        {/* Airport Results */}
        {airports.length > 0 && (
          <>
            <div className="flex justify-between items-center mb-4">
              <h4 className="text-md font-semibold text-neon-cyan">
                Found {airports.length} Airport{airports.length !== 1 ? 's' : ''}
              </h4>
              <div className="flex gap-2">
                <button
                  onClick={handleSelectAllAirports}
                  className="text-sm text-neon-cyan hover:text-neon-cyan-bright"
                >
                  Select All
                </button>
                <button
                  onClick={handleDeselectAllAirports}
                  className="text-sm text-neon-cyan hover:text-neon-cyan-bright"
                >
                  Deselect All
                </button>
              </div>
            </div>

            <div className="space-y-2 max-h-96 overflow-y-auto mb-4">
              {airports.map((airport, index) => (
                <div
                  key={index}
                  className={`border rounded p-3 cursor-pointer transition-colors ${
                    selectedAirports.has(index)
                      ? 'border-neon-cyan bg-neon-cyan bg-opacity-10'
                      : 'border-gray-600 hover:border-gray-500'
                  }`}
                  onClick={() => handleToggleAirport(index)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <input
                          type="checkbox"
                          checked={selectedAirports.has(index)}
                          onChange={() => handleToggleAirport(index)}
                          onClick={(e) => e.stopPropagation()}
                          className="mr-2"
                        />
                        <span className="font-semibold text-neon-cyan">{airport.c}</span>
                      </div>
                      <div className="text-sm text-cool-gray ml-6">
                        <div className="mb-1">
                          {'distance' in airport && typeof airport.distance === 'number' 
                            ? `${airport.distance.toFixed(1)} miles away`
                            : 'Distance unknown'}
                        </div>
                        <div className="space-y-1">
                          <span className="font-semibold text-cool-gray">Frequencies:</span>
                          {getAirportFrequenciesWithTypes(airport).map((freqInfo, idx) => (
                            <div key={idx} className="ml-2 flex items-start gap-2 text-xs">
                              <span className="font-semibold text-neon-cyan min-w-[65px]">
                                {(freqInfo.frequency / 1000).toFixed(3)} MHz
                              </span>
                              <span className="text-yellow-400 min-w-[70px]">
                                {freqInfo.type}
                              </span>
                              <span className="text-cool-gray opacity-75">
                                {freqInfo.description}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {selectedAirports.size > 0 && (
              <>
                <div className="mb-4">
                  <label className="block text-sm text-cool-gray mb-2">Zone Organization</label>
                  <div className="space-y-2">
                    <label className="flex items-center">
                      <input
                        type="radio"
                        value="individual"
                        checked={airportZoneGrouping === 'individual'}
                        onChange={(e) => setAirportZoneGrouping(e.target.value as 'individual' | 'single')}
                        className="mr-2"
                      />
                      <span className="text-cool-gray">Individual zones (one per airport)</span>
                    </label>
                    <label className="flex items-center">
                      <input
                        type="radio"
                        value="single"
                        checked={airportZoneGrouping === 'single'}
                        onChange={(e) => setAirportZoneGrouping(e.target.value as 'individual' | 'single')}
                        className="mr-2"
                      />
                      <span className="text-cool-gray">Single zone (all airports together)</span>
                    </label>
                  </div>
                </div>
                <Button
                  onClick={handleAddAirportChannels}
                  disabled={isAddingAirports}
                  className="bg-neon-magenta text-white hover:bg-neon-magenta-bright w-full"
                >
                  {isAddingAirports
                    ? 'Adding Airport Channels...'
                    : `Add ${selectedAirports.size} Airport Channel${selectedAirports.size !== 1 ? 's' : ''}`}
                </Button>
              </>
            )}
          </>
        )}
      </div>

      {/* TAFL Search Section */}
      <div className="bg-deep-gray rounded-lg border border-neon-cyan p-4 mb-4">
        <h3 className="text-lg font-semibold text-neon-cyan mb-4">Local TAFL Entries</h3>
        <p className="text-sm text-cool-gray mb-4">
          Search for nearby TAFL (Technical Acceptance and Frequency List) entries and add their frequencies as channels (readonly data from tafl_min.json)
        </p>

        <div className="mb-4 space-y-3">
          <div className="flex items-end gap-3">
            <div>
              <label className="block text-sm text-cool-gray mb-2">Search Radius (miles)</label>
              <input
                type="number"
                value={taflRadius}
                onChange={(e) => setTaflRadius(e.target.value)}
                min="1"
                max="50"
                className="w-32 bg-black border border-neon-cyan rounded px-3 py-2 text-white"
              />
            </div>
            <Button
              onClick={handleSearchTafl}
              disabled={isSearchingTafl}
              className="bg-neon-cyan text-dark-charcoal hover:bg-neon-cyan-bright"
            >
              {isSearchingTafl ? 'Loading...' : 'Search by Location'}
            </Button>
          </div>

          {/* Progress Bar */}
          {taflLoadProgress && (
            <div className="mb-4">
              <div className="flex justify-between items-center mb-1">
                <span className="text-sm text-cool-gray">
                  Loading TAFL data...
                </span>
                <span className="text-sm text-cool-gray">
                  {taflLoadProgress.percent.toFixed(1)}%
                </span>
              </div>
              <div className="w-full bg-black rounded-full h-2 border border-neon-magenta overflow-hidden">
                <div
                  className="h-full bg-neon-magenta transition-all duration-300"
                  style={{ width: `${taflLoadProgress.percent}%` }}
                />
              </div>
              {taflLoadProgress.total > 0 && (
                <div className="text-xs text-cool-gray mt-1">
                  {formatBytes(taflLoadProgress.loaded)} / {formatBytes(taflLoadProgress.total)}
                </div>
              )}
            </div>
          )}
          
          {taflEntries.length > 0 && (
            <div>
              <label className="block text-sm text-cool-gray mb-2">Filter by Name/Code</label>
              <input
                type="text"
                value={taflSearchFilter}
                onChange={(e) => setTaflSearchFilter(e.target.value)}
                placeholder="Search entries..."
                className="w-full bg-black border border-neon-cyan rounded px-3 py-2 text-white"
              />
            </div>
          )}
        </div>

        {taflEntries.length > 0 && (
          <>
            <div className="flex justify-between items-center mb-4">
              <h4 className="text-md font-semibold text-neon-cyan">
                {filteredTaflEntries.length} of {taflEntries.length} TAFL Entr{filteredTaflEntries.length !== 1 ? 'ies' : 'y'}
                {taflSearchFilter.trim() && ` (filtered)`}
              </h4>
              <div className="flex gap-2">
                <button
                  onClick={handleSelectAllFilteredTafl}
                  className="text-sm text-neon-cyan hover:text-neon-cyan-bright"
                >
                  Select All Filtered
                </button>
                <button
                  onClick={handleDeselectAllTafl}
                  className="text-sm text-neon-cyan hover:text-neon-cyan-bright"
                >
                  Deselect All
                </button>
              </div>
            </div>

            <div className="space-y-3 max-h-96 overflow-y-auto mb-4">
              {taflGroupArray.map(([groupName, groupEntries]) => {
                // Get original indices for this group (using deduplicated entry mapping)
                const groupIndices = groupEntries.map(entry => {
                  const key = `${entry.c}|${entry.f}`;
                  return entryIndexMap.get(key) ?? filteredTaflEntries.findIndex(e => e === entry);
                }).filter(idx => idx !== -1);
                
                const allSelected = groupIndices.every(idx => selectedTaflEntries.has(idx));
                const someSelected = groupIndices.some(idx => selectedTaflEntries.has(idx));
                const isGroup = groupEntries.length > 1;
                const isExpanded = expandedTaflGroups.has(groupName);
                
                const handleToggleGroup = () => {
                  const newSelected = new Set(selectedTaflEntries);
                  if (allSelected) {
                    // Deselect all in group
                    groupIndices.forEach(idx => newSelected.delete(idx));
                  } else {
                    // Select all in group
                    groupIndices.forEach(idx => newSelected.add(idx));
                  }
                  setSelectedTaflEntries(newSelected);
                };
                
                const handleToggleExpand = (e: React.MouseEvent) => {
                  e.stopPropagation();
                  const newExpanded = new Set(expandedTaflGroups);
                  if (isExpanded) {
                    newExpanded.delete(groupName);
                  } else {
                    newExpanded.add(groupName);
                  }
                  setExpandedTaflGroups(newExpanded);
                };
                
                return (
                  <div
                    key={groupName}
                    className={`border rounded transition-colors ${
                      someSelected
                        ? 'border-neon-cyan bg-neon-cyan bg-opacity-10'
                        : 'border-gray-600'
                    }`}
                  >
                    {isGroup && (
                      <div
                        className="p-2 bg-deep-gray cursor-pointer hover:bg-opacity-80"
                        onClick={handleToggleGroup}
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={allSelected}
                            onChange={handleToggleGroup}
                            onClick={(e) => {
                              e.stopPropagation();
                              const input = e.target as HTMLInputElement;
                              input.indeterminate = someSelected && !allSelected;
                            }}
                            className="mr-2"
                          />
                          <button
                            onClick={handleToggleExpand}
                            className="mr-1 text-neon-cyan hover:text-neon-cyan-bright"
                            title={isExpanded ? 'Collapse' : 'Expand'}
                          >
                            {isExpanded ? '▼' : '▶'}
                          </button>
                          <span className="font-semibold text-neon-cyan">
                            {groupName} ({groupEntries.length} entries)
                          </span>
                        </div>
                      </div>
                    )}
                    {(isGroup ? isExpanded : true) && (
                      <div className={isGroup ? 'pl-4' : ''}>
                        {groupEntries.map((entry) => {
                          // Find all indices in filteredTaflEntries that match this entry (name + frequency)
                          const matchingIndices = filteredTaflEntries
                            .map((e, idx) => e.c === entry.c && e.f === entry.f ? idx : -1)
                            .filter(idx => idx !== -1);
                          
                          // Use first matching index as the key for display
                          const displayIndex = matchingIndices[0] ?? -1;
                          if (displayIndex === -1) return null;
                          
                          // Check if any of the matching entries are selected
                          const isSelected = matchingIndices.some(idx => selectedTaflEntries.has(idx));
                          
                          const handleToggleEntry = () => {
                            const newSelected = new Set(selectedTaflEntries);
                            if (isSelected) {
                              // Deselect all matching entries
                              matchingIndices.forEach(idx => newSelected.delete(idx));
                            } else {
                              // Select all matching entries (they're duplicates, so select all)
                              matchingIndices.forEach(idx => newSelected.add(idx));
                            }
                            setSelectedTaflEntries(newSelected);
                          };
                          
                          return (
                            <div
                              key={`${entry.c}|${entry.f}`}
                              className={`border-t border-gray-600 p-3 cursor-pointer transition-colors ${
                                isSelected
                                  ? 'bg-neon-cyan bg-opacity-5'
                                  : 'hover:bg-gray-800'
                              }`}
                              onClick={handleToggleEntry}
                            >
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-1">
                                    <input
                                      type="checkbox"
                                      checked={isSelected}
                                      onChange={handleToggleEntry}
                                      onClick={(e) => e.stopPropagation()}
                                      className="mr-2"
                                    />
                                    <span className="font-semibold text-neon-cyan">{entry.c}</span>
                                    {matchingIndices.length > 1 && (
                                      <span className="text-xs text-cool-gray">
                                        ({matchingIndices.length} duplicates)
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-sm text-cool-gray ml-6">
                                    <div className="mb-1">
                                      {'distance' in entry && typeof entry.distance === 'number' 
                                        ? `${entry.distance.toFixed(1)} miles away`
                                        : 'Distance unknown'}
                                    </div>
                                    <div className="space-y-1">
                                      <span className="font-semibold text-cool-gray">Frequency:</span>
                                      <div className="ml-2 text-xs">
                                        <span className="font-semibold text-neon-cyan">
                                          {(entry.f / 1000.0).toFixed(3)} MHz
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {selectedTaflEntries.size > 0 && (
              <Button
                onClick={handleAddTaflChannels}
                disabled={isAddingTafl}
                className="bg-neon-magenta text-white hover:bg-neon-magenta-bright w-full"
              >
                {isAddingTafl
                  ? 'Adding TAFL Channels...'
                  : `Add ${selectedTaflEntries.size} TAFL Channel${selectedTaflEntries.size !== 1 ? 's' : ''}`}
              </Button>
            )}
          </>
        )}
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-900 border border-red-500 rounded p-3 mb-4 text-red-200">
          {error}
        </div>
      )}

      {/* Success Message */}
      {generationResult && (
        <div className="bg-green-900 border border-green-500 rounded p-3 mb-4 text-green-200">
          Successfully generated {generationResult.channels} channels and {generationResult.zones} zones!
        </div>
      )}

      {/* Repeater Results */}
      {repeaters.length > 0 && (
        <div className="bg-deep-gray rounded-lg border border-neon-cyan p-4 mb-4">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-neon-cyan">
              Found {repeaters.length} Repeater{repeaters.length !== 1 ? 's' : ''}
            </h3>
            <div className="flex gap-2">
              <button
                onClick={handleSelectAll}
                className="text-sm text-neon-cyan hover:text-neon-cyan-bright"
              >
                Select All
              </button>
              <button
                onClick={handleDeselectAll}
                className="text-sm text-neon-cyan hover:text-neon-cyan-bright"
              >
                Deselect All
              </button>
            </div>
          </div>

          <div className="space-y-2 max-h-96 overflow-y-auto">
            {repeaters.map((repeater, index) => (
              <div
                key={index}
                className={`border rounded p-3 cursor-pointer transition-colors ${
                  selectedRepeaters.has(index)
                    ? 'border-neon-cyan bg-neon-cyan bg-opacity-10'
                    : 'border-gray-600 hover:border-gray-500'
                }`}
                onClick={() => handleToggleRepeater(index)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <input
                        type="checkbox"
                        checked={selectedRepeaters.has(index)}
                        onChange={() => handleToggleRepeater(index)}
                        onClick={(e) => e.stopPropagation()}
                        className="mr-2"
                      />
                      <span className="font-semibold text-neon-cyan">{repeater.callsign}</span>
                      <span className="text-cool-gray text-sm">{repeater.band.toUpperCase()}</span>
                      <span className="text-cool-gray text-sm">{repeater.mode}</span>
                    </div>
                    <div className="text-sm text-cool-gray">
                      <div>
                        {repeater.frequency.toFixed(3)} MHz
                        {repeater.ctcss && ` (CTCSS ${repeater.ctcss} Hz)`}
                        {repeater.dcs && ` (DCS ${repeater.dcs})`}
                      </div>
                      <div>
                        {repeater.location}
                        {repeater.city && `, ${repeater.city}`}
                        {repeater.state && `, ${repeater.state}`}
                        {repeater.distance && ` (${repeater.distance.toFixed(1)} mi)`}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Generation Options */}
      {repeaters.length > 0 && (
        <div className="bg-deep-gray rounded-lg border border-neon-cyan p-4 mb-4">
          <h3 className="text-lg font-semibold text-neon-cyan mb-4">Zone Generation Options</h3>
          
          <div className="space-y-3">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={groupByBand}
                onChange={(e) => {
                  setGroupByBand(e.target.checked);
                  if (e.target.checked) setGroupByDistance(false);
                }}
                className="mr-2"
              />
              <span className="text-cool-gray">Group by Band (2m, 70cm, etc.)</span>
            </label>
            
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={groupByDistance}
                onChange={(e) => {
                  setGroupByDistance(e.target.checked);
                  if (e.target.checked) setGroupByBand(false);
                }}
                className="mr-2"
              />
              <span className="text-cool-gray">Group by Distance</span>
            </label>
            
            {groupByDistance && (
              <div className="ml-6">
                <label className="block text-sm text-cool-gray mb-2">
                  Max Distance per Zone (miles)
                </label>
                <input
                  type="number"
                  value={maxDistancePerZone}
                  onChange={(e) => setMaxDistancePerZone(e.target.value)}
                  min="5"
                  max="100"
                  className="w-32 bg-black border border-neon-cyan rounded px-3 py-2 text-white"
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Generate Button */}
      {selectedRepeaters.size > 0 && (
        <div className="mb-4">
          <Button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="bg-neon-magenta text-white hover:bg-neon-magenta-bright w-full"
          >
            {isGenerating
              ? 'Generating...'
              : `Generate ${selectedRepeaters.size} Channel${selectedRepeaters.size !== 1 ? 's' : ''} and Zones`}
          </Button>
        </div>
      )}

      {/* Fixed Channels Section */}
      <div className="bg-deep-gray rounded-lg border border-neon-cyan p-4 mb-4">
        <h3 className="text-lg font-semibold text-neon-cyan mb-2">Fixed Channels</h3>
        <p className="text-sm text-cool-gray mb-4">
          Add standard channel sets that are location-independent (FRS, GMRS, MURS, etc.)
        </p>

        <div className="space-y-2 mb-4">
          {fixedChannelSets.map((set) => {
            const isExpanded = expandedChannelSet === set.name;
            
            return (
              <div
                key={set.name}
                className={`border rounded transition-colors ${
                  selectedFixedSets.has(set.name)
                    ? 'border-neon-cyan bg-neon-cyan bg-opacity-10'
                    : 'border-gray-600 hover:border-gray-500'
                }`}
              >
                <div
                  className="p-3 cursor-pointer"
                  onClick={() => setExpandedChannelSet(isExpanded ? null : set.name)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <input
                          type="checkbox"
                          checked={selectedFixedSets.has(set.name)}
                          onChange={() => handleToggleFixedSet(set.name)}
                          onClick={(e) => e.stopPropagation()}
                          className="mr-2"
                        />
                        <span className="font-semibold text-neon-cyan">{set.name}</span>
                        <span className="text-cool-gray text-sm">
                          ({set.channels.length} channels)
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedChannelSet(isExpanded ? null : set.name);
                          }}
                          className="ml-auto text-neon-cyan hover:text-neon-cyan-bright text-sm"
                        >
                          {isExpanded ? '▼' : '▶'}
                        </button>
                      </div>
                      <div className="text-sm text-cool-gray ml-6">
                        {set.description}
                      </div>
                    </div>
                  </div>
                </div>
                
                {isExpanded && (
                  <div className="border-t border-gray-600 p-3 bg-black bg-opacity-30">
                    <div className="text-sm text-cool-gray mb-2 font-semibold">Channels:</div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      {set.channels.map((channel, index) => (
                        <div
                          key={index}
                          className="bg-deep-gray rounded p-2 border border-gray-700"
                        >
                          <div className="font-semibold text-neon-cyan">{channel.name}</div>
                          <div className="text-cool-gray">
                            RX: {channel.rxFrequency.toFixed(4)} MHz
                          </div>
                          <div className="text-cool-gray">
                            TX: {channel.txFrequency.toFixed(4)} MHz
                          </div>
                          <div className="text-cool-gray">
                            Power: {channel.power}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {selectedFixedSets.size > 0 && (
          <Button
            onClick={handleAddFixedChannels}
            disabled={isAddingFixed}
            className="bg-neon-magenta text-white hover:bg-neon-magenta-bright w-full"
          >
            {isAddingFixed
              ? 'Adding...'
              : `Add ${selectedFixedSets.size} Channel Set${selectedFixedSets.size !== 1 ? 's' : ''}`}
          </Button>
        )}
      </div>

    </div>
  );
};
