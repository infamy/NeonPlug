import { create } from 'zustand';
import type { DigitalEmergency, DigitalEmergencyConfig } from '../models';

interface DigitalEmergencyState {
  systems: DigitalEmergency[];
  config: DigitalEmergencyConfig | null;
  setSystems: (systems: DigitalEmergency[]) => void;
  setConfig: (config: DigitalEmergencyConfig | null) => void;
  updateSystem: (index: number, updates: Partial<DigitalEmergency>) => void;
  updateConfig: (updates: Partial<DigitalEmergencyConfig>) => void;
}

export const useDigitalEmergencyStore = create<DigitalEmergencyState>((set) => ({
  systems: [],
  config: null,
  setSystems: (systems) => set({ systems }),
  setConfig: (config) => set({ config }),
  updateSystem: (index, updates) =>
    set((state) => ({
      systems: state.systems.map((s, i) => (i === index ? { ...s, ...updates } : s)),
    })),
  updateConfig: (updates) =>
    set((state) => ({
      config: state.config ? { ...state.config, ...updates } : null,
    })),
}));



