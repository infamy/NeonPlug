import React, { useRef, useState } from 'react';
import { Button } from '../ui/Button';
import { useChannelsStore } from '../../store/channelsStore';
import { useContactsStore } from '../../store/contactsStore';
import { exportChannelsToCSV, exportContactsToCSV, downloadCSV, importChannelsFromCSV, importContactsFromCSV } from '../../services/csv';
import { useRadioConnection } from '../../hooks/useRadioConnection';
import { ReadProgressModal } from '../ui/ReadProgressModal';

export const Toolbar: React.FC = () => {
  const { channels, setChannels } = useChannelsStore();
  const { contacts, setContacts } = useContactsStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { readFromRadio, isConnecting, error } = useRadioConnection();
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [currentStep, setCurrentStep] = useState('');
  
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

    const text = await file.text();
    const fileName = file.name.toLowerCase();

    if (fileName.includes('channel')) {
      const result = importChannelsFromCSV(text);
      if (result.success && result.channels) {
        setChannels(result.channels);
        alert(`Successfully imported ${result.channels.length} channels`);
      } else {
        alert(`Import failed: ${result.errors?.join(', ') || 'Unknown error'}`);
      }
    } else if (fileName.includes('contact')) {
      const result = importContactsFromCSV(text);
      if (result.success && result.contacts) {
        setContacts(result.contacts);
        alert(`Successfully imported ${result.contacts.length} contacts`);
      } else {
        alert(`Import failed: ${result.errors?.join(', ') || 'Unknown error'}`);
      }
    } else {
      alert('File name must contain "channel" or "contact" to determine import type');
    }

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleExport = () => {
    if (channels.length > 0) {
      const csv = exportChannelsToCSV(channels);
      downloadCSV(csv, 'channels.csv');
    }
    if (contacts.length > 0) {
      const csv = exportContactsToCSV(contacts);
      downloadCSV(csv, 'contacts.csv');
    }
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
        accept=".csv"
        onChange={handleFileSelect}
        className="hidden"
      />
      <div className="bg-deep-gray border-b border-deep-gray">
        <div className="px-6 py-3 flex items-center space-x-3">
          <div className="flex-1" />
          <Button variant="secondary" onClick={handleImport}>
            Import
          </Button>
          <Button variant="secondary" onClick={handleExport}>
            Export
          </Button>
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

