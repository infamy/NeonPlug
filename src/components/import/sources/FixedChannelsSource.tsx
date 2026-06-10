import React, { useState } from 'react';
import { formatPlural } from '../../../utils/formatPlural';
import { useImportStores } from '../../../hooks/useImportStores';
import { getNextChannelNumber } from '../../../utils/importHelpers';
import { getAvailableFixedChannelSets, getChannelsForSet } from '../../../services/fixedChannels';
import { mergeOverlappingChannels, getChannelFullKey } from '../../../services/channelMerger';
import { generateZoneId } from '../../../utils/zoneHelpers';
import type { Channel } from '../../../models';
import type { Zone } from '../../../models';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { SectionTitle } from '../../ui/SectionTitle';

interface FixedChannelsSourceProps {
  onError: (msg: string) => void;
  onGenerationResult: (r: { channels: number; zones: number }) => void;
}

export const FixedChannelsSource: React.FC<FixedChannelsSourceProps> = ({
  onError,
  onGenerationResult,
}) => {
  const { channels, setChannels, zones, setZones } = useImportStores();

  const [selectedFixedSets, setSelectedFixedSets] = useState<Set<string>>(new Set());
  const [isAddingFixed, setIsAddingFixed] = useState(false);
  const [expandedChannelSet, setExpandedChannelSet] = useState<string | null>(null);

  const fixedChannelSets = getAvailableFixedChannelSets();

  const handleAddFixedChannels = () => {
    if (selectedFixedSets.size === 0) {
      onError('Please select at least one channel set');
      return;
    }

    setIsAddingFixed(true);
    onError('');

    try {
      const nextChannelNumber = getNextChannelNumber(channels);

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

      onGenerationResult({
        channels: channelsToAdd.length,
        zones: newZones.length,
      });

      // Clear selection
      setSelectedFixedSets(new Set());
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to add fixed channels');
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

  return (
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
            : `Add ${selectedFixedSets.size} ${formatPlural(selectedFixedSets.size, 'Channel Set')}`}
        </Button>
      )}
    </Card>
  );
};
