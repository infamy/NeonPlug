import React from 'react';
import { useScanListsStore } from '../../store/scanListsStore';

export const ScanListsTab: React.FC = () => {
  const { scanLists } = useScanListsStore();

  return (
    <div className="h-full p-4">
      <h2 className="text-3xl font-bold text-neon-cyan mb-6">Scan Lists</h2>
      
      <div className="bg-deep-gray rounded-lg border border-neon-cyan p-6 shadow-glow-cyan-sm">
        {scanLists.length === 0 ? (
          <p className="text-cool-gray text-center py-8">
            No scan lists loaded. Read from radio to view scan lists.
          </p>
        ) : (
          <div className="space-y-4">
            {scanLists.map((scanList, index) => (
              <div
                key={`${scanList.name}-${index}`}
                className="bg-black bg-opacity-50 rounded border border-neon-cyan border-opacity-30 p-4"
              >
                <div className="flex justify-between items-start mb-2">
                  <h3 className="text-white font-semibold text-lg">{scanList.name}</h3>
                  <span className="text-cool-gray text-sm">
                    {scanList.channels.length} channel{scanList.channels.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <div className="text-cool-gray text-sm mb-2">
                  CTC Scan Mode: {scanList.ctcScanMode}
                </div>
                {scanList.channels.length > 0 && (
                  <div className="text-cool-gray text-sm">
                    Channels: {scanList.channels.join(', ')}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

