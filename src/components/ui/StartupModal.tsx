import React, { useState, useMemo } from 'react';
import { Button } from './Button';
import { ConfirmModal } from './ConfirmModal';
import { getRadioPickerOptions } from '../../radios';
import { useRadioStore } from '../../store/radioStore';
import { isWebSerialSupported, getSupportedBrowsers } from '../../utils/browserSupport';
import { downloadOfflineAsZip } from '../../utils/offlineDownload';

const OFFLINE_VERSION_URL = 'https://infamy.github.io/NeonPlug/';

interface StartupModalProps {
  isOpen: boolean;
  onReadFromRadio: (transport?: 'serial' | 'ble') => void;
  onLoadFile: () => void;
  onDismiss?: () => void;
  /** When set (e.g. opened from Toolbar "Change radio"), show a Cancel button to close without action. */
  onCancel?: () => void;
}

const OFFLINE_FALLBACK_MESSAGE =
  'The offline version is available on GitHub Pages.\n\n' +
  'Click OK to open it, then use your browser\'s "Save Page As" to save as neonplug.html.\n\n' +
  'Or build it locally using the instructions in the About tab.';

export const StartupModal: React.FC<StartupModalProps> = ({
  isOpen,
  onReadFromRadio,
  onLoadFile,
  onDismiss,
  onCancel,
}) => {
  const [offlineFallbackOpen, setOfflineFallbackOpen] = useState(false);
  const [transportChoiceOpen, setTransportChoiceOpen] = useState(false);
  const { selectedRadioModel, setSelectedRadioModel } = useRadioStore();
  const options = useMemo(() => getRadioPickerOptions(), []);

  // Default to first radio if none selected
  const effectiveSelected = selectedRadioModel ?? options[0]?.modelId ?? null;
  const selectedOption = options.find(o => o.modelId === effectiveSelected);

  if (!isOpen) return null;

  const webSerialSupported = isWebSerialSupported();
  const supportedBrowsers = getSupportedBrowsers();
  const showTransportChoice = selectedOption?.supportsBle === true;

  const handleReadClick = () => {
    if (showTransportChoice) {
      setTransportChoiceOpen(true);
    } else {
      onReadFromRadio();
    }
  };

  const handleTransportChoice = (transport: 'serial' | 'ble') => {
    setTransportChoiceOpen(false);
    onReadFromRadio(transport);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-90"
    >
      <div
        className="bg-deep-gray rounded-lg p-8 max-w-md w-full mx-4 border border-neon-cyan shadow-glow-cyan"
      >
        <div className="text-center mb-6">
          <h1 className="text-4xl font-bold text-neon-cyan mb-2">NEONPLUG</h1>
          <p className="text-cool-gray text-sm">Channel programming software</p>
        </div>

        <p className="text-white text-center mb-4">Pick a radio</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          {options.map((opt) => (
            <button
              key={opt.modelId}
              type="button"
              onClick={() => setSelectedRadioModel(opt.modelId)}
              className={`flex flex-col items-center justify-center p-4 rounded-lg border-2 transition-all ${
                effectiveSelected === opt.modelId
                  ? 'border-neon-cyan bg-neon-cyan bg-opacity-10 shadow-glow-cyan'
                  : 'border-cool-gray hover:border-neon-cyan hover:bg-opacity-5'
              }`}
            >
              <span className="text-white font-medium text-lg">{opt.label}</span>
            </button>
          ))}
        </div>

        <div className="space-y-4 mb-6">
          {!webSerialSupported && (
            <div className="bg-yellow-900 bg-opacity-30 border border-yellow-600 rounded-lg p-4 mb-4">
              <div className="flex items-start">
                <svg className="w-5 h-5 text-yellow-500 mt-0.5 mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <div>
                  <p className="text-yellow-500 font-semibold text-sm mb-1">Web Serial Not Supported</p>
                  <p className="text-yellow-200 text-xs">
                    Your browser does not support the Web Serial API. To read from or write to your radio, please use {supportedBrowsers.slice(0, -1).join(', ')}, or {supportedBrowsers[supportedBrowsers.length - 1]}.
                  </p>
                </div>
              </div>
            </div>
          )}

          <Button
            variant="primary"
            onClick={handleReadClick}
            className="w-full py-4 text-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-deep-gray disabled:text-cool-gray disabled:shadow-none"
            glow={webSerialSupported}
            disabled={!webSerialSupported || !effectiveSelected}
            title={!webSerialSupported ? 'Web Serial API not supported in this browser' : `Read codeplug from ${selectedOption?.label ?? 'radio'}`}
          >
            Read from {selectedOption?.label ?? 'Radio'}
          </Button>

          <Button
            variant="secondary"
            onClick={onLoadFile}
            className="w-full py-4 text-lg"
          >
            Import Codeplug
          </Button>
          <p className="text-xs text-cool-gray text-center mt-2">
            Import from codeplug file (.neonplug)
          </p>

          <p className="text-center text-sm">
            <button
              type="button"
              onClick={async () => {
                try {
                  await downloadOfflineAsZip();
                } catch {
                  setOfflineFallbackOpen(true);
                }
              }}
              className="text-neon-cyan hover:underline bg-transparent border-none cursor-pointer p-0 font-inherit text-inherit"
            >
              Download offline version (ZIP)
            </button>
          </p>

          {onDismiss && (
            <button
              onClick={onDismiss}
              className="w-full text-cool-gray hover:text-white text-sm py-2"
            >
              Continue with sample data
            </button>
          )}
          {onCancel && (
            <button
              onClick={onCancel}
              className="w-full text-cool-gray hover:text-white text-sm py-2"
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      {transportChoiceOpen && (
        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-80 z-10 rounded-lg">
          <div className="bg-deep-gray rounded-lg p-6 border border-neon-cyan mx-4 max-w-sm w-full">
            <p className="text-white text-center mb-4">Connect via</p>
            <div className="flex gap-4">
              <Button
                variant="primary"
                className="flex-1"
                onClick={() => handleTransportChoice('ble')}
              >
                BLE
              </Button>
              <Button
                variant="primary"
                className="flex-1"
                onClick={() => handleTransportChoice('serial')}
              >
                Serial
              </Button>
            </div>
            <button
              type="button"
              onClick={() => setTransportChoiceOpen(false)}
              className="w-full text-cool-gray hover:text-white text-sm mt-4"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={offlineFallbackOpen}
        onClose={() => setOfflineFallbackOpen(false)}
        onConfirm={() => window.open(OFFLINE_VERSION_URL, '_blank')}
        title="Download offline version"
        message={OFFLINE_FALLBACK_MESSAGE}
        confirmLabel="OK"
        variant="alert"
      />
    </div>
  );
};
