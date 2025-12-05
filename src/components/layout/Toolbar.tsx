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
  const { readFromRadio, isConnecting, error } = useRadioConnection();
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [currentStep, setCurrentStep] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  
  const readSteps = [
    'Selecting port',
    'Connecting to radio',
    'Reading radio information',
    'Reading channels',
    'Reading zones',
    'Reading scan lists',
    'Complete',
  ];

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
      // Show progress modal immediately
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
      
      // Keep progress at 100% for a moment
      setTimeout(() => {
        setProgress(0);
        setProgressMessage('');
        setCurrentStep('');
      }, 2000);
    } catch (err) {
      setProgress(0);
      setProgressMessage('');
      setCurrentStep('');
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      
      // If radio not found, show a user-friendly message
      if (errorMessage.includes('Radio not found')) {
        alert(`Radio not found: ${errorMessage}\n\nPlease check:\n- Radio is powered on\n- USB cable is connected\n- Correct port is selected\n\nYou can try again from the startup dialog.`);
      } else {
        alert(`Error reading from radio: ${errorMessage}`);
      }
    }
  };

  const handleWrite = () => {
    // TODO: Implement write to radio
    alert('Write to radio not yet implemented');
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
            disabled={isConnecting}
            glow
          >
            Write to Radio
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
        isOpen={isConnecting}
        progress={progress}
        message={progressMessage}
        currentStep={currentStep || readSteps[0]}
        steps={readSteps}
      />
    </>
  );
};

