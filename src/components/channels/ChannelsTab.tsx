import React from 'react';
import { useChannelsStore } from '../../store/channelsStore';
import { ChannelsTable } from './ChannelsTable';

export const ChannelsTab: React.FC = () => {
  const { channels } = useChannelsStore();

  return (
    <div className="h-full">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-2xl font-bold text-neon-cyan">Channels</h2>
        <div className="text-cool-gray">
          {channels.length} channel{channels.length !== 1 ? 's' : ''}
        </div>
      </div>
      <ChannelsTable />
    </div>
  );
};

