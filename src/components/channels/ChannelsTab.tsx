import React, { useState, useMemo, useCallback, useRef } from 'react';
import { formatPlural } from '../../utils/formatPlural';
import { useChannelsStore } from '../../store/channelsStore';
import { useRadioSettingsStore } from '../../store/radioSettingsStore';
import { useRadioCapabilities } from '../../hooks/useRadioCapabilities';
import { ChannelsTable } from './ChannelsTable';
import { createDefaultChannel } from '../../utils/channelHelpers';
import { ConfirmModal } from '../ui/ConfirmModal';
import { CsvExportImportButtons } from '../ui/CsvExportImportButtons';
import { useAlert } from '../../hooks/useAlert';
import { exportChannelsToCSV, importChannelsFromCSV, downloadCSV } from '../../services/csv';
import type { Channel } from '../../models/Channel';

const isVFOChannel = (n: number) => n === 4001 || n === 4002;

export const ChannelsTab: React.FC = () => {
  const { channels, addChannel, deleteChannels, setChannels } = useChannelsStore();
  const { settings: radioSettings } = useRadioSettingsStore();
  const { caps } = useRadioCapabilities();
  const supportsVfoChannels = caps?.supportsVfoChannels === true;
  const [searchQuery, setSearchQuery] = useState('');
  const [scrollToChannel, setScrollToChannel] = useState<number | null>(null);
  const [selectedChannelNumbers, setSelectedChannelNumbers] = useState<Set<number>>(new Set());
  const { alertOpen, alertMessage, alertTitle, showAlert, closeAlert } = useAlert('Full CSV Export/Import');
  const [pendingChannelsImport, setPendingChannelsImport] = useState<Channel[] | null>(null);

  const handleAddChannel = () => {
    // Find the next available channel number
    const existingNumbers = new Set(channels.map(ch => ch.number));
    let nextNumber = 1;
    while (existingNumbers.has(nextNumber)) {
      nextNumber++;
    }
    
    // Create a new channel with defaults
    const newChannel = createDefaultChannel({
      number: nextNumber,
      name: `Channel ${nextNumber}`,
    });
    
    addChannel(newChannel);
    
    // Scroll to the new channel after adding
    setScrollToChannel(nextNumber);
  };

  const handleScrollComplete = useCallback(() => {
    setScrollToChannel(null);
  }, []);

  const selectedCount = selectedChannelNumbers.size;
  const [deleteSelectedOpen, setDeleteSelectedOpen] = useState(false);
  const [pendingDeleteCount, setPendingDeleteCount] = useState(0);
  const pendingDeleteNumbers = useRef<number[]>([]);
  const handleDeleteSelectedClick = useCallback(() => {
    const toDelete = Array.from(selectedChannelNumbers).filter(n => !isVFOChannel(n));
    if (toDelete.length === 0) {
      setSelectedChannelNumbers(new Set());
      return;
    }
    pendingDeleteNumbers.current = toDelete;
    setPendingDeleteCount(toDelete.length);
    setDeleteSelectedOpen(true);
  }, [selectedChannelNumbers]);
  const handleDeleteSelectedConfirm = useCallback(() => {
    const toDelete = pendingDeleteNumbers.current;
    if (toDelete.length > 0) {
      deleteChannels(toDelete);
      setSelectedChannelNumbers(new Set());
    }
    setDeleteSelectedOpen(false);
  }, [deleteChannels]);

  const handleClearSelection = useCallback(() => setSelectedChannelNumbers(new Set()), []);

  // "Talkaround Engaged" (unknown1A_3) reflects live radio state and isn't shown by OEM CPS
  // either — it can silently carry over from a channel's previous contents. This gives a
  // one-click way to confirm it's off everywhere before writing.
  const talkaroundEngagedCount = useMemo(
    () => channels.filter(ch => ch.unknown1A_3).length,
    [channels]
  );
  const [clearTalkaroundOpen, setClearTalkaroundOpen] = useState(false);
  const handleClearTalkaroundConfirm = useCallback(() => {
    setChannels(channels.map(ch => ch.unknown1A_3 ? { ...ch, unknown1A_3: false } : ch));
    setClearTalkaroundOpen(false);
  }, [channels, setChannels]);

  // Full-fidelity CSV export/import (all channel modes and fields) — distinct from the
  // Smart Import wizard's CHIRP export (analog-only) and Add-style merges: this round-trips
  // the whole channel list and importing REPLACES it, matching an OEM-CPS-style backup/edit
  // workflow rather than an additive import.
  const handleExportChannelsCsv = useCallback(() => {
    downloadCSV(exportChannelsToCSV(channels), 'channels.csv');
  }, [channels]);

  const handleImportChannelsFile = useCallback((file: File) => {
    file.text().then(content => {
      const result = importChannelsFromCSV(content);
      if (!result.success || !result.channels) {
        showAlert(result.errors?.join('\n') || 'Failed to import channels CSV', 'Import failed');
        return;
      }
      setPendingChannelsImport(result.channels);
    }).catch(err => {
      showAlert(err instanceof Error ? err.message : 'Failed to read CSV file', 'Import failed');
    });
  }, [showAlert]);

  const handleImportChannelsConfirm = useCallback(() => {
    if (pendingChannelsImport) {
      setChannels(pendingChannelsImport);
    }
    setPendingChannelsImport(null);
  }, [pendingChannelsImport, setChannels]);

  // VFO A/B as channels 4001/4002 — DM-32 only; UV5R-Mini and other radios do not have these in the channel list
  const vfoChannels = useMemo(() => {
    if (!supportsVfoChannels) return [];
    const vfos: Channel[] = [];
    if (radioSettings?.vfoA) {
      vfos.push({ ...radioSettings.vfoA, number: 4001 }); // VFO A is channel 4001
    }
    if (radioSettings?.vfoB) {
      vfos.push({ ...radioSettings.vfoB, number: 4002 }); // VFO B is channel 4002
    }
    return vfos;
  }, [supportsVfoChannels, radioSettings?.vfoA, radioSettings?.vfoB]);

  const filteredChannels = useMemo(() => {
    // Exclude empty channels (rxFrequency 0 = unprogrammed slot)
    const nonEmptyChannels = channels.filter(ch => ch.rxFrequency > 0);
    const allChannels = [...vfoChannels, ...nonEmptyChannels];

    if (!searchQuery.trim()) {
      return allChannels;
    }

    const query = searchQuery.toLowerCase().trim();
    return allChannels.filter(channel => {
      // Search in name
      if (channel.name.toLowerCase().includes(query)) return true;
      
      // Search in frequencies
      const rxFreq = channel.rxFrequency.toFixed(4);
      const txFreq = channel.txFrequency.toFixed(4);
      if (rxFreq.includes(query) || txFreq.includes(query)) return true;
      
      // Search in mode
      if (channel.mode.toLowerCase().includes(query)) return true;
      
      // Search in channel number
      if (channel.number.toString().includes(query)) return true;
      
      // Search in bandwidth
      if (channel.bandwidth.toLowerCase().includes(query)) return true;
      
      // Search in power
      if (channel.power.toLowerCase().includes(query)) return true;
      
      // Search in CTCSS/DCS
      if (channel.rxCtcssDcs.type.toLowerCase().includes(query)) return true;
      if (channel.txCtcssDcs.type.toLowerCase().includes(query)) return true;
      if (channel.rxCtcssDcs.value?.toString().includes(query)) return true;
      if (channel.txCtcssDcs.value?.toString().includes(query)) return true;
      
      return false;
    });
  }, [channels, vfoChannels, searchQuery]);

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="mb-4 flex items-center justify-between shrink-0">
        <h2 className="text-2xl font-bold text-neon-cyan">Channels</h2>
        <div className="flex items-center gap-4">
          <div className="text-cool-gray">
            {filteredChannels.length - vfoChannels.length} {formatPlural(filteredChannels.length - vfoChannels.length, 'channel')} {vfoChannels.length > 0 && `(${vfoChannels.length} ${formatPlural(vfoChannels.length, 'VFO')})`}
          </div>
          <button
            onClick={handleAddChannel}
            className="px-2 py-1 text-xs text-cool-gray hover:text-neon-cyan border border-neon-cyan border-opacity-20 hover:border-opacity-50 rounded transition-colors focus:outline-none"
            title="Add new channel"
          >
            + Add
          </button>
          {talkaroundEngagedCount > 0 && (
            <button
              onClick={() => setClearTalkaroundOpen(true)}
              className="px-2 py-1 text-xs text-cool-gray hover:text-neon-cyan border border-neon-cyan border-opacity-20 hover:border-opacity-50 rounded transition-colors focus:outline-none"
              title="Clear the live talkaround-engaged state on every channel that has it set"
            >
              Clear Talkaround ({talkaroundEngagedCount})
            </button>
          )}
          <CsvExportImportButtons
            label="channels"
            onExport={handleExportChannelsCsv}
            onImportFile={handleImportChannelsFile}
            exportDisabled={channels.length === 0}
          />
        </div>
      </div>
      <div className="mb-3 flex items-center gap-3 shrink-0">
        <div className="relative flex-1 min-w-0">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search channels by name, frequency, mode, number..."
            className="w-full bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-4 py-2 pl-10 text-white text-sm focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan"
          />
          <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-cool-gray text-sm">
            🔍
          </span>
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-cool-gray hover:text-white text-sm"
              title="Clear search"
            >
              ×
            </button>
          )}
        </div>
        {selectedCount > 0 ? (
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-cool-gray text-sm whitespace-nowrap">{selectedCount} selected</span>
            <button
              onClick={handleDeleteSelectedClick}
              className="px-2 py-1.5 text-xs text-red-400 hover:text-red-300 border border-red-600 border-opacity-30 hover:border-opacity-60 rounded transition-colors whitespace-nowrap"
              title="Delete selected channels"
            >
              Delete ({selectedCount})
            </button>
            <button
              onClick={handleClearSelection}
              className="px-2 py-1.5 text-xs text-cool-gray hover:text-neon-cyan border border-neon-cyan border-opacity-20 hover:border-opacity-50 rounded transition-colors whitespace-nowrap"
              title="Clear selection"
            >
              Clear
            </button>
          </div>
        ) : (
          <p className="text-cool-gray text-xs shrink-0 whitespace-nowrap" title="Channel selection shortcuts">
            Click row = one · Shift+click = range · Alt+click = add/remove
          </p>
        )}
      </div>
      <div className="flex-1 min-h-0">
        <ChannelsTable
          channels={filteredChannels}
          scrollToChannel={scrollToChannel}
          onScrollComplete={handleScrollComplete}
          selectedChannelNumbers={selectedChannelNumbers}
          onSelectionChange={setSelectedChannelNumbers}
        />
      </div>
      <ConfirmModal
        isOpen={deleteSelectedOpen}
        onClose={() => setDeleteSelectedOpen(false)}
        onConfirm={handleDeleteSelectedConfirm}
        title="Delete channels"
        message={`Delete ${pendingDeleteCount} selected ${formatPlural(pendingDeleteCount, 'channel')}?`}
        confirmLabel="Delete"
        variant="danger"
      />
      <ConfirmModal
        isOpen={clearTalkaroundOpen}
        onClose={() => setClearTalkaroundOpen(false)}
        onConfirm={handleClearTalkaroundConfirm}
        title="Clear Talkaround"
        message={`Turn off the live talkaround-engaged state on ${talkaroundEngagedCount} ${formatPlural(talkaroundEngagedCount, 'channel')}?`}
        confirmLabel="Clear"
        variant="default"
      />
      <ConfirmModal
        isOpen={pendingChannelsImport !== null}
        onClose={() => setPendingChannelsImport(null)}
        onConfirm={handleImportChannelsConfirm}
        title="Import Channels CSV"
        message={`Replace all ${channels.length} existing ${formatPlural(channels.length, 'channel')} with ${pendingChannelsImport?.length ?? 0} imported from CSV? This cannot be undone.`}
        confirmLabel="Replace"
        variant="danger"
      />
      <ConfirmModal
        isOpen={alertOpen}
        onClose={closeAlert}
        title={alertTitle}
        message={alertMessage}
        confirmLabel="OK"
        variant="alert"
      />
    </div>
  );
};

