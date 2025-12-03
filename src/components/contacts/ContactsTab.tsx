import React from 'react';
import { useContactsStore } from '../../store/contactsStore';
import { ContactsTable } from './ContactsTable';

export const ContactsTab: React.FC = () => {
  const { contacts } = useContactsStore();

  return (
    <div className="h-full">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-2xl font-bold text-neon-cyan">DMR Contacts</h2>
        <div className="text-cool-gray">
          {contacts.length} contact{contacts.length !== 1 ? 's' : ''}
        </div>
      </div>
      <div className="mb-4 text-cool-gray text-sm">
        DMR contacts are primarily imported from CSV or read from the radio. Use Import to load contacts.
      </div>
      <ContactsTable />
    </div>
  );
};

