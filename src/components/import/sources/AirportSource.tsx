import React, { useState } from 'react';
import { useImportStores } from '../../../hooks/useImportStores';
import { getNextChannelNumber, selectionCardClass } from '../../../utils/importHelpers';
import { generateAirportChannels } from '../../../services/airportChannels';
import { getAirportFrequenciesWithTypes, type AirportData } from '../../../data/airportsData';
import { SelectAllButtons } from '../SelectAllButtons';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { SectionTitle } from '../../ui/SectionTitle';

interface AirportSourceProps {
  airports: (AirportData & { distance?: number })[];
  isSearching: boolean;
  onError: (msg: string) => void;
  onGenerationResult: (r: { channels: number; zones: number }) => void;
}

export const AirportSource: React.FC<AirportSourceProps> = ({
  airports,
  isSearching: _isSearching,
  onError,
  onGenerationResult,
}) => {
  const { channels, setChannels, zones, setZones } = useImportStores();

  const [selectedAirports, setSelectedAirports] = useState<Set<number>>(new Set());
  const [airportZoneGrouping, setAirportZoneGrouping] = useState<'individual' | 'single'>('individual');
  const [isAddingAirports, setIsAddingAirports] = useState(false);

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

      // Generate channels and zones for selected airports
      const result = generateAirportChannels(
        nextChannelNumber,
        selectedAirportList, // Pass selected airports
        airportZoneGrouping === 'single' // Group all in one zone if selected
      );

      if (result.channels.length === 0) {
        onError('No channels to add from selected airports');
        return;
      }

      // Add channels
      const updatedChannels = [...channels, ...result.channels];
      setChannels(updatedChannels);

      // Add zones (one per airport)
      const updatedZones = [...zones, ...result.zones];
      setZones(updatedZones);

      onGenerationResult({
        channels: result.channels.length,
        zones: result.zones.length,
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
              Found {airports.length} Airport{airports.length !== 1 ? 's' : ''}
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
  );
};
