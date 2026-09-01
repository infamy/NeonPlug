import React, { useState, useMemo } from 'react';
import { formatPlural } from '../../utils/formatPlural';
import { useContactsStore } from '../../store/contactsStore';
import { EmptyState } from '../ui/EmptyState';
import { Card } from '../ui/Card';

const CONTACTS_PER_PAGE = 100;

export const ContactsTable: React.FC = () => {
  const { contacts, deleteContact, updateContact } = useContactsStore();
  const [currentPage, setCurrentPage] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [friendsOnly, setFriendsOnly] = useState(false);

  // The radio has the concept only if a read populated it. Undefined on every
  // other radio, and on an unread codeplug — in which case the column and the
  // filter are both hidden rather than shown empty.
  const supportsFriends = contacts.some((c) => c.isFriend !== undefined);
  const friendCount = contacts.filter((c) => c.isFriend).length;

  // Filter contacts based on search query
  const filteredContacts = useMemo(() => {
    if (!searchQuery.trim()) {
      return contacts;
    }
    
    const query = searchQuery.toLowerCase().trim();
    return contacts.filter(contact => 
      contact.name.toLowerCase().includes(query) ||
      contact.dmrId.toString().includes(query) ||
      (contact.callSign && contact.callSign.toLowerCase().includes(query)) ||
      (contact.city && contact.city.toLowerCase().includes(query)) ||
      (contact.province && contact.province.toLowerCase().includes(query)) ||
      (contact.country && contact.country.toLowerCase().includes(query)) ||
      (contact.remark && contact.remark.toLowerCase().includes(query))
    );
  }, [contacts, searchQuery]);

  const visibleContacts = useMemo(
    () => (friendsOnly ? filteredContacts.filter((c) => c.isFriend) : filteredContacts),
    [filteredContacts, friendsOnly]
  );

  const paginatedContacts = useMemo(() => {
    const startIndex = currentPage * CONTACTS_PER_PAGE;
    const endIndex = startIndex + CONTACTS_PER_PAGE;
    return visibleContacts.slice(startIndex, endIndex);
  }, [visibleContacts, currentPage]);

  const totalPages = Math.ceil(visibleContacts.length / CONTACTS_PER_PAGE);

  // Reset to first page when search changes
  React.useEffect(() => {
    setCurrentPage(0);
  }, [searchQuery, friendsOnly]);

  if (contacts.length === 0) {
    return (
      <Card>
        <EmptyState
          message="No DMR contacts loaded"
          secondary="Use Import to load contacts from CSV or connect to a radio to read contacts"
        />
      </Card>
    );
  }

  return (
    <Card padding="none" className="overflow-x-auto flex flex-col h-full">
      {/* Search Bar */}
      <div className="p-3 border-b border-neon-cyan border-opacity-20 flex-shrink-0">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, DMR ID, call sign, city, province, country, or remark..."
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
          {/* Searching 160,000 contacts to tick two of them is the whole
              workflow, so the friends filter sits next to the search rather
              than somewhere you have to go and find. */}
          {supportsFriends && (
            <button
              onClick={() => setFriendsOnly((v) => !v)}
              className={`px-3 py-2 rounded text-sm border whitespace-nowrap transition-colors ${
                friendsOnly
                  ? 'bg-neon-cyan bg-opacity-20 border-neon-cyan text-neon-cyan'
                  : 'border-neon-cyan border-opacity-30 text-cool-gray hover:text-neon-cyan'
              }`}
              title="Show only contacts in the radio's Friends List"
            >
              Friends <span className="opacity-70">{friendCount}</span>
            </button>
          )}
        </div>
        {(searchQuery || friendsOnly) && (
          <div className="mt-2 text-xs text-cool-gray">
            Showing {visibleContacts.length.toLocaleString()}{' '}
            {formatPlural(visibleContacts.length, 'contact')}
            {searchQuery && ` matching "${searchQuery}"`}
            {friendsOnly && ' in the Friends List'}
          </div>
        )}
      </div>
      
      <div className="flex-1 overflow-y-auto">
        {visibleContacts.length === 0 ? (
          <EmptyState
            message="No contacts found"
            secondary={searchQuery ? `No contacts match "${searchQuery}"` : undefined}
          />
        ) : (
          <table className="w-full border-collapse text-xs">
            <thead className="sticky top-0 bg-dark-charcoal z-10">
              <tr className="bg-dark-charcoal border-b border-neon-cyan">
                {supportsFriends && (
                  <th className="px-2 py-2 text-center text-neon-cyan font-bold w-16">Friend</th>
                )}
                <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[150px]">Name</th>
                <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[100px]">TG/DMR ID</th>
                <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[100px]">Callsign</th>
                <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[100px]">City</th>
                <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[100px]">Province</th>
                <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[100px]">Country</th>
                <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[150px]">Remark</th>
                <th className="px-2 py-2 text-center text-neon-cyan font-bold min-w-[80px]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedContacts.map((contact) => (
                <tr
                  key={contact.id}
                  className="border-b border-neon-cyan border-opacity-20 hover:bg-deep-gray hover:bg-opacity-50 transition-colors"
                >
                  {supportsFriends && (
                    <td className="px-2 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={contact.isFriend === true}
                        onChange={(e) => updateContact(contact.id, { isFriend: e.target.checked })}
                        className="checkbox-theme"
                        title="Show this contact in the radio's Friends List"
                      />
                    </td>
                  )}
                  <td className="px-2 py-2 text-white">{contact.name}</td>
                  <td className="px-2 py-2 text-white text-center">{contact.dmrId}</td>
                  <td className="px-2 py-2 text-white">{contact.callSign || '-'}</td>
                  <td className="px-2 py-2 text-white">{contact.city || '-'}</td>
                  <td className="px-2 py-2 text-white">{contact.province || '-'}</td>
                  <td className="px-2 py-2 text-white">{contact.country || '-'}</td>
                  <td className="px-2 py-2 text-white">{contact.remark || '-'}</td>
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
      {visibleContacts.length > 0 && totalPages > 1 && (
        <div className="mt-2 pt-2 border-t border-neon-cyan border-opacity-20 flex items-center justify-between text-sm text-cool-gray px-2 pb-2">
          <span>
            Showing {currentPage * CONTACTS_PER_PAGE + 1}-{Math.min((currentPage + 1) * CONTACTS_PER_PAGE, visibleContacts.length)} of {visibleContacts.length.toLocaleString()} {formatPlural(visibleContacts.length, 'contact')}
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
    </Card>
  );
};

