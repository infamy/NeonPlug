import { create } from 'zustand';
import type { VFOSettings } from '../models';

interface VFOSettingsState {
  settings: VFOSettings | null;
  setSettings: (settings: VFOSettings | null) => void;
  updateSettings: (updates: Partial<VFOSettings>) => void;
}

export const useVFOSettingsStore = create<VFOSettingsState>((set) => ({
  settings: null,
  setSettings: (settings) => set({ settings }),
  updateSettings: (updates) =>
    set((state) => ({
      settings: state.settings ? { ...state.settings, ...updates } : null,
    })),
}));

