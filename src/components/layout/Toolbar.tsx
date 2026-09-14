import React, { useRef, useState, useEffect } from 'react';
import { Button } from '../ui/Button';
import { useChannelsStore } from '../../store/channelsStore';
import { useZonesStore } from '../../store/zonesStore';
import { useScanListsStore } from '../../store/scanListsStore';
import { useContactsStore } from '../../store/contactsStore';
import { useRadioSettingsStore } from '../../store/radioSettingsStore';
import { useDigitalEmergencyStore } from '../../store/digitalEmergencyStore';
import { useAnalogEmergencyStore } from '../../store/analogEmergencyStore';
import { useRadioStore } from '../../store/radioStore';
import { blocksWriting } from '../../radios/d890uv/integrity';
import { useRadioCapabilities } from '../../hooks/useRadioCapabilities';
import { useQuickMessagesStore } from '../../store/quickMessagesStore';
import { useDMRRadioIDsStore } from '../../store/dmrRadioIdsStore';
import { useQuickContactsStore } from '../../store/quickContactsStore';
import { useRXGroupsStore } from '../../store/rxGroupsStore';
import { useEncryptionKeysStore } from '../../store/encryptionKeysStore';
import { getRadioPickerOptions, getMigrationTargetModels } from '../../radios';
import { validateCodeplugForWrite } from '../../services/validation/codeplugValidator';
import { migrateCodeplug } from '../../services/codeplugMigration';
import { exportableTables } from '../../services/codeplugExport';
import { applyCodeplugToStores } from '../../services/applyCodeplug';
import { saveSnapshot, getSnapshots, getSnapshotData, clearSnapshots, type SnapshotEventType } from '../../services/codeplugSnapshots';
// Codeplug export/import are lazy loaded when needed
import { useRadioConnection } from '../../hooks/useRadioConnection';
import { useAlert } from '../../hooks/useAlert';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';
import { confirmNewerFormat } from '../../utils/codeplugFormatPrompt';
// Statically imported: codeplugSnapshots already pulls codeplugExport into this
// component's graph, so lazy-loading it here would save nothing.
import { readWithFormatOverride } from '../../services/codeplugExport';
import { ReadProgressModal } from '../ui/ReadProgressModal';
import { ConfirmModal } from '../ui/ConfirmModal';
import { WriteConfirmBody } from './WriteConfirmBody';
import { WriteBlockedBody } from './WriteBlockedBody';
import { WriteRefusalBody } from './WriteRefusalBody';
import { CodeplugSummaryBody } from './CodeplugSummaryBody';
import { ConvertLossList } from './ConvertLossList';
import type { WriteConfirmInput } from './writeConfirmation';
import { isWebSerialSupported } from '../../utils/browserSupport';
import { BUTTON, FIELD } from '../ui/controlStyles';

