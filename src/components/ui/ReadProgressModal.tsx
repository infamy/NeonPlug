import React, { useState, useMemo, useCallback } from 'react';
import { ProgressBar } from './ProgressBar';
import { useLogStore, type LogEntry } from '../../store/logStore';

function formatLogError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error) return String((error as { message?: unknown }).message);
  if (typeof error === 'object' && error !== null) return JSON.stringify(error);
  return String(error);
}

function formatLogEntry(entry: LogEntry): string {
  const time = new Date(entry.timestamp).toISOString();
  const line = `[${time}][${entry.level}]${entry.context ? `[${entry.context}]` : ''} ${entry.message}`;
  if (entry.error !== undefined && entry.error !== null) {
    return `${line}\n  Error: ${formatLogError(entry.error)}`;
  }
  return line;
}

interface ReadProgressModalProps {
  isOpen: boolean;
  progress: number;
  message: string;
  currentStep: string;
  steps: string[];
  error?: string | null;
  onRetry?: () => void;
  onClose?: () => void;
  mode?: 'read' | 'write';
}

const DEBUG_LOGS_COUNT = 50;

export const ReadProgressModal: React.FC<ReadProgressModalProps> = ({
  isOpen,
  progress,
  message,
  currentStep,
  steps,
  error,
  onRetry,
  onClose,
  mode = 'read',
}) => {
  const [debugExpanded, setDebugExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const { logs } = useLogStore();

  const debugText = useMemo(() => {
    if (!error) return '';
    const header = [
      'NeonPlug Connection Debug',
      `Timestamp: ${new Date().toISOString()}`,
      `Error: ${error}`,
      '',
      '--- Recent logs ---',
    ].join('\n');
    const recentLogs = logs.slice(-DEBUG_LOGS_COUNT).map(formatLogEntry).join('\n');
    return `${header}\n${recentLogs}`;
  }, [error, logs]);

  const handleCopyDebug = useCallback(async () => {
    if (!debugText) return;
    try {
      await navigator.clipboard.writeText(debugText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }, [debugText]);

  if (!isOpen) return null;

  const isError = !!error;
  const isWriting = mode === 'write';

  return (
    <div
      className={`fixed inset-0 flex items-center justify-center bg-black bg-opacity-75 ${isError ? 'z-[100]' : 'z-50'}`}
    >
      <div
        className={`bg-deep-gray rounded-lg p-6 max-w-md w-full mx-4 border ${
          isError 
            ? 'border-red-500 shadow-glow-red' 
            : 'border-neon-cyan shadow-glow-cyan'
        }`}
      >
        <h2 className={`text-2xl font-bold mb-4 ${
          isError ? 'text-red-400' : 'text-neon-cyan'
        }`}>
          {isError ? 'Connection Error' : isWriting ? 'Writing to Radio' : 'Reading from Radio'}
        </h2>
        
        {isError ? (
          <div className="mb-6">
            <div className="bg-red-500 bg-opacity-10 border border-red-500 border-opacity-30 rounded-lg p-4 mb-4">
              <div className="flex items-start space-x-3">
                <div className="text-red-400 text-2xl">⚠</div>
                <div className="flex-1">
                  <p className="text-red-300 font-medium mb-2">Connection Failed</p>
                  <p className="text-red-200 text-sm whitespace-pre-wrap">{error}</p>
                </div>
              </div>
            </div>
            
            <div className="bg-gray-800 bg-opacity-50 border border-gray-700 rounded-lg p-4 mb-4">
              <p className="text-gray-300 text-sm font-medium mb-2">Troubleshooting:</p>
              <ul className="text-gray-400 text-xs space-y-1 list-disc list-inside">
                <li>Ensure radio is powered on</li>
                <li>Check USB cable connection</li>
                <li>Verify radio is in programming mode</li>
                <li>Try unplugging and replugging USB cable</li>
                <li>Select the correct serial port</li>
              </ul>
            </div>

            <div className="border border-gray-700 rounded-lg overflow-hidden">
              <button
                type="button"
                onClick={() => setDebugExpanded((e) => !e)}
                className="w-full px-4 py-2 text-left text-sm text-gray-400 hover:text-gray-300 bg-gray-800 bg-opacity-50 hover:bg-gray-800 flex items-center justify-between"
              >
                <span>Debug Info</span>
                <span className="text-gray-500">{debugExpanded ? '▼' : '▶'}</span>
              </button>
              {debugExpanded && (
                <div className="p-3 border-t border-gray-700 bg-deep-gray">
                  <pre className="text-xs text-gray-400 overflow-auto max-h-48 mb-3 p-2 bg-black bg-opacity-30 rounded font-mono whitespace-pre-wrap break-all">
                    {debugText}
                  </pre>
                  <button
                    type="button"
                    onClick={handleCopyDebug}
                    className="px-3 py-1.5 text-xs bg-gray-700 text-gray-300 rounded hover:bg-gray-600"
                  >
                    {copied ? 'Copied!' : 'Copy to clipboard'}
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="mb-6">
            <ProgressBar progress={progress} message={message} />
          </div>
        )}

        {!isError && (
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
        )}

        <div className="flex justify-end space-x-3 mt-6">
          {isError && onClose && (
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-700 text-gray-300 font-semibold rounded hover:bg-gray-600 transition-all border border-gray-600"
            >
              Close
            </button>
          )}
          {isError && onRetry && (
            <button
              onClick={onRetry}
              className="px-4 py-2 bg-neon-cyan text-deep-gray font-semibold rounded hover:bg-neon-cyan hover:bg-opacity-80 transition-all shadow-lg hover:shadow-glow-cyan border border-neon-cyan border-opacity-50"
            >
              Retry Connection
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

