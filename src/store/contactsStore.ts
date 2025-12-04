import { create } from 'zustand';
import type { Contact } from '../models/Contact';

interface ContactsState {
  contacts: Contact[];
  selectedContact: number | null;
  contactsLoaded: boolean; // Track if contacts have been read from radio
  setContacts: (contacts: Contact[]) => void;
  addContact: (contact: Contact) => void;
  updateContact: (id: number, contact: Partial<Contact>) => void;
  deleteContact: (id: number) => void;
  setSelectedContact: (id: number | null) => void;
  setContactsLoaded: (loaded: boolean) => void;
}

export const useContactsStore = create<ContactsState>((set) => ({
  contacts: [],
  selectedContact: null,
  contactsLoaded: false,
  setContacts: (contacts) => set({ contacts, contactsLoaded: true }),
  addContact: (contact) => set((state) => ({
    contacts: [...state.contacts, contact]
  })),
  updateContact: (id, updates) => set((state) => ({
    contacts: state.contacts.map(c => 
      c.id === id ? { ...c, ...updates } : c
    )
  })),
  deleteContact: (id) => set((state) => ({
    contacts: state.contacts.filter(c => c.id !== id)
  })),
  setSelectedContact: (id) => set({ selectedContact: id }),
  setContactsLoaded: (loaded) => set({ contactsLoaded: loaded }),
}));

