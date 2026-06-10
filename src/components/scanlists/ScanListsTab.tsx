import React from 'react';
import { useScanListsStore } from '../../store/scanListsStore';
import { formatPlural } from '../../utils/formatPlural';
import { ScanListsList } from './ScanListsList';

export const ScanListsTab: React.FC = () => {
  const { scanLists } = useScanListsStore();

  return (
    <div className="h-full">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-2xl font-bold text-neon-cyan">Scan Lists</h2>
        <div className="text-cool-gray">
          {scanLists.length} {formatPlural(scanLists.length, 'scan list')}
        </div>
      </div>
      <ScanListsList />
    </div>
  );
};

