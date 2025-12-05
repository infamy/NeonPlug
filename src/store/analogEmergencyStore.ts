import { create } from 'zustand';
import type { AnalogEmergency } from '../models';

interface AnalogEmergencyState {
  systems: AnalogEmergency[];
  setSystems: (systems: AnalogEmergency[]) => void;
  updateSystem: (index: number, updates: Partial<AnalogEmergency>) => void;
  addSystem: (system: AnalogEmergency) => void;
  deleteSystem: (index: number) => void;
}

export const useAnalogEmergencyStore = create<AnalogEmergencyState>((set) => ({
  systems: [],
  setSystems: (systems) => set({ systems }),
  updateSystem: (index, updates) =>
    set((state) => ({
      systems: state.systems.map((s, i) => (i === index ? { ...s, ...updates } : s)),
    })),
  addSystem: (system) =>
    set((state) => ({
      systems: [...state.systems, system],
    })),
  deleteSystem: (index) =>
    set((state) => ({
      systems: state.systems.filter((_, i) => i !== index),
    })),
}));


