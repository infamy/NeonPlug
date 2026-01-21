import React from 'react';
import { useZonesStore } from '../../store/zonesStore';
import { ZonesList } from './ZonesList';

export const ZonesTab: React.FC = () => {
  const { zones } = useZonesStore();

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