export const Toolbar: React.FC = () => {
  const { channels, setChannels } = useChannelsStore();
  const { zones, setZones } = useZonesStore();
  const { scanLists, setScanLists } = useScanListsStore();
  const { contacts, setContacts } = useContactsStore();
  const { settings: radioSettings, setSettings: setRadioSettings } = useRadioSettingsStore();
  const { systems: digitalEmergencies, config: digitalEmergencyConfig, setSystems: setDigitalEmergencies, setConfig: setDigitalEmergencyConfig } = useDigitalEmergencyStore();
  const { systems: analogEmergencies, setSystems: setAnalogEmergencies } = useAnalogEmergencyStore();
  const { radioInfo, setRadioInfo, setShowPickRadioModal, setSelectedRadioModel } = useRadioStore();
  const { caps, model: effectiveModel } = useRadioCapabilities();
  const { messages, setMessages } = useQuickMessagesStore();
  const { radioIds: dmrRadioIds, setRadioIds } = useDMRRadioIDsStore();
  const { contacts: quickContacts, setContacts: setQuickContacts } = useQuickContactsStore();
  const { groups: rxGroups, setGroups: setRXGroups } = useRXGroupsStore();
  const { keys: encryptionKeys, setKeys: setEncryptionKeys } = useEncryptionKeysStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { readFromRadio, writeChannelsToRadio, previewChannelWrite, isConnecting, error, readSteps, writeChannelsSteps, readModel, writeModel } = useRadioConnection();
  // Any operation anywhere owns the port; a second port.open() throws AND
  // leaves it locked for the next attempt.
  const { radioBusy } = useRadioStore();
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [currentStep, setCurrentStep] = useState('');
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [isWriting, setIsWriting] = useState(false);
  const [lastOperationMode, setLastOperationMode] = useState<'read' | 'write' | null>(null);
  const [writeWarningOpen, setWriteWarningOpen] = useState(false);
  const [writeConfirm, setWriteConfirm] = useState<WriteConfirmInput | null>(null);
  const { alertOpen, alertMessage, alertBody, alertSize, alertTitle, showAlert, showAlertBody, closeAlert } = useAlert();
  const { confirm, confirmProps } = useConfirmDialog();
  const [convertModalOpen, setConvertModalOpen] = useState(false);
  const [convertTargetModel, setConvertTargetModel] = useState<string>(() => getMigrationTargetModels()[0] ?? 'DM-32UV');
  const [readDropdownOpen, setReadDropdownOpen] = useState(false);
  const [snapshotsModalOpen, setSnapshotsModalOpen] = useState(false);
  const [snapshotsList, setSnapshotsList] = useState<ReturnType<typeof getSnapshots>>([]);
  const [snapshotsClearConfirmOpen, setSnapshotsClearConfirmOpen] = useState(false);
  const readDropdownRef = useRef<HTMLDivElement>(null);
  const webSerialSupported = isWebSerialSupported();

  const formatEventType = (eventType?: SnapshotEventType): string => {
    if (!eventType) return '';
    return eventType.charAt(0).toUpperCase() + eventType.slice(1);
  };

  const formatRelativeTime = (iso: string): string => {
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
  };

  useEffect(() => {
    if (!readDropdownOpen) return;
    const close = (e: MouseEvent) => {
      if (readDropdownRef.current?.contains(e.target as Node)) return;
      setReadDropdownOpen(false);
    };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [readDropdownOpen]);

  const buildCodeplugData = () => ({
    channels,
    zones,
    scanLists,
    contacts,
    digitalEmergencies,
    digitalEmergencyConfig,
    analogEmergencies,
    radioSettings,
    radioInfo,
    messages,
    radioIds: dmrRadioIds,
    quickContacts,
    rxGroups,
    encryptionKeys,
    // The radio's own tables travel with the file — without these a DA-7X2
    // backup silently omits AM/FM, roaming, DTMF, hot keys and the rest.
    tables: exportableTables(useRadioStore.getState().tables),
    exportDate: new Date().toISOString(),
  });

  const buildCodeplugDataFromStores = () => {
    const cs = useChannelsStore.getState();
    const zs = useZonesStore.getState();
    const sls = useScanListsStore.getState();
    const cts = useContactsStore.getState();
    const des = useDigitalEmergencyStore.getState();
    const aes = useAnalogEmergencyStore.getState();
    const rss = useRadioSettingsStore.getState();
    const rs = useRadioStore.getState();
    const qms = useQuickMessagesStore.getState();
    const drs = useDMRRadioIDsStore.getState();
    const qcs = useQuickContactsStore.getState();
    const rgs = useRXGroupsStore.getState();
    const eks = useEncryptionKeysStore.getState();
    return {
      channels: cs.channels,
      zones: zs.zones,
      scanLists: sls.scanLists,
      contacts: cts.contacts,
      digitalEmergencies: des.systems,
      digitalEmergencyConfig: des.config,
      analogEmergencies: aes.systems,
      radioSettings: rss.settings,
      radioInfo: rs.radioInfo,
      messages: qms.messages,
      radioIds: drs.radioIds,
      quickContacts: qcs.contacts,
      rxGroups: rgs.groups,
      encryptionKeys: eks.keys,
      tables: exportableTables(rs.tables),
      exportDate: new Date().toISOString(),
    };
  };

  const handleConvertReplace = async () => {
    const data = buildCodeplugData();
    const { migrated, loss } = migrateCodeplug(data, convertTargetModel);
    setChannels(migrated.channels);
    setZones(migrated.zones);
    setScanLists(migrated.scanLists);
    setContacts(migrated.contacts);
    setDigitalEmergencies(migrated.digitalEmergencies);
    setDigitalEmergencyConfig(migrated.digitalEmergencyConfig ?? null);
    setAnalogEmergencies(migrated.analogEmergencies);
    setRadioSettings(migrated.radioSettings ?? null);
    setRadioInfo(migrated.radioInfo ?? null);
    setMessages(migrated.messages);
    setRadioIds(migrated.radioIds);
    setQuickContacts(migrated.quickContacts);
    setRXGroups(migrated.rxGroups);
    setEncryptionKeys(migrated.encryptionKeys);
    setSelectedRadioModel(convertTargetModel);
    setConvertModalOpen(false);
    const targetLabel = getRadioPickerOptions().find((o) => o.modelId === convertTargetModel)?.label ?? convertTargetModel;
    showAlertBody(
      <div className="space-y-3 text-sm pb-1">
        <p className="text-white">Converted for {targetLabel}.</p>
        <ConvertLossList loss={loss} />
      </div>,
      'Convert'
    );
  };

  const handleConvertDownload = async () => {
    const data = buildCodeplugData();
    const { migrated } = migrateCodeplug(data, convertTargetModel);
    const { exportCodeplug } = await import('../../services/codeplugExport');
    await exportCodeplug(migrated);
    setConvertModalOpen(false);
  };

  const handleImport = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    try {
      // Lazy load codeplug import when needed
      const { importCodeplug } = await import('../../services/codeplugExport');
      const codeplugData = await readWithFormatOverride(
        (opts) => importCodeplug(file, opts),
        confirmNewerFormat(confirm)
      );
      // null = user declined the newer-format warning; not an error.
      if (!codeplugData) return;

      // An import marks the radio settings changed so a write sends them
      // (issue #2); applyCodeplugToStores is the one place that decides it.
      applyCodeplugToStores(codeplugData, 'import');
      
      showAlertBody(
        <CodeplugSummaryBody data={codeplugData} lead="Codeplug imported" fileName={file.name} />,
        'Import'
      );
      await saveSnapshot(codeplugData, { eventType: 'import', fileName: file.name });
    } catch (error) {
      showAlert(error instanceof Error ? error.message : 'Failed to import codeplug', 'Import');
    }
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleExport = async () => {
    const { exportCodeplug } = await import('../../services/codeplugExport');
    await exportCodeplug(buildCodeplugData());
  };

  const handleRead = async (forcePortSelection = true) => {
    window.focus();
    try {
      setConnectionError(null);
      setLastOperationMode('read');
      setProgress(0);
      setProgressMessage('Selecting port...');
      setCurrentStep('Selecting port');

      await readFromRadio((progress, message, step) => {
        setProgress(progress);
        setProgressMessage(message);
        if (step) {
          setCurrentStep(step);
        }
      }, { forcePortSelection });

      setConnectionError(null);
      setLastOperationMode(null);
      const modelLabel = useRadioStore.getState().radioInfo?.model ?? effectiveModel ?? undefined;
      await saveSnapshot(buildCodeplugDataFromStores(), { eventType: 'read', radioModel: modelLabel });
      setTimeout(() => {
        setProgress(0);
        setProgressMessage('');
        setCurrentStep('');
      }, 2000);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setConnectionError(errorMessage);
      setProgress(0);
      setProgressMessage('Connection failed');
    }
  };

  const handleRetry = () => {
    if (lastOperationMode === 'write') {
      handleWrite();
    } else {
      handleRead(false);
    }
  };

  const handleChangePort = () => {
    handleRead(true);
  };

  const handleCloseModal = () => {
    setConnectionError(null);
    setLastOperationMode(null);
    setProgress(0);
    setProgressMessage('');
    setCurrentStep('');
  };

  const startWriteOperation = async () => {
    window.focus();
    setIsWriting(true);
    setLastOperationMode('write');
    try {
      setConnectionError(null);
      setProgress(0);
      setProgressMessage('Selecting port...');
      setCurrentStep('Selecting port');
      
      await writeChannelsToRadio(channels, zones, scanLists, (progress, message, step) => {
        setProgress(progress);
        setProgressMessage(message);
        if (step) {
          setCurrentStep(step);
        }
      });
      
      setConnectionError(null);
      setLastOperationMode(null);
      const modelLabel = useRadioStore.getState().radioInfo?.model ?? effectiveModel ?? undefined;
      await saveSnapshot(buildCodeplugDataFromStores(), { eventType: 'write', radioModel: modelLabel });
      setTimeout(() => {
        setIsWriting(false);
        setProgress(0);
        setProgressMessage('');
        setCurrentStep('');
      }, 2000);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      const displayError = errorMessage;
      setConnectionError(displayError);
      setProgress(0);
      setProgressMessage('Write failed');
      setIsWriting(false);
    }
  };

  const handleWrite = () => {
    if (channels.length === 0 && zones.length === 0 && scanLists.length === 0) {
      showAlert('No data to write (channels, zones, or scan lists)');
      return;
    }
    // Run radio-specific validations only when model is known; combine with experimental warning in one modal
    const { warnings } = validateCodeplugForWrite(channels, zones, caps?.writeValidations, dmrRadioIds);
    // What this write will ACTUALLY send, shown before it is sent.
    //
    // On a radio that has no retry and ACKs a write without echoing it, "click
    // Write and hope" is not good enough — and the destructive part is not the
    // bytes going out but the channels a plan would CLEAR, which is silent
    // otherwise. Null for radios that do not plan their writes this way.
    // A codeplug that did not read cleanly must not be written back — that is
    // how a corrupt radio becomes a permanently corrupt radio. Checked before
    // anything else, because the rest of the preview describes a plan built on
    // a read we do not trust.
    const integrity = useRadioStore.getState().tables.writeOriginals?.integrity ?? [];
    if (blocksWriting(integrity)) {
      showAlertBody(<WriteBlockedBody findings={integrity} />, 'Write blocked');
      return;
    }

    const preview = previewChannelWrite(channels);
    // A refusal is the answer, not an error: nothing can be sent, and the
    // reason is the useful part.
    if (preview?.refusal) {
      showAlertBody(<WriteRefusalBody refusal={preview.refusal} />, 'Write refused', 'lg');
      return;
    }
    // Handed over as data, not assembled into a string. What it says and in
    // what order lives in writeConfirmation.ts; how it looks in WriteConfirmBody.
    setWriteConfirm({ preview, integrity, warnings });
    setWriteWarningOpen(true);
  };

  const handleWriteWarningConfirm = () => {
    setWriteWarningOpen(false);
    startWriteOperation();
  };

  const handleOpenSnapshots = () => {
    setSnapshotsList(getSnapshots());
    setSnapshotsModalOpen(true);
  };

  const handleRestoreSnapshot = async (id: string) => {
    let data;
    try {
      data = await readWithFormatOverride(
        (opts) => getSnapshotData(id, opts),
        confirmNewerFormat(confirm)
      );
    } catch (error) {
      // Previously getSnapshotData swallowed everything and Restore just did
      // nothing; a format reject now says why.
      showAlert(
        `Cannot restore snapshot: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      return;
    }
    if (!data) return;
    applyCodeplugToStores(data, 'restore');
    setSnapshotsModalOpen(false);
    showAlertBody(<CodeplugSummaryBody data={data} lead="Codeplug restored" />, 'Restore');
  };

  const handleClearSnapshots = () => {
    clearSnapshots();
    setSnapshotsList([]);
    setSnapshotsClearConfirmOpen(false);
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".neonplug"
        onChange={handleFileSelect}
        className="hidden"
      />
      <div className="bg-deep-gray border-b border-deep-gray">
        <div className="px-6 py-3 flex items-center space-x-3">
          <button
            onClick={handleOpenSnapshots}
            className={`${BUTTON.outline} px-4 py-2 font-semibold rounded border`}
            title="View and restore recent codeplug snapshots"
          >
            Snapshots{(() => { const n = getSnapshots().length; return n > 0 ? ` (${n})` : ''; })()}
          </button>
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <span className="text-xs text-neon-cyan font-semibold px-2 py-1 bg-neon-cyan bg-opacity-10 rounded border border-neon-cyan border-opacity-30">
              CODEPLUG
            </span>
            <button
              onClick={handleImport}
              className={`${BUTTON.secondary} px-4 py-2 font-semibold rounded border`}
              title="Import codeplug from file (.neonplug)"
            >
              Import
            </button>
            <button
              onClick={handleExport}
              className={`${BUTTON.primary} px-4 py-2 font-semibold rounded border`}
              title="Export codeplug to file (.neonplug)"
            >
              Export
            </button>
            <button
              onClick={() => setConvertModalOpen(true)}
              className={`${BUTTON.outline} px-4 py-2 font-semibold rounded border`}
              title="Convert codeplug for another radio"
            >
              Convert
            </button>
          </div>
          <div className="w-px h-6 bg-neon-cyan bg-opacity-30" />
          <div className="relative inline-flex" ref={readDropdownRef}>
            <div className="inline-flex rounded overflow-hidden">
              <Button
                variant="primary"
                data-action="read-from-radio"
                onClick={() => handleRead()}
                disabled={isConnecting || radioBusy || !webSerialSupported}
                className={`rounded-r-none border-r border-r-white/20 ${!webSerialSupported ? 'opacity-50 cursor-not-allowed' : ''}`}
                title={!webSerialSupported ? 'Web Serial API not supported. Please use Chrome, Edge, Opera, or Brave.' : 'Read codeplug from current radio type'}
              >
                {isConnecting ? 'Reading...' : 'Read from Radio'}
              </Button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setReadDropdownOpen((v) => !v); }}
                disabled={isConnecting || isWriting || radioBusy}
                title="Switch to a different radio type"
                className={`${BUTTON.primary} px-2 py-2 border-l border-l-white/20 disabled:pointer-events-none`}
                aria-expanded={readDropdownOpen}
                aria-haspopup="true"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                  <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
            {readDropdownOpen && (
              <div className="absolute top-full left-0 mt-1 py-1 min-w-[10rem] bg-deep-gray border border-neon-cyan border-opacity-30 rounded shadow-lg z-50">
                <button
                  type="button"
                  onClick={() => { setShowPickRadioModal(true); setReadDropdownOpen(false); }}
                  className={`${BUTTON.menuItem} w-full text-left px-4 py-2 text-sm`}
                >
                  Change radio type…
                </button>
              </div>
            )}
          </div>
          <Button
            variant="primary"
            onClick={handleWrite}
            disabled={isConnecting || isWriting || radioBusy || (channels.length === 0 && zones.length === 0 && scanLists.length === 0) || !webSerialSupported || !!connectionError}
            className={!webSerialSupported ? 'opacity-50 cursor-not-allowed' : ''}
            title={!webSerialSupported ? 'Web Serial API not supported. Please use Chrome, Edge, Opera, or Brave.' : 'Write codeplug to connected radio'}
            glow={webSerialSupported}
          >
            {isWriting ? 'Writing...' : 'Write to Radio'}
          </Button>
          {error && !error.includes('Please click the button directly') && (
            <span className="text-red-400 text-xs ml-2">{error}</span>
          )}
        </div>
      </div>
      <ReadProgressModal
        isOpen={isConnecting || isWriting || !!connectionError}
        progress={progress}
        message={progressMessage}
        currentStep={currentStep || (isWriting ? writeChannelsSteps[0] : readSteps[0])}
        steps={isWriting ? writeChannelsSteps : readSteps}
        error={connectionError}
        onRetry={handleRetry}
        onChangePort={!isWriting ? handleChangePort : undefined}
        onClose={handleCloseModal}
        // lastOperationMode, not just isWriting: once a write fails isWriting is
        // false, and the error popup would say "Reading as" for a write.
        mode={isWriting || lastOperationMode === 'write' ? 'write' : 'read'}
        model={isWriting || lastOperationMode === 'write' ? writeModel : readModel}
      />
      <ConfirmModal
        isOpen={writeWarningOpen}
        onClose={() => setWriteWarningOpen(false)}
        onConfirm={handleWriteWarningConfirm}
        title="Write to radio"
        body={writeConfirm ? <WriteConfirmBody {...writeConfirm} /> : undefined}
        size="lg"
        confirmLabel="Continue"
        cancelLabel="Cancel"
        variant="default"
      />
      <ConfirmModal
        isOpen={alertOpen}
        onClose={closeAlert}
        title={alertTitle}
        message={alertMessage}
        body={alertBody}
        size={alertSize}
        confirmLabel="OK"
        variant="alert"
      />
      {convertModalOpen && (() => {
        const data = buildCodeplugData();
        const { loss } = migrateCodeplug(data, convertTargetModel);
        return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-80">
          <div className="bg-deep-gray rounded-lg p-6 border border-neon-cyan shadow-glow-cyan max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold text-neon-cyan mb-4">Convert for another radio</h3>
            <label className="block text-sm text-cool-gray mb-2">Target radio</label>
            <select
              value={convertTargetModel}
              onChange={(e) => setConvertTargetModel(e.target.value)}
              className={`${FIELD} w-full px-3 py-2 border rounded mb-3`}
            >
              {getRadioPickerOptions().map((opt) => (
                <option key={opt.modelId} value={opt.modelId}>
                  {/* A plain <option> cannot carry the badge the picker shows,
                      so the word rides in the text — converting a codeplug TO
                      an alpha driver is exactly when it should be said. */}
                  {opt.status === 'alpha' ? `${opt.label} (Alpha)` : opt.label}
                </option>
              ))}
            </select>
            <p className="text-sm text-amber-400 mb-2">What will be removed or cleared:</p>
            <div className="mb-4">
              <ConvertLossList loss={loss} />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleConvertReplace}
                className={`${BUTTON.primary} flex-1 px-4 py-2 font-semibold rounded`}
              >
                Replace current
              </button>
              <button
                onClick={handleConvertDownload}
                className={`${BUTTON.outline} flex-1 px-4 py-2 border rounded`}
              >
                Download only
              </button>
            </div>
            <button
              onClick={() => setConvertModalOpen(false)}
              className={`${BUTTON.ghost} w-full mt-3 text-sm`}
            >
              Cancel
            </button>
          </div>
        </div>
        );
      })()}
      {snapshotsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-80">
          <div className="bg-deep-gray rounded-lg p-6 border border-neon-cyan shadow-glow-cyan max-w-md w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col">
            <h3 className="text-lg font-semibold text-neon-cyan mb-4">Recent codeplugs</h3>
            <div className="flex-1 overflow-y-auto min-h-0 mb-4">
              {snapshotsList.length === 0 ? (
                <p className="text-cool-gray text-sm">
                  No snapshots yet. Import a codeplug, read from radio, or write to radio to create snapshots.
                </p>
              ) : (
                <div className="space-y-2">
                  {snapshotsList.map((s) => (
                    <div
                      key={s.id}
                      className="flex items-center justify-between gap-3 p-3 rounded border border-cool-gray border-opacity-50 hover:border-neon-cyan hover:border-opacity-30 transition-colors"
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
                        <p className="text-white text-sm font-medium truncate mt-1">{s.label}</p>
                        <p className="text-cool-gray text-xs">{formatRelativeTime(s.timestamp)}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRestoreSnapshot(s.id)}
                        className={`${BUTTON.outline} flex-shrink-0 px-3 py-1.5 text-xs font-semibold border rounded`}
                      >
                        Restore
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="flex gap-2 border-t border-cool-gray pt-3">
              {snapshotsList.length > 0 && (
                <button
                  onClick={() => setSnapshotsClearConfirmOpen(true)}
                  className={`${BUTTON.dangerQuiet} text-xs`}
                >
                  Clear all
                </button>
              )}
              <button
                onClick={() => setSnapshotsModalOpen(false)}
                className={`${BUTTON.neutral} ml-auto px-4 py-2 border rounded`}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      <ConfirmModal
        isOpen={snapshotsClearConfirmOpen}
        onClose={() => setSnapshotsClearConfirmOpen(false)}
        onConfirm={handleClearSnapshots}
        title="Clear all snapshots"
        message="Remove all recent codeplug snapshots from local storage? This cannot be undone."
        confirmLabel="Clear all"
        variant="danger"
      />
      <ConfirmModal {...confirmProps} />
    </>
  );
};
