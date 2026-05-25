import React, { useState } from 'react';
import { useRadioStore } from '../../store/radioStore';
import { useRadioCapabilities } from '../../hooks/useRadioCapabilities';
import { Modal } from '../ui/Modal';

const USER_GESTURE_MESSAGE = 'Unable to read from radio, please read from a radio or load a codeplug to continue';

export const StatusBar: React.FC = () => {
  const { radioInfo, connectionError, setConnectionError } = useRadioStore();
  const { caps } = useRadioCapabilities();
  const [showFirmwareWarning, setShowFirmwareWarning] = useState(false);
  const showUserGestureInBar = connectionError?.includes('Please click the button directly') ?? false;
  const hasRealFirmware = !!(radioInfo?.firmware && radioInfo.firmware !== '-' && radioInfo.firmware.trim() !== '');
  const EXPECTED_FIRMWARE = 'DM32.01.L01.048';
  const isNewerFirmware = !!(hasRealFirmware && caps?.isFirmware049OrNewer?.(radioInfo!.firmware));
  const needsFirmwareUpdate = hasRealFirmware && radioInfo!.firmware !== EXPECTED_FIRMWARE && !isNewerFirmware;
  const deviceValue = (v: string | undefined) => (v && v.trim() && v !== '-' ? v : '-');

  return (
    <>
      <div className="bg-deep-gray border-b border-neon-cyan px-6 py-2 flex items-center justify-between gap-4">
        <div className="flex items-center space-x-4 min-w-0 flex-shrink-0">
          {radioInfo ? (
            <>
              <div className="flex items-center space-x-2">
                <span className="text-sm text-cool-gray">Radio:</span>
                <span className="text-sm text-white font-medium">{radioInfo.model}</span>
              </div>
              <span className="text-cool-gray">|</span>
              <div className="flex items-center space-x-2">
                <span className="text-sm text-cool-gray">Firmware:</span>
                <span className="text-sm text-white">{deviceValue(radioInfo.firmware)}</span>
                {(needsFirmwareUpdate || isNewerFirmware) && (
                  <button
                    onClick={() => setShowFirmwareWarning(true)}
                    className="text-yellow-400 hover:text-yellow-300 transition-colors cursor-pointer"
                    title={isNewerFirmware ? "Firmware version not recommended" : "Firmware update recommended"}
                  >
                    ⚠️
                  </button>
                )}
              </div>
              <span className="text-cool-gray">|</span>
              <div className="flex items-center space-x-2">
                <span className="text-sm text-cool-gray">Build:</span>
                <span className="text-sm text-white">{deviceValue(radioInfo.buildDate)}</span>
              </div>
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
        {showUserGestureInBar && (
          <div className="flex-1 flex items-center justify-center gap-2 min-w-0">
            <span className="text-sm text-amber-400">{USER_GESTURE_MESSAGE}</span>
            <button
              type="button"
              onClick={() => setConnectionError(null)}
              className="text-cool-gray hover:text-white flex-shrink-0"
              title="Dismiss"
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        )}
        <div className="text-sm text-cool-gray flex-shrink-0">
          NEONPLUG
        </div>
      </div>
    <Modal
      isOpen={showFirmwareWarning}
      onClose={() => setShowFirmwareWarning(false)}
      title={isNewerFirmware ? "Firmware Version Not Recommended" : "Firmware Update Recommended"}
    >
      <div className="space-y-4">
        <div className="flex items-start space-x-3">
          <span className="text-yellow-400 text-2xl">⚠️</span>
          <div className="flex-1">
            {isNewerFirmware ? (
              <>
                <p className="text-white mb-2">
                  Your radio firmware version is <span className="font-mono text-neon-cyan">{radioInfo?.firmware}</span>, 
                  which is not recommended and has not been tested with this software.
                </p>
                <p className="text-cool-gray">
                  This firmware version (049 or newer) may have compatibility issues or untested behavior. 
                  Use at your own risk.
                </p>
              </>
            ) : (
              <>
                <p className="text-white mb-2">
                  Your radio firmware version is <span className="font-mono text-neon-cyan">{radioInfo?.firmware}</span>, 
                  but the recommended version is <span className="font-mono text-neon-cyan">{EXPECTED_FIRMWARE}</span>.
                </p>
                <p className="text-cool-gray">
                  We recommend updating your firmware to ensure compatibility with all features and bug fixes. 
                  Please check the official Baofeng website or your radio's documentation for firmware update instructions.
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </Modal>
    </>
  );
};

