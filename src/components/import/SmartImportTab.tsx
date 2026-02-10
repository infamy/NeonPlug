import React, { useState, useRef, useEffect } from 'react';
import { useChannelsStore } from '../../store/channelsStore';
import { useZonesStore } from '../../store/zonesStore';
import { getCurrentLocation, geocodeLocation } from '../../services/repeaterFinder';
import { getAvailableFixedChannelSets, getChannelsForSet } from '../../services/fixedChannels';
import { mergeOverlappingChannels, getChannelFullKey } from '../../services/channelMerger';
import { generateAirportChannels } from '../../services/airportChannels';
import { generateZoneId } from '../../utils/zoneHelpers';
import { findNearbyAirports, getAirportFrequenciesWithTypes, type AirportData } from '../../data/airportsData';
import { generateTaflChannels } from '../../services/taflChannels';
import { findNearbyTaflEntries, groupTaflEntriesByName, type TaflData } from '../../data/taflData';
import { generateRptrsChannels } from '../../services/rptrsChannels';
import { findNearbyRptrs, convertRptrFrequency, type RptrData } from '../../data/rptrsData';
import { importChannelsFromChirpCSV, exportChannelsToChirpCSV, downloadCSV } from '../../services/csv';
import {
  generateMMDVMChannels,
  isValidMMDVMFrequency,
  MMDVM_FREQ_MIN_MHZ,
  MMDVM_FREQ_MAX_MHZ,
  type MMDVMChannelEntry,
} from '../../services/mmdvmChannels';
import type { Channel } from '../../models';
import type { Zone } from '../../models';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { SectionTitle } from '../ui/SectionTitle';
import { useContactsStore } from '../../store/contactsStore';
import { useDMRRadioIDsStore } from '../../store/dmrRadioIdsStore';
import { useRadioStore } from '../../store/radioStore';
import { getCapabilitiesForModel } from '../../radios/capabilities';

