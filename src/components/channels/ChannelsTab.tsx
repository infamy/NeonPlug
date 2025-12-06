import React, { useState, useMemo } from 'react';
import { useChannelsStore } from '../../store/channelsStore';
import { ChannelsTable } from './ChannelsTable';
import { createDefaultChannel } from '../../utils/channelHelpers';

export const ChannelsTab: React.FC = () => {
  const { channels, addChannel } = useChannelsStore();
  const [searchQuery, setSearchQuery] = useState('');

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
  };

  const filteredChannels = useMemo(() => {
    if (!searchQuery.trim()) {
      return channels;
    }

    const query = searchQuery.toLowerCase().trim();
    return channels.filter(channel => {
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
  }, [channels, searchQuery]);

  return (
    <div className="h-full">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-2xl font-bold text-neon-cyan">Channels</h2>
        <div className="flex items-center gap-4">
          <div className="text-cool-gray">
            {filteredChannels.length} of {channels.length} channel{channels.length !== 1 ? 's' : ''}
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
      <div className="mb-3">
        <div className="relative">
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
      </div>
      <ChannelsTable channels={filteredChannels} />
    </div>
  );
};

