import React, { useEffect } from 'react';
import { useZonesStore } from '../../store/zonesStore';
import { useChannelsStore } from '../../store/channelsStore';
import { useLogStore } from '../../store/logStore';
import { ZonesList } from './ZonesList';

export const ZonesTab: React.FC = () => {
  const { zones, updateZone } = useZonesStore();
  const { channels } = useChannelsStore();
  const addLog = useLogStore((s) => s.addLog);

  // On zone page: remove any zone channel refs that point to non-existent channels, and log to debug
  useEffect(() => {
    if (channels.length === 0) return;
    const existingNumbers = new Set(channels.map((ch) => ch.number));
    for (const zone of zones) {
      const validChannels = zone.channels.filter((chNum) => existingNumbers.has(chNum));
      if (validChannels.length !== zone.channels.length) {
        const removed = zone.channels.filter((chNum) => !existingNumbers.has(chNum));
        updateZone(zone.id, { channels: validChannels });
        addLog({
          level: 'DEBUG',
          message: `Zone "${zone.name}": removed non-existent channel(s) ${removed.join(', ')}`,
          context: 'Zones',
        });
      }
    }
  }, [zones, channels, updateZone, addLog]);

  return (
    <div className="h-full flex flex-col">
      <div className="mb-4 flex items-center justify-between flex-shrink-0">
        <h2 className="text-2xl font-bold text-neon-cyan">Zones</h2>
        <div className="text-cool-gray">
          {zones.length} zone{zones.length !== 1 ? 's' : ''}
        </div>
      </div>
      <div className="flex-1 min-h-0">
        <ZonesList />
      </div>
    </div>
  );
};

