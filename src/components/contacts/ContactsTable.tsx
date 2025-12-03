import React from 'react';
import { useContactsStore } from '../../store/contactsStore';

export const ContactsTable: React.FC = () => {
  const { contacts, deleteContact } = useContactsStore();

  if (contacts.length === 0) {
    return (
      <div className="bg-deep-gray rounded-lg border border-neon-cyan p-8 text-center">
        <p className="text-cool-gray mb-4">No DMR contacts loaded</p>
        <p className="text-cool-gray text-sm">Use Import to load contacts from CSV or connect to a radio to read contacts</p>
      </div>
    );
  }

  return (
    <div className="bg-deep-gray rounded-lg border border-neon-cyan overflow-x-auto">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="bg-dark-charcoal border-b border-neon-cyan">
            <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[60px]">ID</th>
            <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[150px]">Name</th>
            <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[100px]">DMR ID</th>
            <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[100px]">Call Sign</th>
            <th className="px-2 py-2 text-center text-neon-cyan font-bold min-w-[60px]">Actions</th>
          </tr>
        </thead>
        <tbody>
          {contacts.map((contact) => (
            <tr
              key={contact.id}
              className="border-b border-neon-cyan border-opacity-20 hover:bg-deep-gray hover:bg-opacity-50 transition-colors"
            >
              <td className="px-2 py-2 text-white text-sm font-medium">{contact.id}</td>
              <td className="px-2 py-2 text-white">{contact.name}</td>
              <td className="px-2 py-2 text-white text-center">{contact.dmrId}</td>
              <td className="px-2 py-2 text-white">{contact.callSign || '-'}</td>
              <td className="px-2 py-2 text-center">
                <button
                  onClick={() => deleteContact(contact.id)}
                  className="px-2 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700"
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

