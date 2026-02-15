import { create } from 'zustand';
import type { EncryptionKey } from '../models/EncryptionKey';

interface EncryptionKeysState {
  keys: EncryptionKey[];
  keysLoaded: boolean;
  setKeys: (keys: EncryptionKey[]) => void;
  setKeysLoaded: (loaded: boolean) => void;
  clearKeys: () => void;
  updateKey: (entryNumber: number, updates: Partial<EncryptionKey>) => void;
  addKey: (key: EncryptionKey) => void;
  deleteKey: (entryNumber: number) => void;
}

export const useEncryptionKeysStore = create<EncryptionKeysState>((set) => ({
  keys: [],
  keysLoaded: false,
  setKeys: (keys) => set({ keys, keysLoaded: true }),
  setKeysLoaded: (loaded) => set({ keysLoaded: loaded }),
  clearKeys: () => set({ keys: [], keysLoaded: false }),
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

