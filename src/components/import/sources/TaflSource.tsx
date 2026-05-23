import React, { useState } from 'react';
import { useImportStores } from '../../../hooks/useImportStores';
import { getNextChannelNumber } from '../../../utils/importHelpers';
import { generateTaflChannels } from '../../../services/taflChannels';
import { groupTaflEntriesByName, type TaflData } from '../../../data/taflData';
import { SelectAllButtons } from '../SelectAllButtons';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { SectionTitle } from '../../ui/SectionTitle';

interface TaflSourceProps {
  entries: TaflData[];
  isSearching: boolean;
  loadProgress: { percent: number; loaded: number; total: number } | null;
  onError: (msg: string) => void;
  onGenerationResult: (r: { channels: number; zones: number }) => void;
}

export const TaflSource: React.FC<TaflSourceProps> = ({
  entries: taflEntries,
  isSearching: _isSearching,
  loadProgress: _loadProgress,
  onError,
  onGenerationResult,
}) => {
  const { channels, setChannels, zones, setZones } = useImportStores();

  const [taflSearchFilter, setTaflSearchFilter] = useState('');
  const [selectedTaflEntries, setSelectedTaflEntries] = useState<Set<number>>(new Set());
  const [expandedTaflGroups, setExpandedTaflGroups] = useState<Set<string>>(new Set());
  const [isAddingTafl, setIsAddingTafl] = useState(false);

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
      onError('Please select at least one TAFL entry');
      return;
    }

    setIsAddingTafl(true);
    onError('');

    try {
      // Get selected entries
      const selectedTaflList = Array.from(selectedTaflEntries)
        .map(i => taflEntries[i])
        .filter(Boolean);

      if (selectedTaflList.length === 0) {
        throw new Error('No TAFL entries selected');
      }

      const nextChannelNumber = getNextChannelNumber(channels);

      // Generate channels and zones for selected entries
      // TAFL always uses individual zones grouped by name
      const result = generateTaflChannels(
        nextChannelNumber,
        selectedTaflList, // Pass selected entries
        false, // Always use individual zones (not single zone)
        true // Always group by name
      );

      if (result.channels.length === 0) {
        onError('No channels to add from selected TAFL entries');
        return;
      }

      // Add channels
      const updatedChannels = [...channels, ...result.channels];
      setChannels(updatedChannels);

      // Add zones
      const updatedZones = [...zones, ...result.zones];
      setZones(updatedZones);

      onGenerationResult({
        channels: result.channels.length,
        zones: result.zones.length,
      });

      // Clear selection
      setSelectedTaflEntries(new Set());
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to add TAFL channels');
    } finally {
      setIsAddingTafl(false);
    }
  };

  if (taflEntries.length === 0) return null;

  return (
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
            <SelectAllButtons onSelectAll={handleSelectAllFilteredTafl} onDeselectAll={handleDeselectAllTafl} selectAllLabel="Select All Filtered" />
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
  );
};
