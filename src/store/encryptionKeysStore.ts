import { create } from 'zustand';
import type { EncryptionKey } from '../models/EncryptionKey';

interface EncryptionKeysState {
  keys: EncryptionKey[];
  setKeys: (keys: EncryptionKey[]) => void;
  updateKey: (entryNumber: number, updates: Partial<EncryptionKey>) => void;
  addKey: (key: EncryptionKey) => void;
  deleteKey: (entryNumber: number) => void;
}

export const useEncryptionKeysStore = create<EncryptionKeysState>((set) => ({
  keys: [],
  setKeys: (keys) => set({ keys }),
  updateKey: (entryNumber, updates) =>
    set((state) => ({
      keys: state.keys.map((k) =>
        k.entryNumber === entryNumber ? { ...k, ...updates } : k
      ),
    })),
  addKey: (key) =>
    set((state) => ({
      keys: [...state.keys, key],
    })),
  deleteKey: (entryNumber) =>
    set((state) => ({
      keys: state.keys.filter((k) => k.entryNumber !== entryNumber),
    })),
}));