export const SmartImportTab: React.FC = () => {
  const { channels, setChannels } = useChannelsStore();
  const { zones, setZones } = useZonesStore();
  const { contacts, setContacts } = useContactsStore();
  const { radioIds } = useDMRRadioIDsStore();
  const { radioInfo, selectedRadioModel } = useRadioStore();
  const effectiveModel = radioInfo?.model ?? selectedRadioModel ?? null;
  const caps = React.useMemo(() => getCapabilitiesForModel(effectiveModel), [effectiveModel]);
  const supportsDigital = caps?.analogOnly !== true;
  
  const [locationType, setLocationType] = useState<'coordinates' | 'city' | 'current'>('current');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [error, setError] = useState<string | null>(null);
  
  // Unified location search state
  const [searchRadius, setSearchRadius] = useState('50');
  const [searchAirports, setSearchAirports] = useState(true);
  const [searchTafl, setSearchTafl] = useState(true);
  const [searchDmrRepeaters, setSearchDmrRepeaters] = useState(true);
  const [isSearchingAll, setIsSearchingAll] = useState(false);
  
  // Generation result
  const [generationResult, setGenerationResult] = useState<{ channels: number; zones: number } | null>(null);
  
  // Fixed channels state
  const [selectedFixedSets, setSelectedFixedSets] = useState<Set<string>>(new Set());
  const [isAddingFixed, setIsAddingFixed] = useState(false);
  const [expandedChannelSet, setExpandedChannelSet] = useState<string | null>(null);
  
  // Airport channels state
  const [airportRadius] = useState('50');
  const [isAddingAirports, setIsAddingAirports] = useState(false);
  const [isSearchingAirports, setIsSearchingAirports] = useState(false);
  const [airports, setAirports] = useState<AirportData[]>([]);
  const [selectedAirports, setSelectedAirports] = useState<Set<number>>(new Set());
  const [airportZoneGrouping, setAirportZoneGrouping] = useState<'individual' | 'single'>('individual');
  
  // TAFL channels state
  const [taflRadius] = useState('10'); // Reduced default from 50 to 10
  const [taflSearchFilter, setTaflSearchFilter] = useState('');
  const [isAddingTafl, setIsAddingTafl] = useState(false);
  const [isSearchingTafl, setIsSearchingTafl] = useState(false);
  const [taflEntries, setTaflEntries] = useState<TaflData[]>([]);
  const [selectedTaflEntries, setSelectedTaflEntries] = useState<Set<number>>(new Set());
  const [expandedTaflGroups, setExpandedTaflGroups] = useState<Set<string>>(new Set());
  const [taflLoadProgress, setTaflLoadProgress] = useState<{ percent: number; loaded: number; total: number } | null>(null);
  
  // DMR Repeater (rptrs) channels state
  const [rptrsRadius] = useState('50');
  const [rptrsSearchFilter, setRptrsSearchFilter] = useState('');
  const [isAddingRptrs, setIsAddingRptrs] = useState(false);
  const [isSearchingRptrs, setIsSearchingRptrs] = useState(false);
  const [rptrs, setRptrs] = useState<(RptrData & { distance?: number })[]>([]);
  const [selectedRptrs, setSelectedRptrs] = useState<Set<number>>(new Set());
  const [rptrsZoneGrouping, setRptrsZoneGrouping] = useState<'location' | 'single'>('location');
  const [rptrsSeparateTimeslots, setRptrsSeparateTimeslots] = useState(true);
  const [rptrsLoadProgress, setRptrsLoadProgress] = useState<{ percent: number; loaded: number; total: number } | null>(null);
  
  // Chirp CSV import/export state
  const [isImportingChirp, setIsImportingChirp] = useState(false);
  const [chirpImportResult, setChirpImportResult] = useState<{ 
    operation: 'import' | 'export';
    channels: number; 
    errors?: string[] 
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // MMDVM simplex state
  const [mmdvmFrequency, setMmdvmFrequency] = useState('431.150');
  const [mmdvmEntries, setMmdvmEntries] = useState<MMDVMChannelEntry[]>([
    { channelName: '', talkGroupName: 'Local', talkGroupId: 9 },
  ]);
  const [mmdvmZoneName, setMmdvmZoneName] = useState('MMDVM');
  const [mmdvmDmrRadioIdIndex, setMmdvmDmrRadioIdIndex] = useState<string>(''); // '' = None, or String(index)
  const [isAddingMmdvm, setIsAddingMmdvm] = useState(false);
  const mmdvmDmrIdDefaultSetRef = useRef(false);

  // Preset MMDVM DMR Radio ID to first ID (slot 1) when list becomes available, once
  useEffect(() => {
    if (radioIds.length > 0 && !mmdvmDmrIdDefaultSetRef.current) {
      setMmdvmDmrRadioIdIndex(String(radioIds[0].index));
      mmdvmDmrIdDefaultSetRef.current = true;
    }
  }, [radioIds]);


  // Unified search handler that searches all selected types
  const handleSearchAll = async () => {
    const hasSearchType = supportsDigital
      ? (searchAirports || searchTafl || searchDmrRepeaters)
      : (searchAirports || searchTafl);
    if (!hasSearchType) {
      setError(supportsDigital
        ? 'Please select at least one search type (Airports, TAFL, or DMR Repeaters)'
        : 'Please select at least one search type (Airports or TAFL)');
      return;
    }

    setIsSearchingAll(true);
    setIsSearchingAirports(searchAirports);
    setIsSearchingTafl(searchTafl);
    setIsSearchingRptrs(supportsDigital && searchDmrRepeaters);
    setError(null);
    
    // Clear previous results
    if (searchAirports) {
      setAirports([]);
      setSelectedAirports(new Set());
    }
    if (searchTafl) {
      setTaflEntries([]);
      setSelectedTaflEntries(new Set());
    }
    if (searchDmrRepeaters) {
      setRptrs([]);
      setSelectedRptrs(new Set());
    }

    try {
      let lat: number;
      let lon: number;
      
      // Get location
      if (locationType === 'current') {
        const currentLoc = await getCurrentLocation();
        lat = currentLoc.latitude;
        lon = currentLoc.longitude;
      } else if (locationType === 'coordinates') {
        const parsedLat = parseFloat(latitude);
        const parsedLon = parseFloat(longitude);
        
        if (isNaN(parsedLat) || isNaN(parsedLon) || !latitude.trim() || !longitude.trim()) {
          throw new Error('Invalid coordinates. Please enter valid latitude and longitude.');
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
        if (!city.trim()) {
          throw new Error('Please enter a city name.');
        }
        const geocoded = await geocodeLocation(city, state);
        if (!geocoded) {
          throw new Error('Could not find location. Please check the city and state names, or use coordinates instead.');
        }
        lat = geocoded.latitude;
        lon = geocoded.longitude;
        // Optionally update the coordinates fields so user can see them
        setLatitude(lat.toFixed(6));
        setLongitude(lon.toFixed(6));
      }
      
      const radius = parseFloat(searchRadius) || 50;
      if (isNaN(radius) || radius <= 0) {
        throw new Error('Please enter a valid search radius (greater than 0).');
      }

      // Search all selected types in parallel
      const searchPromises: Promise<void>[] = [];

      if (searchAirports) {
        searchPromises.push(
          (async () => {
            const airportRadiusValue = parseFloat(airportRadius) || radius;
            const nearbyAirports = await findNearbyAirports(lat, lon, airportRadiusValue);
            setAirports(nearbyAirports);
            setSelectedAirports(new Set(nearbyAirports.map((_, i) => i)));
            setIsSearchingAirports(false);
          })()
        );
      }

      if (searchTafl) {
        searchPromises.push(
          (async () => {
            const taflRadiusValue = parseFloat(taflRadius) || 10;
            const nearbyTafl = await findNearbyTaflEntries(
              lat,
              lon,
              taflRadiusValue,
              (progress) => {
                setTaflLoadProgress({
                  percent: progress.percent,
                  loaded: progress.loaded,
                  total: progress.total,
                });
              }
            );
            setTaflEntries(nearbyTafl);
            setIsSearchingTafl(false);
          })()
        );
      }

      if (searchDmrRepeaters) {
        searchPromises.push(
          (async () => {
            const rptrsRadiusValue = parseFloat(rptrsRadius) || radius;
            const nearbyRptrs = await findNearbyRptrs(
              lat,
              lon,
              rptrsRadiusValue,
              (progress) => {
                setRptrsLoadProgress({
                  percent: progress.percent,
                  loaded: progress.loaded,
                  total: progress.total,
                });
              }
            );
            setRptrs(nearbyRptrs);
            setSelectedRptrs(new Set(nearbyRptrs.map((_, i) => i)));
            setIsSearchingRptrs(false);
          })()
        );
      }

      await Promise.all(searchPromises);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to search');
      setIsSearchingAirports(false);
      setIsSearchingTafl(false);
      setIsSearchingRptrs(false);
    } finally {
      setIsSearchingAll(false);
      setTaflLoadProgress(null);
      setRptrsLoadProgress(null);
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
      
      // FIRST: Check against existing channels and build mapping for duplicates
      // Match on ALL settings: frequency, name, mode, bandwidth, power, CTCSS/DCS
      const existingChannelMap = new Map<string, number>(); // full key -> channel number
      for (const ch of channels) {
        const fullKey = getChannelFullKey(ch);
        existingChannelMap.set(fullKey, ch.number);
      }
      
      // Merge overlapping channels (within new sets only)
      const { mergedChannels, channelMapping } = mergeOverlappingChannels(channelSets, nextChannelNumber);
      
      // Update mapping to use existing channels where ALL settings match
      const finalChannelMapping = new Map<number, number>();
      const channelsToAdd: Channel[] = [];
      
      for (const newChannel of mergedChannels) {
        const fullKey = getChannelFullKey(newChannel);
        
        if (existingChannelMap.has(fullKey)) {
          // This exact channel already exists - use existing channel
          const existingChannelNum = existingChannelMap.get(fullKey)!;
          console.log(`[SmartImport] Channel ${newChannel.number} "${newChannel.name}" (${newChannel.rxFrequency} MHz) is EXACT DUPLICATE of existing channel ${existingChannelNum}`);
          
          // Update all mappings that point to this merged channel
          for (const [origNum, mergedNum] of channelMapping.entries()) {
            if (mergedNum === newChannel.number) {
              finalChannelMapping.set(origNum, existingChannelNum);
            }
          }
        } else {
          // New unique channel (or different settings) - add it
          channelsToAdd.push(newChannel);
          
          // Copy mapping as-is for this channel
          for (const [origNum, mergedNum] of channelMapping.entries()) {
            if (mergedNum === newChannel.number) {
              finalChannelMapping.set(origNum, newChannel.number);
            }
          }
        }
      }
      
      console.log(`[SmartImport] Adding ${channelsToAdd.length} new channels (${mergedChannels.length - channelsToAdd.length} were duplicates of existing)`);
      
      // Create zones with final channel numbers
      const newZones: Zone[] = [];
      for (let i = 0; i < channelSets.length; i++) {
        const setChannels = channelSets[i];
        const setName = setNames[i];
        
        // Map original channel numbers to final channel numbers
        const zoneChannelNumbers = setChannels
          .map(ch => finalChannelMapping.get(ch.number))
          .filter((num): num is number => num !== undefined)
          .sort((a, b) => a - b);
        
        if (zoneChannelNumbers.length > 0) {
          newZones.push({
            id: generateZoneId(),
            name: setName,
            channels: zoneChannelNumbers,
          });
        }
      }
      
      // Add only new channels (not duplicates)
      const updatedChannels = [...channels, ...channelsToAdd];
      setChannels(updatedChannels);
      
      const updatedZones = [...zones, ...newZones];
      setZones(updatedZones);
      
      setGenerationResult({
        channels: channelsToAdd.length,
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



  const handleToggleRptr = (index: number) => {
    const newSelected = new Set(selectedRptrs);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedRptrs(newSelected);
  };

  const handleSelectAllRptrs = () => {
    setSelectedRptrs(new Set(rptrs.map((_, i) => i)));
  };

  const handleDeselectAllRptrs = () => {
    setSelectedRptrs(new Set());
  };

  const handleAddRptrsChannels = async () => {
    if (selectedRptrs.size === 0) {
      setError('Please select at least one DMR repeater');
      return;
    }
    
    setIsAddingRptrs(true);
    setError(null);
    
    try {
      // Get selected repeaters
      const selectedRptrsList = Array.from(selectedRptrs)
        .map(i => rptrs[i])
        .filter(Boolean);
      
      if (selectedRptrsList.length === 0) {
        throw new Error('No DMR repeaters selected');
      }
      
      // Find next available channel number
      const existingNumbers = new Set(channels.map(ch => ch.number));
      let nextChannelNumber = 1;
      while (existingNumbers.has(nextChannelNumber)) {
        nextChannelNumber++;
      }
      
      // Generate channels and zones for selected repeaters
      const result = generateRptrsChannels(
        nextChannelNumber,
        selectedRptrsList,
        rptrsZoneGrouping === 'single',
        rptrsZoneGrouping === 'location',
        rptrsSeparateTimeslots
      );
      
      if (result.channels.length === 0) {
        setError('No channels to add from selected DMR repeaters');
        return;
      }
      
      // Merge with existing channels to avoid duplicates
      const mergedResult = mergeOverlappingChannels([channels, result.channels]);
      setChannels(mergedResult.mergedChannels);
      
      // Add zones
      const updatedZones = [...zones, ...result.zones];
      setZones(updatedZones);
      
      setGenerationResult({
        channels: result.channels.length,
        zones: result.zones.length,
      });
      
      // Clear selection
      setSelectedRptrs(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add DMR repeater channels');
    } finally {
      setIsAddingRptrs(false);
    }
  };

  const handleChirpCSVImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImportingChirp(true);
    setError(null);
    setChirpImportResult(null);

    try {
      const content = await file.text();
      
      // Find next available channel number
      const existingNumbers = new Set(channels.map(ch => ch.number));
      let nextChannelNumber = 1;
      while (existingNumbers.has(nextChannelNumber)) {
        nextChannelNumber++;
      }

      const result = importChannelsFromChirpCSV(content, nextChannelNumber);

      if (result.success && result.channels) {
        // Add imported channels
        const newChannels = [...channels, ...result.channels];
        setChannels(newChannels);
        
        setChirpImportResult({
          operation: 'import',
          channels: result.channels.length,
          errors: result.errors,
        });
      } else {
        setError(result.errors?.join('\n') || 'Failed to import CHIRP CSV');
        setChirpImportResult({
          operation: 'import',
          channels: 0,
          errors: result.errors,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import CHIRP CSV file');
    } finally {
      setIsImportingChirp(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleAddMmdvmChannels = () => {
    const freq = parseFloat(mmdvmFrequency);
    if (!isValidMMDVMFrequency(freq)) {
      setError(`Frequency must be between ${MMDVM_FREQ_MIN_MHZ} and ${MMDVM_FREQ_MAX_MHZ} MHz`);
      return;
    }
    const validEntries = mmdvmEntries.filter(
      (e) => (e.talkGroupName?.trim() || e.channelName?.trim()) && !isNaN(e.talkGroupId) && e.talkGroupId >= 0
    );
    if (validEntries.length === 0) {
      setError('Add at least one channel with a Talk Group name and Talk Group ID.');
      return;
    }

    setIsAddingMmdvm(true);
    setError(null);

    try {
      const existingChannelNumbers = new Set(channels.map((ch) => ch.number));
      let nextChannelNumber = 1;
      while (existingChannelNumbers.has(nextChannelNumber)) {
        nextChannelNumber++;
      }

      const maxContactId = contacts.length > 0 ? Math.max(...contacts.map((c) => c.id)) : 0;
      const firstContactId = maxContactId + 1;

      const firstDmrRadioIdIndex =
        mmdvmDmrRadioIdIndex === '' || mmdvmDmrRadioIdIndex === 'none'
          ? undefined
          : parseInt(mmdvmDmrRadioIdIndex, 10);
      const validDmrIndex =
        firstDmrRadioIdIndex !== undefined &&
        !isNaN(firstDmrRadioIdIndex) &&
        radioIds.some((r) => r.index === firstDmrRadioIdIndex)
          ? firstDmrRadioIdIndex
          : undefined;

      const result = generateMMDVMChannels({
        frequencyMhz: freq,
        entries: validEntries,
        firstChannelNumber: nextChannelNumber,
        firstContactId,
        dmrRadioIdIndex: validDmrIndex,
        zoneName: mmdvmZoneName.trim() || undefined,
      });

      setContacts([...contacts, ...result.contacts]);
      setChannels([...channels, ...result.channels]);
      setZones([...zones, result.zone]);

      setGenerationResult({
        channels: result.channels.length,
        zones: 1,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add MMDVM channels');
    } finally {
      setIsAddingMmdvm(false);
    }
  };

  const handleChirpCSVExport = () => {
    try {
      // Filter out digital channels - Chirp doesn't support them
      const analogChannels = channels.filter(ch => 
        ch.mode === 'Analog' || ch.mode === 'Fixed Analog'
      );
      
      if (analogChannels.length === 0) {
        setError('No analog channels to export. CHIRP only supports analog channels.');
        return;
      }
      
      const digitalCount = channels.length - analogChannels.length;
      const csvContent = exportChannelsToChirpCSV(analogChannels);
      downloadCSV(csvContent, 'chirp_channels.csv');
      
      if (digitalCount > 0) {
        setChirpImportResult({
          operation: 'export',
          channels: analogChannels.length,
          errors: [`Exported ${analogChannels.length} analog channel${analogChannels.length !== 1 ? 's' : ''}. ${digitalCount} digital channel${digitalCount !== 1 ? 's' : ''} excluded (CHIRP doesn't support digital).`],
        });
      } else {
        setChirpImportResult({
          operation: 'export',
          channels: analogChannels.length,
          errors: undefined,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export CHIRP CSV');
    }
  };

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mb-6">
        <SectionTitle as="h2" size="xl" bold className="text-2xl">Smart Import/Export</SectionTitle>
        <p className="text-cool-gray">
          Import channels from CHIRP CSV format or export your channels to CHIRP CSV format
        </p>
      </div>

      {/* Chirp CSV Import/Export Section */}
      <Card padding="tight" className="mb-4">
        <SectionTitle as="h3" size="lg" className="mb-4">Analog CHIRP CSV Import/Export</SectionTitle>
        <p className="text-sm text-cool-gray mb-4">
          Import or export analog channels in CHIRP CSV format for use with other radio programming software. Digital channels are not supported by CHIRP and will be excluded from exports.
        </p>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm text-cool-gray mb-2">Import from CHIRP CSV</label>
            <p className="text-xs text-cool-gray mb-2">
              Any digital channels in the CSV will be imported as analog.
            </p>
            <input
              type="file"
              ref={fileInputRef}
              accept=".csv"
              onChange={handleChirpCSVImport}
              disabled={isImportingChirp}
              className="hidden"
            />
            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={isImportingChirp}
              className="w-full bg-neon-cyan text-dark-charcoal hover:bg-neon-cyan-bright"
            >
              {isImportingChirp ? 'Importing...' : 'Import CHIRP CSV'}
            </Button>
          </div>
          <div>
            <label className="block text-sm text-cool-gray mb-2">Export to CHIRP CSV</label>
            <p className="text-xs text-cool-gray mb-2">
              Only analog channels will be exported. Digital channels are excluded.
            </p>
            <Button
              onClick={handleChirpCSVExport}
              disabled={channels.filter(ch => ch.mode === 'Analog' || ch.mode === 'Fixed Analog').length === 0}
              className="w-full bg-neon-magenta text-white hover:bg-neon-magenta-bright"
            >
              Export to CHIRP CSV ({channels.filter(ch => ch.mode === 'Analog' || ch.mode === 'Fixed Analog').length} analog)
            </Button>
          </div>
        </div>

        {chirpImportResult && (
          <div className={`rounded p-3 mb-4 ${
            chirpImportResult.errors && chirpImportResult.errors.length > 0
              ? 'bg-yellow-900 border border-yellow-500 text-yellow-200'
              : 'bg-deep-gray border border-neon-cyan text-neon-cyan'
          }`}>
            <div className="font-semibold mb-1">
              {chirpImportResult.operation === 'import' 
                ? (chirpImportResult.errors && chirpImportResult.errors.length > 0
                    ? 'Import completed with warnings'
                    : 'Import successful')
                : (chirpImportResult.errors && chirpImportResult.errors.length > 0
                    ? 'Export completed with warnings'
                    : 'Export successful')}
            </div>
            <div className="text-sm">
              {chirpImportResult.operation === 'import' 
                ? `Imported ${chirpImportResult.channels} channel${chirpImportResult.channels !== 1 ? 's' : ''}`
                : `Exported ${chirpImportResult.channels} channel${chirpImportResult.channels !== 1 ? 's' : ''}`}
            </div>
            {chirpImportResult.errors && chirpImportResult.errors.length > 0 && (
              <div className="text-sm mt-2">
                <div className="font-semibold">Warnings:</div>
                <ul className="list-disc list-inside mt-1">
                  {chirpImportResult.errors.slice(0, 5).map((err, idx) => (
                    <li key={idx}>{err}</li>
                  ))}
                  {chirpImportResult.errors.length > 5 && (
                    <li>... and {chirpImportResult.errors.length - 5} more</li>
                  )}
                </ul>
              </div>
            )}
          </div>
        )}
      </Card>

      <div className="mb-6">
        <SectionTitle as="h2" size="xl" bold className="text-2xl">Channel Wizard</SectionTitle>
        <p className="text-cool-gray">
          Find nearby repeaters and automatically generate channels and zones based on your location
        </p>
      </div>

      {/* Location-Based Search Section */}
      <Card padding="tight" className="mb-4">
        <SectionTitle as="h3" size="lg" className="mb-4">Location-Based Search</SectionTitle>
        <p className="text-sm text-cool-gray mb-4">
          {supportsDigital
            ? 'Search for nearby airports, TAFL entries, and DMR repeaters based on your location'
            : 'Search for nearby airports and TAFL entries based on your location'}
        </p>
        
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
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-cool-gray mb-2">City</label>
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Boston"
                  className="w-full bg-black border border-neon-cyan rounded px-3 py-2 text-white"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && city.trim() && !isSearchingAll) {
                      handleSearchAll();
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
                    if (e.key === 'Enter' && city.trim() && !isSearchingAll) {
                      handleSearchAll();
                    }
                  }}
                />
              </div>
            </div>
          </div>
        )}

        <div className="mb-4">
          <label className="block text-sm text-cool-gray mb-2">Search Radius (miles)</label>
          <input
            type="number"
            value={searchRadius}
            onChange={(e) => setSearchRadius(e.target.value)}
            min="1"
            max="200"
            className="w-full bg-black border border-neon-cyan rounded px-3 py-2 text-white"
          />
        </div>

        <div className="mb-4">
          <label className="block text-sm text-cool-gray mb-2">Search Types</label>
          <div className="space-y-2">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={searchAirports}
                onChange={(e) => setSearchAirports(e.target.checked)}
                className="mr-2"
              />
              <span className="text-cool-gray">Airports</span>
            </label>
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={searchTafl}
                onChange={(e) => setSearchTafl(e.target.checked)}
                className="mr-2"
              />
              <span className="text-cool-gray">TAFL (Transport Canada)</span>
            </label>
            {supportsDigital && (
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={searchDmrRepeaters}
                onChange={(e) => setSearchDmrRepeaters(e.target.checked)}
                className="mr-2"
              />
              <span className="text-cool-gray">DMR Repeaters</span>
            </label>
            )}
          </div>
        </div>

        <Button
          onClick={handleSearchAll}
          disabled={isSearchingAll || (supportsDigital ? (!searchAirports && !searchTafl && !searchDmrRepeaters) : (!searchAirports && !searchTafl))}
          className="bg-neon-cyan text-dark-charcoal hover:bg-neon-cyan-bright w-full"
        >
          {isSearchingAll 
            ? (locationType === 'current' 
                ? 'Getting location and searching...' 
                : 'Searching...')
            : (locationType === 'current'
                ? 'Use Current Location & Search'
                : locationType === 'coordinates'
                ? 'Search at Coordinates'
                : 'Search at Location')}
        </Button>

        {/* Progress indicators */}
        {(isSearchingAirports || isSearchingTafl || isSearchingRptrs) && (
          <div className="mt-4 space-y-2">
            {isSearchingAirports && (
              <div className="text-sm text-cool-gray">Searching airports...</div>
            )}
            {isSearchingTafl && taflLoadProgress && (
              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-sm text-cool-gray">Loading TAFL data...</span>
                  <span className="text-sm text-cool-gray">{taflLoadProgress.percent.toFixed(1)}%</span>
                </div>
                <div className="w-full bg-black rounded-full h-2 border border-neon-cyan">
                  <div
                    className="h-full bg-neon-cyan transition-all"
                    style={{ width: `${taflLoadProgress.percent}%` }}
                  />
                </div>
              </div>
            )}
            {isSearchingRptrs && rptrsLoadProgress && (
              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-sm text-cool-gray">Loading DMR repeater data...</span>
                  <span className="text-sm text-cool-gray">{rptrsLoadProgress.percent.toFixed(1)}%</span>
                </div>
                <div className="w-full bg-black rounded-full h-2 border border-neon-cyan">
                  <div
                    className="h-full bg-neon-cyan transition-all"
                    style={{ width: `${rptrsLoadProgress.percent}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Airport Results */}
      {airports.length > 0 && (
      <Card padding="tight" className="mb-4">
        <SectionTitle as="h3" size="lg" className="mb-4">Airports</SectionTitle>
          <>
            <div className="flex justify-between items-center mb-4">
              <SectionTitle as="h4" size="md">
                Found {airports.length} Airport{airports.length !== 1 ? 's' : ''}
              </SectionTitle>
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
                      : 'border-neon-cyan border-opacity-30 hover:border-neon-cyan border-opacity-50'
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
      </Card>
      )}

      {/* TAFL Results */}
      {taflEntries.length > 0 && (
      <Card padding="tight" className="mb-4">
        <SectionTitle as="h3" size="lg" className="mb-4">TAFL Entries</SectionTitle>
        
        <div className="mb-4">
          <label className="block text-sm text-cool-gray mb-2">Filter by Name/Code</label>
          <input
            type="text"
            value={taflSearchFilter}
            onChange={(e) => setTaflSearchFilter(e.target.value)}
            placeholder="Search entries..."
            className="w-full bg-black border border-neon-cyan rounded px-3 py-2 text-white"
          />
        </div>
          <>
            <div className="flex justify-between items-center mb-4">
              <SectionTitle as="h4" size="md">
                {filteredTaflEntries.length} of {taflEntries.length} TAFL Entr{filteredTaflEntries.length !== 1 ? 'ies' : 'y'}
                {taflSearchFilter.trim() && ` (filtered)`}
              </SectionTitle>
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
                        : 'border-neon-cyan border-opacity-30'
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
                              className={`border-t border-neon-cyan border-opacity-20 p-3 cursor-pointer transition-colors ${
                                isSelected
                                  ? 'bg-neon-cyan bg-opacity-5'
                                  : 'hover:bg-deep-gray'
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
      </Card>
      )}

      {/* Error Display */}
      {error && (
        <div className="bg-red-900 border border-red-500 rounded p-3 mb-4 text-red-200">
          {error}
        </div>
      )}

      {/* Success Message */}
      {generationResult && (
        <div className="bg-deep-gray border border-neon-cyan rounded p-3 mb-4 text-neon-cyan">
          Successfully generated {generationResult.channels} channels and {generationResult.zones} zones!
        </div>
      )}


      {/* DMR Repeater Results (digital radios only) */}
      {supportsDigital && rptrs.length > 0 && (
      <Card padding="tight" className="mb-4">
        <SectionTitle as="h3" size="lg" className="mb-4">DMR Repeaters</SectionTitle>
          <>
            <div className="mb-4">
              <input
                type="text"
                placeholder="Filter by callsign, city, or network..."
                value={rptrsSearchFilter}
                onChange={(e) => setRptrsSearchFilter(e.target.value)}
                className="w-full bg-black border border-neon-cyan rounded px-3 py-2 text-white"
              />
            </div>
            
            <div className="flex justify-between items-center mb-4">
              <SectionTitle as="h4" size="md">
                {rptrs.filter(r => {
                  if (!rptrsSearchFilter.trim()) return true;
                  const filter = rptrsSearchFilter.toLowerCase();
                  return r.callsign.toLowerCase().includes(filter) ||
                         r.city.toLowerCase().includes(filter) ||
                         r.state.toLowerCase().includes(filter) ||
                         r.ipsc_network.toLowerCase().includes(filter);
                }).length} of {rptrs.length} DMR Repeater{rptrs.length !== 1 ? 's' : ''}
                {rptrsSearchFilter.trim() && ` (filtered)`}
              </SectionTitle>
              <div className="flex gap-2">
                <button
                  onClick={handleSelectAllRptrs}
                  className="text-sm text-neon-cyan hover:text-neon-cyan-bright"
                >
                  Select All
                </button>
                <button
                  onClick={handleDeselectAllRptrs}
                  className="text-sm text-neon-cyan hover:text-neon-cyan-bright"
                >
                  Deselect All
                </button>
              </div>
            </div>

            <div className="space-y-2 max-h-96 overflow-y-auto mb-4">
              {rptrs
                .filter(r => {
                  if (!rptrsSearchFilter.trim()) return true;
                  const filter = rptrsSearchFilter.toLowerCase();
                  return r.callsign.toLowerCase().includes(filter) ||
                         r.city.toLowerCase().includes(filter) ||
                         r.state.toLowerCase().includes(filter) ||
                         r.ipsc_network.toLowerCase().includes(filter);
                })
                .map((rptr) => {
                  const originalIndex = rptrs.findIndex(r => r === rptr);
                  return (
                    <div
                      key={originalIndex}
                      className={`border rounded p-3 cursor-pointer transition-colors ${
                        selectedRptrs.has(originalIndex)
                          ? 'border-neon-cyan bg-neon-cyan bg-opacity-10'
                          : 'border-neon-cyan border-opacity-30 hover:border-neon-cyan border-opacity-50'
                      }`}
                      onClick={() => handleToggleRptr(originalIndex)}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <input
                              type="checkbox"
                              checked={selectedRptrs.has(originalIndex)}
                              onChange={() => handleToggleRptr(originalIndex)}
                              onClick={(e) => e.stopPropagation()}
                              className="mr-2"
                            />
                            <span className="font-semibold text-neon-cyan">{rptr.callsign}</span>
                            <span className="text-cool-gray text-sm">CC{rptr.color_code}</span>
                            <span className="text-cool-gray text-sm">{rptr.ts_linked}</span>
                          </div>
                          <div className="text-sm text-cool-gray">
                            <div>
                              {convertRptrFrequency(rptr.frequency).toFixed(5)} MHz
                              {rptr.offset && ` (Offset: ${rptr.offset} MHz)`}
                            </div>
                            <div>
                              {rptr.city}
                              {rptr.state && `, ${rptr.state}`}
                              {rptr.distance && ` (${rptr.distance.toFixed(1)} mi)`}
                            </div>
                            <div className="text-xs mt-1">
                              Network: {rptr.ipsc_network || 'Unknown'}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>

            {selectedRptrs.size > 0 && (
              <div className="space-y-3">
                <div className="flex flex-col gap-2">
                  <label className="text-sm text-cool-gray">Zone Grouping:</label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="rptrsZoneGrouping"
                      value="location"
                      checked={rptrsZoneGrouping === 'location'}
                      onChange={(e) => setRptrsZoneGrouping(e.target.value as 'location' | 'single')}
                    />
                    <span className="text-cool-gray">Group by location</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="rptrsZoneGrouping"
                      value="single"
                      checked={rptrsZoneGrouping === 'single'}
                      onChange={(e) => setRptrsZoneGrouping(e.target.value as 'location' | 'single')}
                    />
                    <span className="text-cool-gray">Single zone (all repeaters together)</span>
                  </label>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rptrsSeparateTimeslots}
                    onChange={(e) => setRptrsSeparateTimeslots(e.target.checked)}
                  />
                  <span className="text-cool-gray">Create separate channels for each timeslot (TS1, TS2)</span>
                </label>
                <Button
                  onClick={handleAddRptrsChannels}
                  disabled={isAddingRptrs}
                  className="bg-neon-magenta text-white hover:bg-neon-magenta-bright w-full"
                >
                  {isAddingRptrs
                    ? 'Adding DMR Repeater Channels...'
                    : `Add ${selectedRptrs.size} DMR Repeater Channel${selectedRptrs.size !== 1 ? 's' : ''}`}
                </Button>
              </div>
            )}
          </>
      </Card>
      )}

      {/* MMDVM Simplex Section (digital radios only) */}
      {supportsDigital && (
      <Card padding="tight" className="mb-4">
        <SectionTitle as="h3" size="lg" className="mb-2">MMDVM</SectionTitle>
        <p className="text-sm text-cool-gray mb-4">
          Add simplex MMDVM hotspot channels (one frequency, Slot 2, Color Code 1). You can create multiple channels on the same frequency with different talk groups—for example, one for local (TG 9) and one for a brandmeister talk group.
        </p>

        <div className="grid grid-cols-1 gap-4 mb-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-cool-gray mb-2">Zone name</label>
              <input
                type="text"
                value={mmdvmZoneName}
                onChange={(e) => setMmdvmZoneName(e.target.value)}
                placeholder="Default: MMDVM"
                maxLength={16}
                className="w-full bg-black border border-neon-cyan rounded px-3 py-2 text-white"
              />
            </div>
            <div>
              <label className="block text-sm text-cool-gray mb-2">Frequency (MHz)</label>
              <input
                type="number"
                value={mmdvmFrequency}
                onChange={(e) => setMmdvmFrequency(e.target.value)}
                min={MMDVM_FREQ_MIN_MHZ}
                max={MMDVM_FREQ_MAX_MHZ}
                step="0.001"
                placeholder="431.150"
                className="w-full bg-black border border-neon-cyan rounded px-3 py-2 text-white"
              />
              <p className="text-xs text-cool-gray mt-1">
                {MMDVM_FREQ_MIN_MHZ}–{MMDVM_FREQ_MAX_MHZ} MHz
              </p>
            </div>
            <div>
              <label className="block text-sm text-cool-gray mb-2">DMR Radio ID</label>
              <select
                value={mmdvmDmrRadioIdIndex}
                onChange={(e) => setMmdvmDmrRadioIdIndex(e.target.value)}
                className="w-full bg-black border border-neon-cyan rounded px-3 py-2 text-white"
              >
                <option value="">None</option>
                {radioIds.map((radioId) => (
                  <option key={radioId.index} value={String(radioId.index)}>
                    {radioId.name} (ID: {radioId.dmrId})
                  </option>
                ))}
              </select>
              <p className="text-xs text-cool-gray mt-1">
                For TX on all channels
              </p>
            </div>
          </div>

          <div>
            <label className="block text-sm text-cool-gray mb-2">Channels (same frequency, different talk groups)</label>
            <p className="text-xs text-cool-gray mb-2">
              Each row is one channel. Set the talk group name and ID (e.g. Local = 9, Brandmeister Canada = 3100).
            </p>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {mmdvmEntries.map((entry, index) => (
                <div
                  key={index}
                  className="grid grid-cols-12 gap-2 items-end p-2 rounded border border-neon-cyan border-opacity-30 bg-black bg-opacity-30"
                >
                  <div className="col-span-3">
                    <label className="block text-xs text-cool-gray mb-1">Channel name</label>
                    <input
                      type="text"
                      value={entry.channelName}
                      onChange={(e) => {
                        const next = [...mmdvmEntries];
                        next[index] = { ...next[index], channelName: e.target.value };
                        setMmdvmEntries(next);
                      }}
                      placeholder="Optional"
                      maxLength={16}
                      className="w-full bg-black border border-neon-cyan rounded px-2 py-1.5 text-white text-sm"
                    />
                  </div>
                  <div className="col-span-4">
                    <label className="block text-xs text-cool-gray mb-1">Talk group name</label>
                    <input
                      type="text"
                      value={entry.talkGroupName}
                      onChange={(e) => {
                        const next = [...mmdvmEntries];
                        next[index] = { ...next[index], talkGroupName: e.target.value };
                        setMmdvmEntries(next);
                      }}
                      placeholder="e.g. Local"
                      maxLength={16}
                      className="w-full bg-black border border-neon-cyan rounded px-2 py-1.5 text-white text-sm"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs text-cool-gray mb-1">TG ID</label>
                    <input
                      type="number"
                      value={entry.talkGroupId || ''}
                      onChange={(e) => {
                        const v = e.target.value === '' ? 0 : parseInt(e.target.value, 10);
                        const next = [...mmdvmEntries];
                        next[index] = { ...next[index], talkGroupId: isNaN(v) ? 0 : v };
                        setMmdvmEntries(next);
                      }}
                      min={0}
                      max={16776415}
                      placeholder="9"
                      className="w-full bg-black border border-neon-cyan rounded px-2 py-1.5 text-white text-sm"
                    />
                  </div>
                  <div className="col-span-3 flex items-end gap-1">
                    {mmdvmEntries.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => setMmdvmEntries(mmdvmEntries.filter((_, i) => i !== index))}
                        className="text-sm text-red-400 hover:text-red-300"
                      >
                        Remove
                      </button>
                    ) : null}
                    {index === mmdvmEntries.length - 1 ? (
                      <button
                        type="button"
                        onClick={() =>
                          setMmdvmEntries([
                            ...mmdvmEntries,
                            { channelName: '', talkGroupName: '', talkGroupId: 9 },
                          ])
                        }
                        className="text-sm text-neon-cyan hover:text-neon-cyan-bright"
                      >
                        + Add channel
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {radioIds.length === 0 && (
            <div className="rounded p-2 bg-yellow-900 border border-yellow-600 text-yellow-200 text-sm">
              No DMR Radio ID set. Add one in the Digital tab so your radio can transmit on these channels.
            </div>
          )}

          <p className="text-xs text-cool-gray">
            Settings: Digital, Slot 2, Color Code 1. Selected DMR Radio ID is used for TX on all channels.
          </p>
        </div>

        <Button
          onClick={handleAddMmdvmChannels}
          disabled={isAddingMmdvm}
          className="bg-neon-magenta text-white hover:bg-neon-magenta-bright w-full"
        >
          {isAddingMmdvm ? 'Adding MMDVM channels...' : 'Add MMDVM channels'}
        </Button>
      </Card>
      )}

      {/* Fixed Channels Section */}
      <Card padding="tight" className="mb-4">
        <SectionTitle as="h3" size="lg" className="mb-2">Fixed Channels</SectionTitle>
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
                    : 'border-neon-cyan border-opacity-30 hover:border-neon-cyan border-opacity-50'
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
                        <span className="font-semibold text-neon-cyan">{set.displayName || set.name}</span>
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
                  <div className="border-t border-neon-cyan border-opacity-20 p-3 bg-black bg-opacity-30">
                    <div className="text-sm text-cool-gray mb-2 font-semibold">Channels:</div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      {set.channels.map((channel, index) => (
                        <div
                          key={index}
                          className="bg-deep-gray rounded p-2 border border-neon-cyan border-opacity-20"
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
      </Card>

    </div>
  );
};
