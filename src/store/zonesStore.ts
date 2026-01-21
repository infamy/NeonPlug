import { create } from 'zustand';
import type { Zone } from '../models/Zone';

export interface RawZoneData {
  data: Uint8Array;
  zoneNum: number;
  offset: number;
}

interface ZonesState {
  zones: Zone[];
  selectedZone: string | null;
  rawZoneData: Map<string, RawZoneData>; // Store raw data for debug export
  setZones: (zones: Zone[]) => void;
  setRawZoneData: (rawData: Map<string, RawZoneData>) => void;
  addZone: (zone: Zone) => void;
  updateZone: (name: string, zone: Partial<Zone>) => void;
  deleteZone: (name: string) => void;
  setSelectedZone: (name: string | null) => void;
}

export const useZonesStore = create<ZonesState>((set) => ({
  zones: [],
  selectedZone: null,
  rawZoneData: new Map(),
  setZones: (zones) => set({ zones }),
  setRawZoneData: (rawData) => set({ rawZoneData: rawData }),
  addZone: (zone) => set((state) => {
    if (state.zones.length >= 250) {
      console.warn('Maximum of 250 zones allowed');
      return state;
    }
    // Enforce limit: max 64 channels per zone
    const channels = zone.channels ? zone.channels.slice(0, 64) : [];
    return {
      zones: [...state.zones, { ...zone, channels }]
    };
  }),
  updateZone: (name, updates) => set((state) => ({
    zones: state.zones.map(z => {
      if (z.name === name) {
        // Enforce limit: max 64 channels per zone
        if (updates.channels && updates.channels.length > 64) {
          updates.channels = updates.channels.slice(0, 64);
        }
        return { ...z, ...updates };
      }
      return z;
    })
  })),
  deleteZone: (name) => set((state) => ({
    zones: state.zones.filter(z => z.name !== name)
  })),
  setSelectedZone: (name) => set({ selectedZone: name }),
}));

