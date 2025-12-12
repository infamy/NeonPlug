import React, { useState, useMemo } from 'react';
import { useContactsStore } from '../../store/contactsStore';

const CONTACTS_PER_PAGE = 100;

export const ContactsTable: React.FC = () => {
  const { contacts, deleteContact } = useContactsStore();
  const [currentPage, setCurrentPage] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');

  // Filter contacts based on search query
  const filteredContacts = useMemo(() => {
    if (!searchQuery.trim()) {
      return contacts;
    }
    
    const query = searchQuery.toLowerCase().trim();
    return contacts.filter(contact => 
      contact.name.toLowerCase().includes(query) ||
      contact.dmrId.toString().includes(query) ||
      (contact.callSign && contact.callSign.toLowerCase().includes(query))
    );
  }, [contacts, searchQuery]);

  const paginatedContacts = useMemo(() => {
    const startIndex = currentPage * CONTACTS_PER_PAGE;
    const endIndex = startIndex + CONTACTS_PER_PAGE;
    return filteredContacts.slice(startIndex, endIndex);
  }, [filteredContacts, currentPage]);

  const totalPages = Math.ceil(filteredContacts.length / CONTACTS_PER_PAGE);

  // Reset to first page when search changes
  React.useEffect(() => {
    setCurrentPage(0);
  }, [searchQuery]);

  if (contacts.length === 0) {
    return (
      <div className="bg-deep-gray rounded-lg border border-neon-cyan p-8 text-center">
        <p className="text-cool-gray mb-4">No DMR contacts loaded</p>
        <p className="text-cool-gray text-sm">Use Import to load contacts from CSV or connect to a radio to read contacts</p>
      </div>
    );
  }

  return (
    <div className="bg-deep-gray rounded-lg border border-neon-cyan overflow-x-auto flex flex-col h-full">
      {/* Search Bar */}
      <div className="p-3 border-b border-neon-cyan border-opacity-20 flex-shrink-0">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, DMR ID, or call sign..."
            className="flex-1 px-3 py-2 bg-dark-charcoal border border-neon-cyan border-opacity-30 rounded text-white text-sm focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="px-3 py-2 text-cool-gray hover:text-white border border-neon-cyan border-opacity-30 rounded text-sm transition-colors"
            >
              Clear
            </button>
          )}
        </div>
        {searchQuery && (
          <div className="mt-2 text-xs text-cool-gray">
            Found {filteredContacts.length.toLocaleString()} contact{filteredContacts.length !== 1 ? 's' : ''} matching "{searchQuery}"
          </div>
        )}
      </div>
      
      <div className="flex-1 overflow-y-auto">
        {filteredContacts.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-cool-gray mb-2">No contacts found</p>
            {searchQuery && (
              <p className="text-cool-gray text-sm">No contacts match "{searchQuery}"</p>
            )}
          </div>
        ) : (
          <table className="w-full border-collapse text-xs">
            <thead className="sticky top-0 bg-dark-charcoal z-10">
              <tr className="bg-dark-charcoal border-b border-neon-cyan">
                <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[150px]">Name</th>
                <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[100px]">DMR ID</th>
                <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[100px]">Call Sign</th>
                <th className="px-2 py-2 text-center text-neon-cyan font-bold min-w-[60px]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedContacts.map((contact) => (
                <tr
                  key={contact.id}
                  className="border-b border-neon-cyan border-opacity-20 hover:bg-deep-gray hover:bg-opacity-50 transition-colors"
                >
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
        )}
      </div>
      {filteredContacts.length > 0 && totalPages > 1 && (
        <div className="mt-2 pt-2 border-t border-neon-cyan border-opacity-20 flex items-center justify-between text-sm text-cool-gray px-2 pb-2">
          <span>
            Showing {currentPage * CONTACTS_PER_PAGE + 1}-{Math.min((currentPage + 1) * CONTACTS_PER_PAGE, filteredContacts.length)} of {filteredContacts.length.toLocaleString()} contact{filteredContacts.length !== 1 ? 's' : ''}
            {searchQuery && ` (${contacts.length.toLocaleString()} total)`}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(prev => Math.max(0, prev - 1))}
              disabled={currentPage === 0}
              className="px-3 py-1 bg-deep-gray border border-neon-cyan border-opacity-30 rounded hover:bg-opacity-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              Previous
            </button>
            <span>
              Page {currentPage + 1} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage(prev => Math.min(totalPages - 1, prev + 1))}
              disabled={currentPage >= totalPages - 1}
              className="px-3 py-1 bg-deep-gray border border-neon-cyan border-opacity-30 rounded hover:bg-opacity-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

