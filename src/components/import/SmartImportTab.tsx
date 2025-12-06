import React, { useState } from 'react';
import { useChannelsStore } from '../../store/channelsStore';
import { useZonesStore } from '../../store/zonesStore';
import { searchRepeaters, getCurrentLocation, geocodeLocation, type Repeater, type LocationInput } from '../../services/repeaterFinder';
import { generateChannelsAndZones, type GenerationOptions } from '../../services/locationChannelGenerator';
import { getAvailableFixedChannelSets, getFRSChannels, getGMRSChannels, getMURSChannels, getHamCallingFrequencies } from '../../services/fixedChannels';
import { mergeOverlappingChannels } from '../../services/channelMerger';
import { generateAirportChannels } from '../../services/airportChannels';
import { findNearbyAirports, getAirportFrequenciesWithTypes, type AirportData } from '../../data/airportsData';
import type { Channel } from '../../models';
import type { Zone } from '../../models';
import { Button } from '../ui/Button';

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
        let setChannels: Channel[] = [];
        let tempStartNumber = 1;
        
        switch (setName) {
          case 'FRS':
            setChannels = getFRSChannels(tempStartNumber);
            break;
          case 'GMRS':
            setChannels = getGMRSChannels(tempStartNumber);
            break;
          case 'MURS':
            setChannels = getMURSChannels(tempStartNumber);
            break;
          case 'Ham Calling':
            setChannels = getHamCallingFrequencies(tempStartNumber);
            break;
        }
        
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
      
      const nearbyAirports = findNearbyAirports(lat, lon, parseFloat(airportRadius) || 50);
      setAirports(nearbyAirports);
      
      // Auto-select all airports
      setSelectedAirports(new Set(nearbyAirports.map((_, i) => i)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to search airports');
    } finally {
      setIsSearchingAirports(false);
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
      
      // Get location from first airport (they're all nearby)
      const firstAirport = selectedAirportList[0];
      const [firstLat, firstLon] = firstAirport.l;
      
      // Find next available channel number
      const existingNumbers = new Set(channels.map(ch => ch.number));
      let nextChannelNumber = 1;
      while (existingNumbers.has(nextChannelNumber)) {
        nextChannelNumber++;
      }
      
      // Generate channels and zones for selected airports
      const result = generateAirportChannels(
        firstLat,
        firstLon,
        parseFloat(airportRadius) || 50,
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

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-neon-cyan mb-2">Smart Import</h2>
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
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm text-cool-gray mb-2">City</label>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Boston"
                className="w-full bg-black border border-neon-cyan rounded px-3 py-2 text-white"
              />
            </div>
            <div>
              <label className="block text-sm text-cool-gray mb-2">State</label>
              <input
                type="text"
                value={state}
                onChange={(e) => setState(e.target.value)}
                placeholder="MA"
                className="w-full bg-black border border-neon-cyan rounded px-3 py-2 text-white"
              />
            </div>
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
          {isSearchingAirports ? 'Searching...' : 'Search Airports'}
        </Button>

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
