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
// XLSX functions will be lazy loaded when needed
import { useRadioConnection } from '../../hooks/useRadioConnection';
import { ReadProgressModal } from '../ui/ReadProgressModal';
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
      // Lazy load XLSX library only when needed
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
      exportDate: new Date().toISOString(),
      version: '1.0.0',
    };
    // Lazy load XLSX library only when needed
    const { exportCodeplug } = await import('../../services/codeplugExport');
    exportCodeplug(codeplugData);
  };

  const handleRead = async () => {
    try {
      // Clear any previous error immediately
      setConnectionError(null);
      setLastOperationMode('read');
      // Show progress modal immediately with initial state
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
      
      // Success - clear error and close modal after a moment
      setConnectionError(null);
      setLastOperationMode(null);
      setTimeout(() => {
        setProgress(0);
        setProgressMessage('');
        setCurrentStep('');
      }, 2000);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      
      // Format error message for display - use the error message as-is since we've improved them
      // The error messages from protocol/connection are now user-friendly
      let displayError = errorMessage;
      
      // Set error state - modal will stay open to show error
      setConnectionError(displayError);
      // Reset progress state to show error clearly
      setProgress(0);
      setProgressMessage('Connection failed');
      // Don't close modal - let user see error and retry
    }
  };

  const handleRetry = () => {
    // For write operations, restart the write process
    // For read operations, refresh the page to reset everything
    if (lastOperationMode === 'write') {
      // Restart write process
      handleWrite();
    } else {
      // Read operation - refresh page to reset everything
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

  const showWriteWarning = (): boolean => {
    const warningMessage = 
      '⚠️ EXPERIMENTAL FEATURE WARNING ⚠️\n\n' +
      'Writing to the radio is an EXPERIMENTAL feature and is used at your own risk.\n\n' +
      'IMPORTANT: Before proceeding, ensure that:\n' +
      '• Allow Reset is ENABLED via the Baofeng CPS\n' +
      '• You have done a radio read with the Baofeng CPS and saved that as a backup\n' +
      '• You have a backup of your current codeplug\n' +
      '• You understand that this operation may modify your radio\'s memory\n\n' +
      'Do you want to continue?';
    
    return window.confirm(warningMessage);
  };

  const handleWrite = async () => {
    if (channels.length === 0 && zones.length === 0 && scanLists.length === 0) {
      alert('No data to write (channels, zones, or scan lists)');
      return;
    }

    if (!showWriteWarning()) {
      return;
    }

    setIsWriting(true);
    setLastOperationMode('write');
    try {
      // Clear any previous error immediately
      setConnectionError(null);
      // Show progress modal immediately with initial state
      setProgress(0);
      setProgressMessage('Selecting port...');
      setCurrentStep('Selecting port');
      
      // Write channels, zones, and scan lists together
      await writeChannelsToRadio(channels, zones, scanLists, (progress, message, step) => {
        setProgress(progress);
        setProgressMessage(message);
        if (step) {
          setCurrentStep(step);
        }
      });
      
      // Success - clear error and close modal after a moment
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
      
      // Format error message for display - use the error message as-is since we've improved them
      // The error messages from protocol/connection are now user-friendly
      let displayError = errorMessage;
      
      // Set error state - modal will stay open to show error
      setConnectionError(displayError);
      // Reset progress state to show error clearly
      setProgress(0);
      setProgressMessage('Write failed');
      setIsWriting(false);
      // Don't close modal - let user see error and retry
    }
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls"
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
              className="px-4 py-2 bg-neon-purple text-white font-semibold rounded hover:bg-neon-purple hover:bg-opacity-80 transition-all shadow-lg hover:shadow-neon-purple border border-neon-purple border-opacity-50 active:scale-95"
              title="Import codeplug from XLSX file"
            >
              Import
            </button>
            <button
              onClick={handleExport}
              className="px-4 py-2 bg-neon-cyan text-deep-gray font-semibold rounded hover:bg-neon-cyan hover:bg-opacity-80 transition-all shadow-lg hover:shadow-glow-cyan border border-neon-cyan border-opacity-50 active:scale-95"
              title="Export codeplug to XLSX file"
            >
              Export
            </button>
          </div>
          <div className="w-px h-6 bg-neon-cyan bg-opacity-30" />
          <Button
            variant="primary"
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
            disabled={isConnecting || isWriting || (channels.length === 0 && zones.length === 0 && scanLists.length === 0) || !webSerialSupported}
            className={!webSerialSupported ? 'opacity-50 cursor-not-allowed' : ''}
            title={!webSerialSupported ? 'Web Serial API not supported. Please use Chrome, Edge, Opera, or Brave.' : 'Write codeplug to connected radio'}
            glow={webSerialSupported}
          >
            {isWriting ? 'Writing...' : 'Write to Radio'}
          </Button>
          {error && (
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
    </>
  );
};

