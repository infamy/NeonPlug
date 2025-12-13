import React, { useState } from 'react';
import { useRadioStore } from '../../store/radioStore';
import { Modal } from '../ui/Modal';

export const StatusBar: React.FC = () => {
  const { radioInfo } = useRadioStore();
  const [showFirmwareWarning, setShowFirmwareWarning] = useState(false);

  const EXPECTED_FIRMWARE = 'DM32.01.L01.048';
  const needsFirmwareUpdate = radioInfo?.firmware && radioInfo.firmware !== EXPECTED_FIRMWARE;

  return (
    <>
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
                {needsFirmwareUpdate && (
                  <button
                    onClick={() => setShowFirmwareWarning(true)}
                    className="text-yellow-400 hover:text-yellow-300 transition-colors cursor-pointer"
                    title="Firmware update recommended"
                  >
                    ⚠️
                  </button>
                )}
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
    <Modal
      isOpen={showFirmwareWarning}
      onClose={() => setShowFirmwareWarning(false)}
      title="Firmware Update Recommended"
    >
      <div className="space-y-4">
        <div className="flex items-start space-x-3">
          <span className="text-yellow-400 text-2xl">⚠️</span>
          <div className="flex-1">
            <p className="text-white mb-2">
              Your radio firmware version is <span className="font-mono text-neon-cyan">{radioInfo?.firmware}</span>, 
              but the recommended version is <span className="font-mono text-neon-cyan">{EXPECTED_FIRMWARE}</span>.
            </p>
            <p className="text-cool-gray">
              We recommend updating your firmware to ensure compatibility with all features and bug fixes. 
              Please check the official Baofeng website or your radio's documentation for firmware update instructions.
            </p>
          </div>
        </div>
      </div>
    </Modal>
    </>
  );
};

