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
import { exportCodeplug, importCodeplug } from '../../services/codeplugExport';
import { useRadioConnection } from '../../hooks/useRadioConnection';
import { ReadProgressModal } from '../ui/ReadProgressModal';

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
  const { readFromRadio, isConnecting, error, readSteps } = useRadioConnection();
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [currentStep, setCurrentStep] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [isWriting, setIsWriting] = useState(false);

  const handleImport = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    setImportError(null);
    setImportSuccess(null);
    
    try {
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

  const handleExport = () => {
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
    exportCodeplug(codeplugData);
  };

  const handleRead = async () => {
    try {
      // Clear any previous error immediately
      setConnectionError(null);
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
      setTimeout(() => {
        setProgress(0);
        setProgressMessage('');
        setCurrentStep('');
      }, 2000);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      
      // Format error message for display
      let displayError = errorMessage;
      if (errorMessage.includes('timed out') || errorMessage.includes('timeout')) {
        displayError = `Connection timed out: ${errorMessage}`;
      } else if (errorMessage.includes('Radio not found')) {
        displayError = `Radio not found: ${errorMessage}`;
      }
      
      // Set error state - modal will stay open to show error
      setConnectionError(displayError);
      // Reset progress state to show error clearly
      setProgress(0);
      setProgressMessage('Connection failed');
      // Don't close modal - let user see error and retry
    }
  };

  const handleRetry = () => {
    // Force page refresh to reset everything
    window.location.reload();
  };

  const handleCloseModal = () => {
    setConnectionError(null);
    setProgress(0);
    setProgressMessage('');
    setCurrentStep('');
  };

  const handleWrite = async () => {
    setIsWriting(true);
    try {
      // Clear any previous error immediately
      setConnectionError(null);
      // Show progress modal immediately with initial state
      setProgress(0);
      setProgressMessage('Selecting port...');
      setCurrentStep('Selecting port');
      
      // Import protocol
      const { DM32UVProtocol } = await import('../../protocol/dm32uv/protocol');
      
      // Create protocol instance
      const protocol = new DM32UVProtocol();
      
      // Set up progress callback
      protocol.onProgress = (progress, message) => {
        setProgress(progress);
        setProgressMessage(message);
      };
      
      // Connect to radio
      setProgress(5);
      setProgressMessage('Please select a serial port in the browser dialog...');
      await protocol.connect();
      
      setProgress(10);
      setProgressMessage('Reading radio information...');
      await protocol.getRadioInfo();
      
      // Write all data
      setProgress(20);
      setProgressMessage('Writing data to radio...');
      await protocol.writeAllData(channels, zones, scanLists);
      
      // Disconnect
      await protocol.disconnect();
      
      // Success - clear error and close modal after a moment
      setConnectionError(null);
      setProgress(100);
      setProgressMessage('Successfully wrote all data to radio!');
      setTimeout(() => {
        setProgress(0);
        setProgressMessage('');
        setCurrentStep('');
      }, 2000);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      
      // Format error message for display
      let displayError = errorMessage;
      if (errorMessage.includes('timed out') || errorMessage.includes('timeout')) {
        displayError = `Write timed out: ${errorMessage}`;
      } else if (errorMessage.includes('Radio not found')) {
        displayError = `Radio not found: ${errorMessage}`;
      }
      
      // Set error state - modal will stay open to show error
      setConnectionError(displayError);
      // Reset progress state to show error clearly
      setProgress(0);
      setProgressMessage('Write failed');
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
            disabled={isConnecting}
          >
            {isConnecting ? 'Reading...' : 'Read from Radio'}
          </Button>
          <Button
            variant="primary"
            onClick={handleWrite}
            disabled={isConnecting || isWriting}
            glow
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
        currentStep={currentStep || readSteps[0]}
        steps={readSteps}
        error={connectionError}
        onRetry={handleRetry}
        onClose={handleCloseModal}
      />
    </>
  );
};

