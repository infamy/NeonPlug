import { create } from 'zustand';
import type { RadioSettings } from '../models/RadioSettings';

interface RadioSettingsState {
  settings: RadioSettings | null;
  setSettings: (settings: RadioSettings | null) => void;
  updateSettings: (updates: Partial<RadioSettings>) => void;
}

export const useRadioSettingsStore = create<RadioSettingsState>((set) => ({
  settings: null,
  setSettings: (settings) => set({ settings }),
  updateSettings: (updates) =>
    set((state) => ({
      settings: state.settings ? { ...state.settings, ...updates } : null,
    })),
}));

