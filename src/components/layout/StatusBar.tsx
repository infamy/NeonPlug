import React from 'react';
import { useRadioStore } from '../../store/radioStore';

export const StatusBar: React.FC = () => {
  const { isConnected, radioInfo } = useRadioStore();

  return (
    <div className="bg-deep-gray border-b border-neon-cyan px-6 py-2 flex items-center justify-between">
      <div className="flex items-center space-x-4">
        <div className="flex items-center space-x-2">
          <div
            className={`w-3 h-3 rounded-full ${
              isConnected ? 'bg-neon-cyan shadow-glow-cyan' : 'bg-cool-gray'
            }`}
          />
          <span className="text-sm text-cool-gray">
            {isConnected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
        {radioInfo && (
          <>
            <span className="text-cool-gray">|</span>
            <span className="text-sm text-white">
              {radioInfo.model} - {radioInfo.firmware}
            </span>
          </>
        )}
      </div>
      <div className="text-sm text-cool-gray">
        NEONPLUG v0.1.0
      </div>
    </div>
  );
};

