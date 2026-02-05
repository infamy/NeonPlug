import React from 'react';
import { Button } from './Button';
import { DM32_MODEL_IDS } from '../../radios';
import { isWebSerialSupported, getSupportedBrowsers } from '../../utils/browserSupport';

const OFFLINE_VERSION_URL = 'https://infamy.github.io/NeonPlug/';

interface StartupModalProps {
  isOpen: boolean;
  onReadFromRadio: () => void;
  onLoadFile: () => void;
  onDismiss?: () => void;
}

export const StartupModal: React.FC<StartupModalProps> = ({
  isOpen,
  onReadFromRadio,
  onLoadFile,
  onDismiss,
}) => {
  if (!isOpen) return null;

  const webSerialSupported = isWebSerialSupported();
  const supportedBrowsers = getSupportedBrowsers();

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
          <p className="text-cool-gray text-xs mt-1">Supports: {DM32_MODEL_IDS.join(', ')}</p>
        </div>

        <div className="space-y-4 mb-6">
          <p className="text-white text-center mb-6">
            How would you like to get started?
          </p>

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
            onClick={onReadFromRadio}
            className="w-full py-4 text-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-deep-gray disabled:text-cool-gray disabled:shadow-none"
            glow={webSerialSupported}
            disabled={!webSerialSupported}
            title={!webSerialSupported ? 'Web Serial API not supported in this browser' : 'Read codeplug from connected radio'}
          >
            Read from Radio
          </Button>

          <Button
            variant="secondary"
            onClick={onLoadFile}
            className="w-full py-4 text-lg"
          >
            Import Codeplug
          </Button>
          <p className="text-xs text-cool-gray text-center mt-2">
            Import from XLSX codeplug file
          </p>

          <p className="text-center text-sm">
            <button
              type="button"
              onClick={async () => {
                try {
                  const response = await fetch(OFFLINE_VERSION_URL);
                  if (!response.ok) throw new Error('Not available');
                  const html = await response.text();
                  const blob = new Blob([html], { type: 'text/html' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = 'neonplug.html';
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(url);
                } catch {
                  const confirmed = window.confirm(
                    'The offline version is available on GitHub Pages.\n\n' +
                      'Click OK to open it, then:\n' +
                      '1. Right-click on the page\n' +
                      '2. Select "Save As" or "Save Page As"\n' +
                      '3. Save as "neonplug.html"\n\n' +
                      'Or build it locally using the instructions in the About tab.'
                  );
                  if (confirmed) {
                    window.open(OFFLINE_VERSION_URL, '_blank');
                  }
                }
              }}
              className="text-neon-cyan hover:underline bg-transparent border-none cursor-pointer p-0 font-inherit text-inherit"
            >
              Download offline version (single file)
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
        </div>
      </div>
    </div>
  );
};

