import React, { useState } from 'react';
import { useLocationState } from '../../hooks/useLocationState';
import { findNearbyAirports, type AirportData } from '../../data/airportsData';
import { findNearbyTaflEntries, type TaflData } from '../../data/taflData';
import { findNearbyRptrs, type RptrData } from '../../data/rptrsData';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { SectionTitle } from '../ui/SectionTitle';
import { useRadioCapabilities } from '../../hooks/useRadioCapabilities';
import { ChirpSource } from './sources/ChirpSource';
import { AirportSource } from './sources/AirportSource';
import { TaflSource } from './sources/TaflSource';
import { RptrsSource } from './sources/RptrsSource';
import { MmdvmSource } from './sources/MmdvmSource';
import { FixedChannelsSource } from './sources/FixedChannelsSource';

export const SmartImportTab: React.FC = () => {
  const { caps } = useRadioCapabilities();
  const supportsDigital = caps?.analogOnly !== true;

  const {
    locationType, setLocationType,
    latitude, setLatitude,
    longitude, setLongitude,
    city, setCity,
    state, setState,
    searchRadius, setSearchRadius,
    resolveCoordinates,
  } = useLocationState();

  const [error, setError] = useState<string | null>(null);
  const [searchAirports, setSearchAirports] = useState(true);
  const [searchTafl, setSearchTafl] = useState(true);
  const [searchDmrRepeaters, setSearchDmrRepeaters] = useState(true);
  const [isSearchingAll, setIsSearchingAll] = useState(false);

  // Generation result
  const [generationResult, setGenerationResult] = useState<{ channels: number; zones: number; airband?: number } | null>(null);

  // Airport search results
  const [airports, setAirports] = useState<(AirportData & { distance?: number })[]>([]);
  const [isSearchingAirports, setIsSearchingAirports] = useState(false);

  // TAFL search results
  const [taflEntries, setTaflEntries] = useState<TaflData[]>([]);
  const [taflLoadProgress, setTaflLoadProgress] = useState<{ percent: number; loaded: number; total: number } | null>(null);
  const [isSearchingTafl, setIsSearchingTafl] = useState(false);

  // Rptrs search results
  const [rptrs, setRptrs] = useState<(RptrData & { distance?: number })[]>([]);
  const [rptrsLoadProgress, setRptrsLoadProgress] = useState<{ percent: number; loaded: number; total: number } | null>(null);
  const [isSearchingRptrs, setIsSearchingRptrs] = useState(false);

  // These are kept here for the search handler to use (not passed to children)
  const [airportRadius] = useState('50');
  const [taflRadius] = useState('10');
  const [rptrsRadius] = useState('50');

  const handleSetError = (msg: string) => {
    setError(msg || null);
  };

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
    }
    if (searchTafl) {
      setTaflEntries([]);
    }
    if (searchDmrRepeaters) {
      setRptrs([]);
    }

    try {
      const { lat, lon, radius } = await resolveCoordinates();

      // Search all selected types in parallel
      const searchPromises: Promise<void>[] = [];

      if (searchAirports) {
        searchPromises.push(
          (async () => {
            const airportRadiusValue = parseFloat(airportRadius) || radius;
            const nearbyAirports = await findNearbyAirports(lat, lon, airportRadiusValue);
            setAirports(nearbyAirports);
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

  return (
    <div className="h-full overflow-y-auto p-6">
      {/* 1. ChirpSource */}
      <ChirpSource onError={handleSetError} />

      {/* 2. Channel Wizard heading */}
      <div className="mb-6">
        <SectionTitle as="h2" size="xl" bold className="text-2xl">Channel Wizard</SectionTitle>
        <p className="text-cool-gray">
          Find nearby repeaters and automatically generate channels and zones based on your location
        </p>
      </div>

      {/* 3. Location controls card */}
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

      {/* 4. Error display */}
      {error && (
        <div className="bg-red-900 border border-red-500 rounded p-3 mb-4 text-red-200">
          {error}
        </div>
      )}

      {/* 5. AirportSource */}
      <AirportSource
        airports={airports}
        isSearching={isSearchingAirports}
        onError={handleSetError}
        onGenerationResult={setGenerationResult}
      />

      {/* 6. TaflSource */}
      <TaflSource
        entries={taflEntries}
        isSearching={isSearchingTafl}
        loadProgress={taflLoadProgress}
        onError={handleSetError}
        onGenerationResult={setGenerationResult}
      />

      {/* 7. RptrsSource (only if supportsDigital) */}
      <RptrsSource
        rptrs={rptrs}
        isSearching={isSearchingRptrs}
        loadProgress={rptrsLoadProgress}
        supportsDigital={supportsDigital}
        onError={handleSetError}
        onGenerationResult={setGenerationResult}
      />

      {/* 8. Generation result success banner */}
      {generationResult && (
        <div className="bg-deep-gray border border-neon-cyan rounded p-3 mb-4 text-neon-cyan">
          Successfully generated {generationResult.channels} channels and {generationResult.zones} zones!
          {generationResult.airband ? (
            <>
              {' '}
              <span className="text-neon-cyan">
                {generationResult.airband} AM airband{' '}
                {generationResult.airband === 1 ? 'frequency' : 'frequencies'} went to the
                AM Airband list — this radio keeps them in their own table, not with your
                channels.
              </span>
            </>
          ) : null}
        </div>
      )}

      {/* 9. MmdvmSource (only if supportsDigital) */}
      {supportsDigital && (
        <MmdvmSource
          onError={handleSetError}
          onGenerationResult={setGenerationResult}
        />
      )}

      {/* 10. FixedChannelsSource */}
      <FixedChannelsSource
        onError={handleSetError}
        onGenerationResult={setGenerationResult}
      />
    </div>
  );
};
