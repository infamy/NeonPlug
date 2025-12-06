import React from 'react';
import { useChannelsStore } from '../../store/channelsStore';
import { ChannelsTable } from './ChannelsTable';
import { createDefaultChannel } from '../../utils/channelHelpers';

export const ChannelsTab: React.FC = () => {
  const { channels, addChannel } = useChannelsStore();

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

  return (
    <div className="h-full">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-2xl font-bold text-neon-cyan">Channels</h2>
        <div className="flex items-center gap-4">
          <div className="text-cool-gray">
            {channels.length} channel{channels.length !== 1 ? 's' : ''}
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
      <ChannelsTable />
    </div>
  );
};

