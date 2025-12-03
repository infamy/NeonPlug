import React from 'react';
import { ProgressBar } from './ProgressBar';

interface ReadProgressModalProps {
  isOpen: boolean;
  progress: number;
  message: string;
  currentStep: string;
  steps: string[];
}

export const ReadProgressModal: React.FC<ReadProgressModalProps> = ({
  isOpen,
  progress,
  message,
  currentStep,
  steps,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75"
    >
      <div
        className="bg-deep-gray rounded-lg p-6 max-w-md w-full mx-4 border border-neon-cyan shadow-glow-cyan"
      >
        <h2 className="text-2xl font-bold text-neon-cyan mb-4">Reading from Radio</h2>
        
        <div className="mb-6">
          <ProgressBar progress={progress} message={message} />
        </div>

        <div className="space-y-2">
          <div className="text-sm text-gray-400 mb-3">Progress Steps:</div>
          {steps.map((step, index) => {
            const stepProgress = steps.indexOf(currentStep);
            const isCompleted = index < stepProgress;
            const isCurrent = step === currentStep;

            return (
              <div
                key={step}
                className={`
                  flex items-center space-x-3 py-2 px-3 rounded
                  transition-all duration-200
                  ${
                    isCurrent
                      ? 'bg-neon-cyan bg-opacity-20 border border-neon-cyan'
                      : isCompleted
                      ? 'bg-green-500 bg-opacity-10 border border-green-500 border-opacity-30'
                      : 'bg-gray-800 bg-opacity-50 border border-gray-700'
                  }
                `}
              >
                <div
                  className={`
                    w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold
                    ${
                      isCurrent
                        ? 'bg-neon-cyan text-black'
                        : isCompleted
                        ? 'bg-green-500 text-black'
                        : 'bg-gray-700 text-gray-400'
                    }
                  `}
                >
                  {isCompleted ? '✓' : index + 1}
                </div>
                <span
                  className={`
                    flex-1 text-sm
                    ${
                      isCurrent
                        ? 'text-neon-cyan font-medium'
                        : isCompleted
                        ? 'text-green-400'
                        : 'text-gray-400'
                    }
                  `}
                >
                  {step}
                </span>
                {isCurrent && (
                  <div className="animate-pulse">
                    <div className="w-2 h-2 bg-neon-cyan rounded-full"></div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

