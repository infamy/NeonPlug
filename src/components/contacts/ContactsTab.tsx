import React, { useState } from 'react';
import { useContactsStore } from '../../store/contactsStore';
import { useRadioStore } from '../../store/radioStore';
import { useRadioConnection } from '../../hooks/useRadioConnection';
import { ContactsTable } from './ContactsTable';
import { ProgressBar } from '../ui/ProgressBar';
import { getContactCapacityWithFallback } from '../../utils/firmware';

export const ContactsTab: React.FC = () => {
  const { contacts, contactsLoaded } = useContactsStore();
  const { radioInfo } = useRadioStore();
  const { readContacts, isConnecting } = useRadioConnection();
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  
  const contactCapacity = radioInfo 
    ? getContactCapacityWithFallback(
        radioInfo.vframes.get(0x0F),
        radioInfo.firmware
      )
    : 50000;

  const handleReadContacts = async () => {
    setProgress(0);
    setProgressMessage('');
    try {
      await readContacts((progress, message) => {
        setProgress(progress);
        setProgressMessage(message);
      });
    } catch (err) {
      console.error('Error reading contacts:', err);
    } finally {
      setTimeout(() => {
        setProgress(0);
        setProgressMessage('');
      }, 2000);
    }
  };

  if (!contactsLoaded) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center max-w-md">
          <h2 className="text-2xl font-bold text-neon-cyan mb-4">Contacts Not Loaded</h2>
          <p className="text-cool-gray mb-4">
            Contacts have not been read from the radio yet. Reading contacts can take a long time
            as it requires discovering and reading contact blocks from a large memory range.
          </p>
          {radioInfo && (
            <p className="text-cool-gray mb-6 text-sm">
              Firmware: {radioInfo.firmware} - Capacity: {contactCapacity.toLocaleString()} contacts
            </p>
          )}
          <button
            onClick={handleReadContacts}
            disabled={isConnecting}
            className="px-6 py-3 bg-neon-cyan text-dark-charcoal font-semibold rounded-lg hover:bg-neon-cyan-bright transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isConnecting ? 'Reading Contacts...' : 'Read Contacts from Radio'}
          </button>
          {isConnecting && (
            <div className="mt-4">
              <ProgressBar progress={progress} message={progressMessage} />
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-2xl font-bold text-neon-cyan">DMR Contacts</h2>
        <div className="text-cool-gray">
          {contacts.length} / {contactCapacity.toLocaleString()} contact{contacts.length !== 1 ? 's' : ''}
        </div>
      </div>
      <div className="mb-4 text-cool-gray text-sm">
        DMR contacts are primarily imported from CSV or read from the radio. Use Import to load contacts.
      </div>
      <ContactsTable />
    </div>
  );
};

