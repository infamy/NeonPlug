import React, { useState } from 'react';
import { formatPlural } from '../../../utils/formatPlural';
import { useImportStores } from '../../../hooks/useImportStores';
import { getNextChannelNumber, selectionCardClass } from '../../../utils/importHelpers';
import {
  generateAirportChannels,
  splitAirbandChannels,
  COMMON_AIRCRAFT_FREQUENCIES,
} from '../../../services/airportChannels';
import { useRadioCapabilities } from '../../../hooks/useRadioCapabilities';
import { useRadioStore } from '../../../store/radioStore';
import { D890_AM_ZONES } from '../../../radios/d890uv/amZones';
import { getAirportFrequenciesWithTypes, type AirportData } from '../../../data/airportsData';
import { SelectAllButtons } from '../SelectAllButtons';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { SectionTitle } from '../../ui/SectionTitle';

interface AirportSourceProps {
  airports: (AirportData & { distance?: number })[];
  isSearching: boolean;
  onError: (msg: string) => void;
  onGenerationResult: (r: { channels: number; zones: number; airband?: number; amZones?: number; amZonesSkipped?: number }) => void;
}

export const AirportSource: React.FC<AirportSourceProps> = ({
  airports,
  isSearching: _isSearching,
  onError,
  onGenerationResult,
}) => {
  const { channels, setChannels, zones, setZones } = useImportStores();
  const { caps } = useRadioCapabilities();
  const { d890Broadcast, setD890Broadcast, d890AmZones, setD890AmZones } = useRadioStore();

  const [selectedAirports, setSelectedAirports] = useState<Set<number>>(new Set());
  const [airportZoneGrouping, setAirportZoneGrouping] = useState<'individual' | 'single'>('individual');
  const [includeCommonFrequencies, setIncludeCommonFrequencies] = useState(false);
  const [selectedCommonFreqs, setSelectedCommonFreqs] = useState<Set<number>>(
    new Set(COMMON_AIRCRAFT_FREQUENCIES.map((_, i) => i))
  );
  const [isAddingAirports, setIsAddingAirports] = useState(false);

  const handleToggleCommonFreq = (index: number) => {
    const newSelected = new Set(selectedCommonFreqs);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedCommonFreqs(newSelected);
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
      onError('Please select at least one airport');
      return;
    }

    setIsAddingAirports(true);
    onError('');

    try {
      // Get selected airports
      const selectedAirportList = Array.from(selectedAirports)
        .map(i => airports[i])
        .filter(Boolean);

      if (selectedAirportList.length === 0) {
        throw new Error('No airports selected');
      }

      const nextChannelNumber = getNextChannelNumber(channels);

      // Build the selected subset of common aircraft frequencies (if enabled)
      const commonFreqs = includeCommonFrequencies
        ? COMMON_AIRCRAFT_FREQUENCIES.filter((_, i) => selectedCommonFreqs.has(i))
        : [];

      // Generate channels and zones for selected airports
      const result = generateAirportChannels(
        nextChannelNumber,
        selectedAirportList, // Pass selected airports
        airportZoneGrouping === 'single', // Group all in one zone if selected
        commonFreqs // Common aircraft frequencies to also add
      );

      if (result.channels.length === 0) {
        onError('No channels to add from selected airports');
        return;
      }

      // On radios that keep AM airband in its own table, airband frequencies
      // must NOT enter the main channel list — that record cannot express an AM
      // receive-only channel and writing one there corrupts the codeplug. Every
      // other radio keeps its airband in the ordinary list, unchanged.
      let amZonesCreated = 0;
      let amZonesSkipped = 0;
      const routed = caps?.separateAirbandTable
        ? splitAirbandChannels(result.channels, result.zones)
        : {
            channels: result.channels,
            zones: result.zones,
            airband: [] as typeof result.channels,
            airbandZones: [] as { name: string; channelNumbers: number[] }[],
          };

      if (routed.airband.length > 0) {
        const existing = d890Broadcast ?? { am: [], fm: [], fmVfo: null };
        // Airband entries are indexed within their own table, not by channel
        // number, so they are renumbered onto the end of it. Keep the mapping —
        // the AM zones below reference these by their NEW index.
        const amIndexOf = new Map<number, number>();
        const appended = routed.airband.map((c, i) => {
          const index = existing.am.length + i;
          amIndexOf.set(c.number, index);
          return { index, name: c.name, frequency: c.rxFrequency };
        });
        setD890Broadcast({ ...existing, am: [...existing.am, ...appended] });

        // Carry the wizard's grouping across into AM zones. Without this the
        // airband channels arrive loose, on a radio that has 16 zones for
        // exactly this purpose.
        if (routed.airbandZones.length > 0) {
          const current = d890AmZones ?? [];
          const used = new Set(current.map((z) => z.index));
          const created: typeof current = [];
          for (const group of routed.airbandZones) {
            let index = 0;
            while (used.has(index)) index += 1;
            // 16 slots is the radio's limit; the rest keep their channels but
            // lose the grouping, which is reported rather than hidden.
            if (index >= D890_AM_ZONES.SLOTS) break;
            used.add(index);
            created.push({
              index,
              name: group.name.slice(0, 16),
              members: group.channelNumbers
                .map((n) => amIndexOf.get(n))
                .filter((i): i is number => i !== undefined),
              currentChannel: 0,
            });
          }
          if (created.length > 0) {
            setD890AmZones([...current, ...created].sort((a, b) => a.index - b.index));
          }
          amZonesCreated = created.length;
          amZonesSkipped = routed.airbandZones.length - created.length;
        }
      }

      // Add channels
      const updatedChannels = [...channels, ...routed.channels];
      setChannels(updatedChannels);

      // Add zones (one per airport)
      const updatedZones = [...zones, ...routed.zones];
      setZones(updatedZones);

      onGenerationResult({
        channels: routed.channels.length,
        zones: routed.zones.length,
        airband: routed.airband.length,
        amZones: amZonesCreated,
        amZonesSkipped,
      });

      // Clear selection
      setSelectedAirports(new Set());
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to add airport channels');
    } finally {
      setIsAddingAirports(false);
    }
  };

  if (airports.length === 0) return null;

  return (
    <Card padding="tight" className="mb-4">
      <SectionTitle as="h3" size="lg" className="mb-4">Airports</SectionTitle>
        <>
          <div className="flex justify-between items-center mb-4">
            <SectionTitle as="h4" size="md">
              Found {airports.length} {formatPlural(airports.length, 'Airport')}
            </SectionTitle>
            <SelectAllButtons onSelectAll={handleSelectAllAirports} onDeselectAll={handleDeselectAllAirports} />
          </div>

          <div className="space-y-2 max-h-96 overflow-y-auto mb-4">
            {airports.map((airport, index) => (
              <div
                key={index}
                className={selectionCardClass(selectedAirports.has(index))}
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
                <label className="flex items-center mt-3">
                  <input
                    type="checkbox"
                    checked={includeCommonFrequencies}
                    onChange={(e) => setIncludeCommonFrequencies(e.target.checked)}
                    className="mr-2"
                  />
                  <span className="text-cool-gray">Add common aircraft frequencies (Guard, UNICOM, air-to-air, etc.)</span>
                </label>
                {includeCommonFrequencies && (
                  <div className="mt-2 ml-6">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs text-cool-gray opacity-75">
                        {airportZoneGrouping === 'single'
                          ? 'Added to the Airports zone'
                          : 'Added as a separate "Aircraft" zone'}
                      </span>
                      <SelectAllButtons
                        onSelectAll={() =>
                          setSelectedCommonFreqs(new Set(COMMON_AIRCRAFT_FREQUENCIES.map((_, i) => i)))
                        }
                        onDeselectAll={() => setSelectedCommonFreqs(new Set())}
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 max-h-56 overflow-y-auto">
                      {COMMON_AIRCRAFT_FREQUENCIES.map((freq, index) => (
                        <label key={index} className="flex items-center gap-2 text-xs">
                          <input
                            type="checkbox"
                            checked={selectedCommonFreqs.has(index)}
                            onChange={() => handleToggleCommonFreq(index)}
                          />
                          <span className="text-neon-cyan min-w-[55px]">{freq.freq.toFixed(3)}</span>
                          <span className="text-cool-gray">{freq.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <Button
                onClick={handleAddAirportChannels}
                disabled={isAddingAirports}
                className="bg-neon-magenta text-white hover:bg-neon-magenta-bright w-full"
              >
                {isAddingAirports
                  ? 'Adding Airport Channels...'
                  : `Add ${selectedAirports.size} ${formatPlural(selectedAirports.size, 'Airport Channel')}`}
              </Button>
            </>
          )}
        </>
    </Card>
  );
};
