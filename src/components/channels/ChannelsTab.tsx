import React, { useState, useMemo, useCallback } from 'react';
import { useChannelsStore } from '../../store/channelsStore';
import { useRadioSettingsStore } from '../../store/radioSettingsStore';
import { ChannelsTable } from './ChannelsTable';
import { createDefaultChannel } from '../../utils/channelHelpers';
import type { Channel } from '../../models/Channel';

const isVFOChannel = (n: number) => n === 4001 || n === 4002;

export const ChannelsTab: React.FC = () => {
  const { channels, addChannel, deleteChannels } = useChannelsStore();
  const { settings: radioSettings } = useRadioSettingsStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [scrollToChannel, setScrollToChannel] = useState<number | null>(null);
  const [selectedChannelNumbers, setSelectedChannelNumbers] = useState<Set<number>>(new Set());

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
  const handleDeleteSelected = useCallback(() => {
    const toDelete = Array.from(selectedChannelNumbers).filter(n => !isVFOChannel(n));
    if (toDelete.length === 0) {
      setSelectedChannelNumbers(new Set());
      return;
    }
    if (!confirm(`Delete ${toDelete.length} selected channel${toDelete.length !== 1 ? 's' : ''}?`)) return;
    deleteChannels(toDelete);
    setSelectedChannelNumbers(new Set());
  }, [selectedChannelNumbers, deleteChannels]);

  const handleClearSelection = useCallback(() => setSelectedChannelNumbers(new Set()), []);

  // Create VFO channels with channel numbers 4001 and 4002
  const vfoChannels = useMemo(() => {
    const vfos: Channel[] = [];
    if (radioSettings?.vfoA) {
      vfos.push({ ...radioSettings.vfoA, number: 4001 }); // VFO A is channel 4001
    }
    if (radioSettings?.vfoB) {
      vfos.push({ ...radioSettings.vfoB, number: 4002 }); // VFO B is channel 4002
    }
    return vfos;
  }, [radioSettings?.vfoA, radioSettings?.vfoB]);

  const filteredChannels = useMemo(() => {
    const allChannels = [...vfoChannels, ...channels];
    
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
    <div className="h-full">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-2xl font-bold text-neon-cyan">Channels</h2>
        <div className="flex items-center gap-4">
          <div className="text-cool-gray">
            {filteredChannels.length - vfoChannels.length} channel{(filteredChannels.length - vfoChannels.length) !== 1 ? 's' : ''} {vfoChannels.length > 0 && `(${vfoChannels.length} VFO${vfoChannels.length !== 1 ? 's' : ''})`}
          </div>
          <button
            onClick={handleAddChannel}
            className="px-2 py-1 text-xs text-cool-gray hover:text-neon-cyan border border-neon-cyan border-opacity-20 hover:border-opacity-50 rounded transition-colors focus:outline-none"
            title="Add new channel"
          >
            + Add
          </button>
        </div>
      </div>
      <div className="mb-3 flex items-center gap-3">
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
        {selectedCount > 0 && (
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-cool-gray text-sm whitespace-nowrap">{selectedCount} selected</span>
            <button
              onClick={handleDeleteSelected}
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
        )}
      </div>
      <ChannelsTable
        channels={filteredChannels}
        scrollToChannel={scrollToChannel}
        onScrollComplete={handleScrollComplete}
        selectedChannelNumbers={selectedChannelNumbers}
        onSelectionChange={setSelectedChannelNumbers}
      />
    </div>
  );
};

