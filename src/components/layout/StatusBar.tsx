import React from 'react';
import { useRadioStore } from '../../store/radioStore';

export const StatusBar: React.FC = () => {
  const { radioInfo } = useRadioStore();

  return (
    <div className="bg-deep-gray border-b border-neon-cyan px-6 py-2 flex items-center justify-between">
      <div className="flex items-center space-x-4">
        {radioInfo ? (
          <>
            <div className="flex items-center space-x-2">
              <span className="text-sm text-cool-gray">Radio:</span>
              <span className="text-sm text-white font-medium">{radioInfo.model}</span>
            </div>
            <span className="text-cool-gray">|</span>
            <div className="flex items-center space-x-2">
              <span className="text-sm text-cool-gray">Firmware:</span>
              <span className="text-sm text-white">{radioInfo.firmware}</span>
            </div>
            {radioInfo.buildDate && (
              <>
                <span className="text-cool-gray">|</span>
                <div className="flex items-center space-x-2">
                  <span className="text-sm text-cool-gray">Build:</span>
                  <span className="text-sm text-white">{radioInfo.buildDate}</span>
                </div>
              </>
            )}
            {radioInfo.dspVersion && (
              <>
                <span className="text-cool-gray">|</span>
                <div className="flex items-center space-x-2">
                  <span className="text-sm text-cool-gray">DSP:</span>
                  <span className="text-sm text-white">{radioInfo.dspVersion}</span>
                </div>
              </>
            )}
          </>
        ) : (
          <span className="text-sm text-cool-gray">No radio data loaded</span>
        )}
      </div>
      <div className="text-sm text-cool-gray">
        NEONPLUG
      </div>
    </div>
  );
};

