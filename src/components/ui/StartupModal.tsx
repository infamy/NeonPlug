import React, { useState, useMemo, useEffect } from 'react';
import { Button } from './Button';
import { ConfirmModal } from './ConfirmModal';
import { getRadioPickerOptions } from '../../radios';
import { useRadioStore } from '../../store/radioStore';
import { isWebSerialSupported, isWebBluetoothSupported, getSupportedBrowsers } from '../../utils/browserSupport';
import { downloadOfflineAsZip } from '../../utils/offlineDownload';
import { getSnapshots, getSnapshotData, clearSnapshots, type SnapshotEventType } from '../../services/codeplugSnapshots';
import { readWithFormatOverride, type CodeplugData } from '../../services/codeplugExport';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';
import { confirmNewerFormat } from '../../utils/codeplugFormatPrompt';

const OFFLINE_VERSION_URL = 'https://infamy.github.io/NeonPlug/';

function formatEventType(eventType?: SnapshotEventType): string {
  if (!eventType) return '';
  return eventType.charAt(0).toUpperCase() + eventType.slice(1);
}

function formatRelativeTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins} min ago`;
  if (diffHours < 24) return `${diffHours} hr ago`;
  if (diffDays < 7) return `${diffDays} days ago`;
  return d.toLocaleDateString();
}

interface StartupModalProps {
  isOpen: boolean;
  onReadFromRadio: (transport?: 'serial' | 'ble') => void;
  onLoadFile: () => void;
  onDismiss?: () => void;
  /** When set (e.g. opened from Toolbar "Change radio"), show a Cancel button to close without action. */
  onCancel?: () => void;
  /** Called when user restores a snapshot. Populate stores and close modal. */
  onRestoreSnapshot?: (data: CodeplugData) => void;
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
  onRestoreSnapshot,
}) => {
  const [offlineFallbackOpen, setOfflineFallbackOpen] = useState(false);
  const [transportChoiceOpen, setTransportChoiceOpen] = useState(false);
  const [recentExpanded, setRecentExpanded] = useState(false);
  const [snapshots, setSnapshots] = useState<ReturnType<typeof getSnapshots>>([]);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const { confirm, confirmProps } = useConfirmDialog();
  const { selectedRadioModel, setSelectedRadioModel } = useRadioStore();

  useEffect(() => {
    if (isOpen) {
      setSnapshots(getSnapshots());
    }
  }, [isOpen]);
  const options = useMemo(() => getRadioPickerOptions(), []);

  // Group options by manufacturer; ungrouped radios go under a blank key
  const groupedOptions = useMemo(() => {
    const groups = new Map<string, typeof options>();
    for (const opt of options) {
      const key = opt.group ?? '';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(opt);
    }
    return groups;
  }, [options]);

  // Default to first radio if none selected
  const effectiveSelected = selectedRadioModel ?? options[0]?.modelId ?? null;
  const selectedOption = options.find(o => o.modelId === effectiveSelected);

  if (!isOpen) return null;

  const webSerialSupported = isWebSerialSupported();
  const webBluetoothSupported = isWebBluetoothSupported();
  const supportedBrowsers = getSupportedBrowsers();
  const showTransportChoice = selectedOption?.supportsBle === true;
  // Radio is usable if at least one supported transport is available
  const canConnect = showTransportChoice
    ? (webSerialSupported || webBluetoothSupported)
    : webSerialSupported;

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
        <div className="mb-6 space-y-3 max-h-64 overflow-y-auto pr-1">
          {Array.from(groupedOptions.entries()).map(([group, opts]) => (
            <div key={group || '__ungrouped'}>
              {group && (
                <p className="text-cool-gray text-xs font-semibold uppercase tracking-wider mb-1 px-1">
                  {group}
                </p>
              )}
              <div className="grid grid-cols-2 gap-2">
                {opts.map((opt) => (
                  <button
                    key={opt.modelId}
                    type="button"
                    onClick={() => setSelectedRadioModel(opt.modelId)}
                    className={`flex items-center justify-center px-3 py-2 rounded border-2 transition-all text-sm font-medium ${
                      effectiveSelected === opt.modelId
                        ? 'border-neon-cyan bg-neon-cyan bg-opacity-10 shadow-glow-cyan text-white'
                        : 'border-cool-gray hover:border-neon-cyan text-cool-gray hover:text-white'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-4 mb-6">
          {!canConnect && (
            <div className="bg-yellow-900 bg-opacity-30 border border-yellow-600 rounded-lg p-4 mb-4">
              <div className="flex items-start">
                <svg className="w-5 h-5 text-yellow-500 mt-0.5 mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <div>
                  <p className="text-yellow-500 font-semibold text-sm mb-1">Browser Not Supported</p>
                  <p className="text-yellow-200 text-xs">
                    {showTransportChoice
                      ? 'Your browser does not support Web Serial or Web Bluetooth.'
                      : 'Your browser does not support the Web Serial API.'
                    }
                    {' '}To connect to your radio, please use {supportedBrowsers.slice(0, -1).join(', ')}, or {supportedBrowsers[supportedBrowsers.length - 1]}.
                  </p>
                </div>
              </div>
            </div>
          )}

          <Button
            variant="primary"
            onClick={handleReadClick}
            className="w-full py-4 text-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-deep-gray disabled:text-cool-gray disabled:shadow-none"
            glow={canConnect}
            disabled={!canConnect || !effectiveSelected}
            title={!canConnect ? 'Web Serial and Web Bluetooth are not supported in this browser' : `Read codeplug from ${selectedOption?.label ?? 'radio'}`}
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

          {snapshots.length > 0 && onRestoreSnapshot && (
            <div className="border border-cool-gray rounded-lg overflow-hidden">
              <button
                type="button"
                onClick={() => setRecentExpanded(!recentExpanded)}
                className="w-full px-4 py-2 flex items-center justify-between text-left text-cool-gray hover:text-white hover:bg-cool-gray hover:bg-opacity-20 transition-colors"
              >
                <span className="text-sm font-medium">Recent codeplugs ({snapshots.length})</span>
                <span className="text-xs">{recentExpanded ? '▼' : '▶'}</span>
              </button>
              {recentExpanded && (
                <div className="max-h-48 overflow-y-auto border-t border-cool-gray">
                  {snapshots.map((s) => (
                    <div
                      key={s.id}
                      className="flex items-center justify-between gap-2 px-4 py-2 border-b border-cool-gray border-opacity-50 last:border-b-0 hover:bg-cool-gray hover:bg-opacity-10"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          {s.eventType && (
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
                              s.eventType === 'read' ? 'bg-neon-cyan bg-opacity-20 text-neon-cyan' :
                              s.eventType === 'write' ? 'bg-neon-purple bg-opacity-20 text-neon-purple' :
                              'bg-amber-500 bg-opacity-20 text-amber-400'
                            }`}>
                              {formatEventType(s.eventType)}
                            </span>
                          )}
                          {s.radioModel && (
                            <span className="text-xs text-cool-gray">{s.radioModel}</span>
                          )}
                        </div>
                        <p className="text-white text-sm truncate mt-1">{s.label}</p>
                        <p className="text-cool-gray text-xs">{formatRelativeTime(s.timestamp)}</p>
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          let data;
                          try {
                            data = await readWithFormatOverride(
                              (opts) => getSnapshotData(s.id, opts),
                              confirmNewerFormat(confirm)
                            );
                          } catch (error) {
                            setRestoreError(
                              error instanceof Error ? error.message : 'Unknown error'
                            );
                            return;
                          }
                          if (data) {
                            onRestoreSnapshot(data);
                            setRecentExpanded(false);
                          }
                        }}
                        className="flex-shrink-0 px-3 py-1 text-xs font-semibold text-neon-cyan border border-neon-cyan rounded hover:bg-neon-cyan hover:bg-opacity-20 transition-colors"
                      >
                        Restore
                      </button>
                    </div>
                  ))}
                  <div className="px-4 py-2 border-t border-cool-gray">
                    <button
                      type="button"
                      onClick={() => setClearConfirmOpen(true)}
                      className="text-xs text-cool-gray hover:text-red-400 transition-colors"
                    >
                      Clear all
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

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
      <ConfirmModal
        isOpen={clearConfirmOpen}
        onClose={() => setClearConfirmOpen(false)}
        onConfirm={() => {
          clearSnapshots();
          setSnapshots([]);
          setClearConfirmOpen(false);
        }}
        title="Clear all snapshots"
        message="Remove all recent codeplug snapshots from local storage? This cannot be undone."
        confirmLabel="Clear all"
        variant="alert"
      />
      <ConfirmModal
        isOpen={restoreError !== null}
        onClose={() => setRestoreError(null)}
        title="Cannot restore snapshot"
        message={restoreError ?? ''}
        confirmLabel="OK"
        variant="alert"
      />
      <ConfirmModal {...confirmProps} />
    </div>
  );
};
