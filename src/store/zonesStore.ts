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
  renameZone: (oldName: string, newName: string) => boolean;
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
  renameZone: (oldName, newName) => {
    const trimmedNewName = newName.trim();
    
    // Validate new name
    if (!trimmedNewName || trimmedNewName.length === 0) {
      return false;
    }
    if (trimmedNewName.length > 10) {
      return false;
    }
    
    // Check for duplicate names
    const state = useZonesStore.getState();
    if (state.zones.some(z => z.name === trimmedNewName && z.name !== oldName)) {
      return false;
    }
    
    // Rename the zone and update selected zone if needed
    set((state) => ({
      zones: state.zones.map(z => 
        z.name === oldName ? { ...z, name: trimmedNewName } : z
      ),
      selectedZone: state.selectedZone === oldName ? trimmedNewName : state.selectedZone
    }));
    
    return true;
  },
  deleteZone: (name) => set((state) => ({
    zones: state.zones.filter(z => z.name !== name)
  })),
  setSelectedZone: (name) => set({ selectedZone: name }),
}));

