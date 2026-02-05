import { create } from 'zustand';
import type { QuickContact } from '../models/QuickContact';

const DEFAULT_TALK_GROUPS_MAX = 800;

interface QuickContactsState {
  contacts: QuickContact[];
  contactsLoaded: boolean;
  maxTalkGroups: number;
  setContacts: (contacts: QuickContact[]) => void;
  setContactsLoaded: (loaded: boolean) => void;
  setMaxTalkGroups: (max: number) => void;
  updateContact: (index: number, contact: Partial<QuickContact>) => void;
  addContact: (contact: Omit<QuickContact, 'index' | 'offset' | 'rawData' | 'hasHeader'>) => void;
  deleteContact: (index: number) => void;
}

// Helper function to clean contact names (remove non-ASCII printable characters)
// Allows spaces (0x20) - only filters out control characters and non-printable chars
const cleanContactName = (name: string): string => {
  return name
    .split('')
    .filter(char => {
      const code = char.charCodeAt(0);
      return code >= 0x20 && code <= 0x7E; // Only ASCII printable characters (includes space 0x20)
    })
    .join('');
  // Note: Removed .trim() to allow leading/trailing spaces if user wants them
};

export const useQuickContactsStore = create<QuickContactsState>((set, get) => ({
  contacts: [],
  contactsLoaded: false,
  maxTalkGroups: DEFAULT_TALK_GROUPS_MAX,
  setContacts: (contacts) => set({ 
    contacts: contacts.map(c => ({ ...c, name: cleanContactName(c.name) })), 
    contactsLoaded: true 
  }),
  setContactsLoaded: (loaded) => set({ contactsLoaded: loaded }),
  setMaxTalkGroups: (max) => set({ maxTalkGroups: max }),
  updateContact: (index, updates) => {
    const contacts = get().contacts.map(contact => {
      if (contact.index === index) {
        const updated = { ...contact, ...updates };
        // Clean name if it was updated
        if (updates.name) {
          updated.name = cleanContactName(updated.name);
        }
        return updated;
      }
      return contact;
    });
    set({ contacts });
  },
  addContact: (newContact) => {
    const { contacts, maxTalkGroups } = get();
    const max = maxTalkGroups ?? DEFAULT_TALK_GROUPS_MAX;
    if (contacts.length >= max) {
      console.warn(`Maximum of ${max} talk groups allowed`);
      return;
    }
    // New index is simply the next position (array length + 1)
    // This ensures indexes are always sequential: 1, 2, 3, ...
    const newIndex = contacts.length + 1;
    const contact: QuickContact = {
      ...newContact,
      name: cleanContactName(newContact.name),
      index: newIndex,
      offset: 0, // Will be calculated when writing
      hasHeader: newIndex === 1, // Only first contact has header
      rawData: new Uint8Array(0), // Will be generated when writing
    };
    set({ contacts: [...contacts, contact] });
  },
  deleteContact: (index) => {
    const contacts = get().contacts.filter(contact => contact.index !== index);
    // Re-index remaining contacts
    const reindexed = contacts.map((contact, idx) => ({
      ...contact,
      index: idx + 1,
      hasHeader: idx === 0, // First contact after deletion gets header
    }));
    set({ contacts: reindexed });
  },
}));
