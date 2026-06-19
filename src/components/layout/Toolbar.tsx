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
import { useRadioCapabilities } from '../../hooks/useRadioCapabilities';
import { useQuickMessagesStore } from '../../store/quickMessagesStore';
import { useDMRRadioIDsStore } from '../../store/dmrRadioIdsStore';
import { useQuickContactsStore } from '../../store/quickContactsStore';
import { useRXGroupsStore } from '../../store/rxGroupsStore';
import { useEncryptionKeysStore } from '../../store/encryptionKeysStore';
import { getRadioPickerOptions, getMigrationTargetModels } from '../../radios';
import { validateCodeplugForWrite } from '../../services/validation/codeplugValidator';
import { migrateCodeplug, type MigrationLoss } from '../../services/codeplugMigration';
import { saveSnapshot, getSnapshots, getSnapshotData, clearSnapshots, type SnapshotEventType } from '../../services/codeplugSnapshots';
// Codeplug export/import are lazy loaded when needed
import { useRadioConnection } from '../../hooks/useRadioConnection';
import { useAlert } from '../../hooks/useAlert';
import { ReadProgressModal } from '../ui/ReadProgressModal';
import { ConfirmModal } from '../ui/ConfirmModal';
import { isWebSerialSupported } from '../../utils/browserSupport';

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
  const { readFromRadio, writeChannelsToRadio, isConnecting, error, readSteps, writeChannelsSteps } = useRadioConnection();
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [currentStep, setCurrentStep] = useState('');
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [isWriting, setIsWriting] = useState(false);
  const [lastOperationMode, setLastOperationMode] = useState<'read' | 'write' | null>(null);
  const [writeWarningOpen, setWriteWarningOpen] = useState(false);
  const [writeWarningMessage, setWriteWarningMessage] = useState('');
  const { alertOpen, alertMessage, alertTitle, showAlert, closeAlert } = useAlert();
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
    exportDate: new Date().toISOString(),
    version: '1.0.0',
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
      exportDate: new Date().toISOString(),
      version: '1.0.0',
    };
  };

  const formatMigrationLoss = (loss: MigrationLoss): string => {
    const parts: string[] = [];
    if (loss.channelsDropped > 0) parts.push(`${loss.channelsDropped} channel(s) removed`);
    if (loss.zonesLost > 0) parts.push(`${loss.zonesLost} zone(s) removed`);
    if (loss.scanListsLost > 0) parts.push(`${loss.scanListsLost} scan list(s) removed`);
    if (loss.contactsLost > 0) parts.push(`${loss.contactsLost} contact(s) removed`);
    if (loss.radioIdsLost > 0) parts.push(`${loss.radioIdsLost} DMR ID(s) removed`);
    if (loss.digitalEmergenciesLost > 0) parts.push(`${loss.digitalEmergenciesLost} digital emergency(s) removed`);
    if (loss.messagesLost > 0) parts.push(`${loss.messagesLost} quick message(s) removed`);
    if (loss.quickContactsLost > 0) parts.push(`${loss.quickContactsLost} quick contact(s) removed`);
    if (loss.rxGroupsLost > 0) parts.push(`${loss.rxGroupsLost} RX group(s) removed`);
    if (loss.encryptionKeysLost > 0) parts.push(`${loss.encryptionKeysLost} encryption key(s) removed`);
    if (loss.settingsCleared) parts.push('Radio settings cleared (do not map between radios)');
    return parts.length > 0 ? parts.join('. ') : 'No data removed.';
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
    const lossText = formatMigrationLoss(loss);
    showAlert(`Codeplug converted for ${targetLabel}. ${lossText}`, 'Convert');
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
      const codeplugData = await importCodeplug(file);
      
      // Populate all stores with imported data
      setChannels(codeplugData.channels);
      setZones(codeplugData.zones);
      setScanLists(codeplugData.scanLists);
      setContacts(codeplugData.contacts);
      setDigitalEmergencies(codeplugData.digitalEmergencies);
      if (codeplugData.digitalEmergencyConfig) {
        setDigitalEmergencyConfig(codeplugData.digitalEmergencyConfig);
      }
      setAnalogEmergencies(codeplugData.analogEmergencies);
      if (codeplugData.radioSettings) {
        setRadioSettings(codeplugData.radioSettings);
      }
      setRadioInfo(codeplugData.radioInfo ?? null);
      setMessages(codeplugData.messages ?? []);
      setRadioIds(codeplugData.radioIds ?? []);
      setQuickContacts(codeplugData.quickContacts ?? []);
      setRXGroups(codeplugData.rxGroups ?? []);
      setEncryptionKeys(codeplugData.encryptionKeys ?? []);
      
      const digCount = codeplugData.digitalEmergencies?.length ?? 0;
      const analogCount = codeplugData.analogEmergencies?.length ?? 0;
      const msgCount = codeplugData.messages?.length ?? 0;
      const idCount = codeplugData.radioIds?.length ?? 0;
      const tgCount = codeplugData.quickContacts?.length ?? 0;
      const rxCount = codeplugData.rxGroups?.length ?? 0;
      const encCount = codeplugData.encryptionKeys?.length ?? 0;
      const lines = [
        `• ${codeplugData.channels.length} channels`,
        `• ${codeplugData.zones.length} zones`,
        `• ${codeplugData.scanLists.length} scan lists`,
        `• ${codeplugData.contacts.length} contacts`,
        `• ${digCount} digital emergency system(s)`,
        `• ${analogCount} analog emergency system(s)`,
        codeplugData.radioSettings ? '• Radio settings' : null,
        `• ${msgCount} quick message(s)`,
        `• ${idCount} DMR radio ID(s)`,
        `• ${tgCount} talk group(s)`,
        `• ${rxCount} RX group(s)`,
        `• ${encCount} encryption key(s)`,
      ].filter(Boolean);
      showAlert(`Successfully imported codeplug!\n\n${lines.join('\n')}`, 'Import');
      saveSnapshot(codeplugData, { eventType: 'import', fileName: file.name });
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
      saveSnapshot(buildCodeplugDataFromStores(), { eventType: 'read', radioModel: modelLabel });
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

  const EXPERIMENTAL_WRITE_WARNING =
    '⚠️ EXPERIMENTAL FEATURE WARNING ⚠️\n\n' +
    'Writing to the radio is an EXPERIMENTAL feature and is used at your own risk.\n\n' +
    'IMPORTANT: Before proceeding, ensure that:\n' +
    '• Allow Reset is ENABLED via the Baofeng CPS\n' +
    '• You have done a radio read with the Baofeng CPS and saved that as a backup\n' +
    '• You have a backup of your current codeplug\n' +
    '• You understand that this operation may modify your radio\'s memory\n\n' +
    'Do you want to continue?';

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
      saveSnapshot(buildCodeplugDataFromStores(), { eventType: 'write', radioModel: modelLabel });
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
    let message = EXPERIMENTAL_WRITE_WARNING;
    if (warnings.length > 0) {
      const validationLines = warnings.map((w) => {
        if (w.id === 'channels_not_in_zones' && w.channels && w.channels.length > 0) {
          const list = w.channels
            .slice(0, 10)
            .map((c) => `Ch ${c.number} – ${c.name || '(no name)'}`)
            .join('\n');
          const more = w.channels.length > 10 ? `\n... and ${w.channels.length - 10} more` : '';
          return `${w.message}\n\n${list}${more}`;
        }
        if (w.id === 'zones_reference_nonexistent_channels' && w.zoneRefs && w.zoneRefs.length > 0) {
          const lines = w.zoneRefs
            .slice(0, 10)
            .map((z) => `Zone "${z.zoneName}": non-existent Ch ${z.invalidChannelNumbers.join(', ')}`)
            .join('\n');
          const more = w.zoneRefs.length > 10 ? `\n... and ${w.zoneRefs.length - 10} more zone(s)` : '';
          return `${w.message}\n\n${lines}${more}`;
        }
        if (w.id === 'channels_reference_deleted_dmr_radio_id' && w.channels && w.channels.length > 0) {
          const list = w.channels
            .slice(0, 10)
            .map((c) => `Ch ${c.number} – ${c.name || '(no name)'} (Radio ID index ${c.dmrRadioIdIndex ?? '?'})`)
            .join('\n');
          const more = w.channels.length > 10 ? `\n... and ${w.channels.length - 10} more` : '';
          return `${w.message}\n\n${list}${more}`;
        }
        return w.message;
      });
      message = '⚠️ Codeplug check\n\n' + validationLines.join('\n\n') + '\n\n' + message;
    }
    setWriteWarningMessage(message);
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

  const handleRestoreSnapshot = (id: string) => {
    const data = getSnapshotData(id);
    if (!data) return;
    setChannels(data.channels);
    setZones(data.zones);
    setScanLists(data.scanLists);
    setContacts(data.contacts);
    setDigitalEmergencies(data.digitalEmergencies);
    if (data.digitalEmergencyConfig) {
      setDigitalEmergencyConfig(data.digitalEmergencyConfig);
    }
    setAnalogEmergencies(data.analogEmergencies);
    if (data.radioSettings) {
      setRadioSettings(data.radioSettings);
    }
    setRadioInfo(data.radioInfo ?? null);
    setMessages(data.messages ?? []);
    setRadioIds(data.radioIds ?? []);
    setQuickContacts(data.quickContacts ?? []);
    setRXGroups(data.rxGroups ?? []);
    setEncryptionKeys(data.encryptionKeys ?? []);
    setSnapshotsModalOpen(false);
    showAlert(`Restored codeplug: ${data.channels.length} channels, ${data.zones.length} zones`, 'Restore');
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
            className="px-4 py-2 bg-deep-gray text-neon-cyan font-semibold rounded border border-neon-cyan border-opacity-50 hover:bg-neon-cyan hover:bg-opacity-10 transition-all active:scale-95"
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
              className="px-4 py-2 bg-neon-purple text-white font-semibold rounded hover:bg-neon-purple hover:bg-opacity-80 transition-all hover:shadow-lg border border-neon-purple border-opacity-50 active:scale-95"
              title="Import codeplug from file (.neonplug)"
            >
              Import
            </button>
            <button
              onClick={handleExport}
              className="px-4 py-2 bg-neon-cyan text-deep-gray font-semibold rounded hover:bg-neon-cyan hover:bg-opacity-80 transition-all hover:shadow-glow-cyan border border-neon-cyan border-opacity-50 active:scale-95"
              title="Export codeplug to file (.neonplug)"
            >
              Export
            </button>
            <button
              onClick={() => setConvertModalOpen(true)}
              className="px-4 py-2 bg-deep-gray text-neon-cyan font-semibold rounded border border-neon-cyan border-opacity-50 hover:bg-neon-cyan hover:bg-opacity-10 transition-all active:scale-95"
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
                disabled={isConnecting || !webSerialSupported}
                className={`rounded-r-none border-r border-white border-opacity-20 ${!webSerialSupported ? 'opacity-50 cursor-not-allowed' : ''}`}
                title={!webSerialSupported ? 'Web Serial API not supported. Please use Chrome, Edge, Opera, or Brave.' : 'Read codeplug from current radio type'}
              >
                {isConnecting ? 'Reading...' : 'Read from Radio'}
              </Button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setReadDropdownOpen((v) => !v); }}
                disabled={isConnecting || isWriting}
                title="Switch to a different radio type"
                className="px-2 py-2 bg-neon-cyan text-dark-charcoal hover:bg-opacity-90 border-l border-white border-opacity-20 disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none transition-all"
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
                  className="w-full text-left px-4 py-2 text-sm text-neon-cyan hover:bg-neon-cyan hover:bg-opacity-10 transition-colors"
                >
                  Change radio type…
                </button>
              </div>
            )}
          </div>
          <Button
            variant="primary"
            onClick={handleWrite}
            disabled={isConnecting || isWriting || (channels.length === 0 && zones.length === 0 && scanLists.length === 0) || !webSerialSupported || !!connectionError}
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
        mode={isWriting ? 'write' : 'read'}
      />
      <ConfirmModal
        isOpen={writeWarningOpen}
        onClose={() => setWriteWarningOpen(false)}
        onConfirm={handleWriteWarningConfirm}
        title="Write to radio"
        message={writeWarningMessage}
        confirmLabel="Continue"
        cancelLabel="Cancel"
        variant="default"
      />
      <ConfirmModal
        isOpen={alertOpen}
        onClose={closeAlert}
        title={alertTitle}
        message={alertMessage}
        confirmLabel="OK"
        variant="alert"
      />
      {convertModalOpen && (() => {
        const data = buildCodeplugData();
        const { loss } = migrateCodeplug(data, convertTargetModel);
        const lossPreview = formatMigrationLoss(loss);
        return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-80">
          <div className="bg-deep-gray rounded-lg p-6 border border-neon-cyan shadow-glow-cyan max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold text-neon-cyan mb-4">Convert for another radio</h3>
            <label className="block text-sm text-cool-gray mb-2">Target radio</label>
            <select
              value={convertTargetModel}
              onChange={(e) => setConvertTargetModel(e.target.value)}
              className="w-full px-3 py-2 bg-deep-gray border border-neon-cyan rounded text-white mb-3"
            >
              {getRadioPickerOptions().map((opt) => (
                <option key={opt.modelId} value={opt.modelId}>
                  {opt.label}
                </option>
              ))}
            </select>
            <p className="text-sm text-amber-400 mb-3">What will be removed or cleared:</p>
            <p className="text-xs text-cool-gray mb-4 whitespace-pre-wrap">{lossPreview}</p>
            <div className="flex gap-2">
              <button
                onClick={handleConvertReplace}
                className="flex-1 px-4 py-2 bg-neon-cyan text-deep-gray font-semibold rounded hover:bg-opacity-80"
              >
                Replace current
              </button>
              <button
                onClick={handleConvertDownload}
                className="flex-1 px-4 py-2 border border-neon-cyan text-neon-cyan rounded hover:bg-neon-cyan hover:bg-opacity-10"
              >
                Download only
              </button>
            </div>
            <button
              onClick={() => setConvertModalOpen(false)}
              className="w-full mt-3 text-cool-gray hover:text-white text-sm"
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
                        className="flex-shrink-0 px-3 py-1.5 text-xs font-semibold text-neon-cyan border border-neon-cyan rounded hover:bg-neon-cyan hover:bg-opacity-20 transition-colors"
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
                  className="text-xs text-cool-gray hover:text-red-400 transition-colors"
                >
                  Clear all
                </button>
              )}
              <button
                onClick={() => setSnapshotsModalOpen(false)}
                className="ml-auto px-4 py-2 border border-neon-cyan text-neon-cyan rounded hover:bg-neon-cyan hover:bg-opacity-10 transition-colors"
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
        variant="alert"
      />
    </>
  );
};
