import React, { useState } from 'react';
import { formatPlural } from '../../../utils/formatPlural';
import { useImportStores } from '../../../hooks/useImportStores';
import { getNextChannelNumber, selectionCardClass } from '../../../utils/importHelpers';
import { generateRptrsChannels } from '../../../services/rptrsChannels';
import { mergeChannelSetsWithExisting } from '../../../services/channelMerger';
import { convertRptrFrequency, type RptrData } from '../../../data/rptrsData';
import { SelectAllButtons } from '../SelectAllButtons';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { SectionTitle } from '../../ui/SectionTitle';

interface RptrsSourceProps {
  rptrs: (RptrData & { distance?: number })[];
  isSearching: boolean;
  loadProgress: { percent: number; loaded: number; total: number } | null;
  supportsDigital: boolean;
  onError: (msg: string) => void;
  onGenerationResult: (r: { channels: number; zones: number }) => void;
}

export const RptrsSource: React.FC<RptrsSourceProps> = ({
  rptrs,
  isSearching: _isSearching,
  loadProgress: _loadProgress,
  supportsDigital,
  onError,
  onGenerationResult,
}) => {
  const { channels, setChannels, zones, setZones } = useImportStores();

  const [rptrsSearchFilter, setRptrsSearchFilter] = useState('');
  const [selectedRptrs, setSelectedRptrs] = useState<Set<number>>(new Set());
  const [rptrsZoneGrouping, setRptrsZoneGrouping] = useState<'location' | 'single'>('location');
  const [rptrsSeparateTimeslots, setRptrsSeparateTimeslots] = useState(true);
  const [isAddingRptrs, setIsAddingRptrs] = useState(false);

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
      onError('Please select at least one DMR repeater');
      return;
    }

    setIsAddingRptrs(true);
    onError('');

    try {
      // Get selected repeaters
      const selectedRptrsList = Array.from(selectedRptrs)
        .map(i => rptrs[i])
        .filter(Boolean);

      if (selectedRptrsList.length === 0) {
        throw new Error('No DMR repeaters selected');
      }

      const nextChannelNumber = getNextChannelNumber(channels);

      // Generate channels and zones for selected repeaters
      const result = generateRptrsChannels(
        nextChannelNumber,
        selectedRptrsList,
        rptrsZoneGrouping === 'single',
        rptrsZoneGrouping === 'location',
        rptrsSeparateTimeslots
      );

      if (result.channels.length === 0) {
        onError('No channels to add from selected DMR repeaters');
        return;
      }

      // Merge overlaps within the new channels and dedupe against existing ones.
      // Existing channels are never renumbered — renumbering them would break
      // every zone and scan list that references them.
      const { channelsToAdd, channelMapping } = mergeChannelSetsWithExisting(
        channels,
        [result.channels],
        nextChannelNumber
      );
      setChannels([...channels, ...channelsToAdd]);

      // Remap the generated zones through the merge mapping: a new channel that
      // collapsed into another (or matched an existing channel) changed number.
      const remappedZones = result.zones
        .map(zone => ({
          ...zone,
          channels: [...new Set(
            zone.channels
              .map(num => channelMapping.get(num))
              .filter((num): num is number => num !== undefined)
          )].sort((a, b) => a - b),
        }))
        .filter(zone => zone.channels.length > 0);
      setZones([...zones, ...remappedZones]);

      onGenerationResult({
        channels: channelsToAdd.length,
        zones: remappedZones.length,
      });

      // Clear selection
      setSelectedRptrs(new Set());
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to add DMR repeater channels');
    } finally {
      setIsAddingRptrs(false);
    }
  };

  if (!supportsDigital || rptrs.length === 0) return null;

  return (
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
              }).length} of {rptrs.length} {formatPlural(rptrs.length, 'DMR Repeater')}
              {rptrsSearchFilter.trim() && ` (filtered)`}
            </SectionTitle>
            <SelectAllButtons onSelectAll={handleSelectAllRptrs} onDeselectAll={handleDeselectAllRptrs} />
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
                    className={selectionCardClass(selectedRptrs.has(originalIndex))}
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
                  : `Add ${selectedRptrs.size} ${formatPlural(selectedRptrs.size, 'DMR Repeater Channel')}`}
              </Button>
            </div>
          )}
        </>
    </Card>
  );
};
