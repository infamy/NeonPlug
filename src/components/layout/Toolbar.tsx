import React, { useRef, useState } from 'react';
import { Button } from '../ui/Button';
import { useChannelsStore } from '../../store/channelsStore';
import { useZonesStore } from '../../store/zonesStore';
import { useScanListsStore } from '../../store/scanListsStore';
import { useContactsStore } from '../../store/contactsStore';
import { useRadioSettingsStore } from '../../store/radioSettingsStore';
import { useDigitalEmergencyStore } from '../../store/digitalEmergencyStore';
import { useAnalogEmergencyStore } from '../../store/analogEmergencyStore';
import { useRadioStore } from '../../store/radioStore';
import { useQuickMessagesStore } from '../../store/quickMessagesStore';
import { useDMRRadioIDsStore } from '../../store/dmrRadioIdsStore';
import { useQuickContactsStore } from '../../store/quickContactsStore';
import { useRXGroupsStore } from '../../store/rxGroupsStore';
import { getCapabilitiesForModel } from '../../radios/capabilities';
import { validateCodeplugForWrite } from '../../services/validation/codeplugValidator';
// Codeplug export/import are lazy loaded when needed
import { useRadioConnection } from '../../hooks/useRadioConnection';
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
  const { radioInfo } = useRadioStore();
  const { messages, setMessages } = useQuickMessagesStore();
  const { radioIds: dmrRadioIds, setRadioIds } = useDMRRadioIDsStore();
  const { contacts: quickContacts, setContacts: setQuickContacts } = useQuickContactsStore();
  const { groups: rxGroups, setGroups: setRXGroups } = useRXGroupsStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { readFromRadio, writeChannelsToRadio, isConnecting, error, readSteps, writeChannelsSteps } = useRadioConnection();
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [currentStep, setCurrentStep] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [isWriting, setIsWriting] = useState(false);
  const [lastOperationMode, setLastOperationMode] = useState<'read' | 'write' | null>(null);
  const [writeWarningOpen, setWriteWarningOpen] = useState(false);
  const [writeWarningMessage, setWriteWarningMessage] = useState('');
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertMessage, setAlertMessage] = useState('');
  const webSerialSupported = isWebSerialSupported();

  const handleImport = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    setImportError(null);
    setImportSuccess(null);
    
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
      setMessages(codeplugData.messages ?? []);
      setRadioIds(codeplugData.radioIds ?? []);
      setQuickContacts(codeplugData.quickContacts ?? []);
      setRXGroups(codeplugData.rxGroups ?? []);
      
      setImportSuccess(
        `Successfully imported: ${codeplugData.channels.length} channels, ` +
        `${codeplugData.zones.length} zones, ${codeplugData.scanLists.length} scan lists, ` +
        `${codeplugData.contacts.length} contacts`
      );
      
      // Show success message briefly
      setTimeout(() => setImportSuccess(null), 5000);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Failed to import codeplug');
      setTimeout(() => setImportError(null), 5000);
    }
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleExport = async () => {
    const codeplugData = {
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
      radioIds,
      quickContacts,
      rxGroups,
      exportDate: new Date().toISOString(),
      version: '1.0.0',
    };
    // Lazy load codeplug export when needed
    const { exportCodeplug } = await import('../../services/codeplugExport');
    await exportCodeplug(codeplugData);
  };

  const handleRead = async () => {
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
      });
      
      setConnectionError(null);
      setLastOperationMode(null);
      setTimeout(() => {
        setProgress(0);
        setProgressMessage('');
        setCurrentStep('');
      }, 2000);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      const displayError = errorMessage;
      setConnectionError(displayError);
      setProgress(0);
      setProgressMessage('Connection failed');
    }
  };

  const handleRetry = () => {
    if (lastOperationMode === 'write') {
      handleWrite();
    } else {
      window.location.reload();
    }
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
      setAlertMessage('No data to write (channels, zones, or scan lists)');
      setAlertOpen(true);
      return;
    }
    // Run radio-specific validations only when model is known; combine with experimental warning in one modal
    const caps = getCapabilitiesForModel(radioInfo?.model);
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
          </div>
          <div className="w-px h-6 bg-neon-cyan bg-opacity-30" />
          <Button
            variant="primary"
            data-action="read-from-radio"
            onClick={handleRead}
            disabled={isConnecting || !webSerialSupported}
            className={!webSerialSupported ? 'opacity-50 cursor-not-allowed' : ''}
            title={!webSerialSupported ? 'Web Serial API not supported. Please use Chrome, Edge, Opera, or Brave.' : 'Read codeplug from connected radio'}
          >
            {isConnecting ? 'Reading...' : 'Read from Radio'}
          </Button>
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
          {importError && (
            <span className="text-red-400 text-xs ml-2">{importError}</span>
          )}
          {importSuccess && (
            <span className="text-green-400 text-xs ml-2">{importSuccess}</span>
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
        onClose={() => setAlertOpen(false)}
        title="Notice"
        message={alertMessage}
        confirmLabel="OK"
        variant="alert"
      />
    </>
  );
};
