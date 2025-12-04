import React from 'react';
import { useScanListsStore } from '../../store/scanListsStore';
import { ScanListsList } from './ScanListsList';

export const ScanListsTab: React.FC = () => {
  const { scanLists } = useScanListsStore();

  return (
    <div className="h-full">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-2xl font-bold text-neon-cyan">Scan Lists</h2>
        <div className="text-cool-gray">
          {scanLists.length} scan list{scanLists.length !== 1 ? 's' : ''}
        </div>
      </div>
      <ScanListsList />
    </div>
  );
};

