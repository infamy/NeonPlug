import React from 'react';
import { Button } from './Button';

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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-90"
    >
      <div
        className="bg-deep-gray rounded-lg p-8 max-w-md w-full mx-4 border border-neon-cyan shadow-glow-cyan"
      >
        <div className="text-center mb-6">
          <h1 className="text-4xl font-bold text-neon-cyan mb-2">NEONPLUG</h1>
          <p className="text-cool-gray text-sm">DM-32UV Channel Programming Software</p>
        </div>

        <div className="space-y-4 mb-6">
          <p className="text-white text-center mb-6">
            How would you like to get started?
          </p>

          <Button
            variant="primary"
            onClick={onReadFromRadio}
            className="w-full py-4 text-lg"
            glow
          >
            Read from Radio
          </Button>

          <Button
            variant="secondary"
            onClick={onLoadFile}
            className="w-full py-4 text-lg"
          >
            Load from File
          </Button>

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

