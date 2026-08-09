import { create } from 'zustand';
import type { Zone } from '../models/Zone';

export interface RawZoneData {
  data: Uint8Array;
  zoneNum: number;
  offset: number;
}

interface ZonesState {
  zones: Zone[];
  selectedZoneId: string | null;
  rawZoneData: Map<string, RawZoneData>; // Store raw data for debug export
  setZones: (zones: Zone[]) => void;
  setRawZoneData: (rawData: Map<string, RawZoneData>) => void;
  addZone: (zone: Omit<Zone, 'id'>) => void;
  /** Append multiple zones atomically against the latest state (safe against concurrent/rapid add actions) */
  addZones: (zones: Zone[]) => void;
  updateZone: (id: string, zone: Partial<Omit<Zone, 'id'>>) => void;
  renameZone: (id: string, newName: string) => boolean;
  deleteZone: (id: string) => void;
  setSelectedZoneId: (id: string | null) => void;
  // Legacy compatibility
  setSelectedZone: (name: string | null) => void;
  selectedZone: string | null;
}

export const useZonesStore = create<ZonesState>((set, get) => ({
  zones: [],
  selectedZoneId: null,
  selectedZone: null, // Legacy compatibility
  rawZoneData: new Map(),
  setZones: (zones) => {
    // Ensure all zones have IDs - generate if missing
    const zonesWithIds = zones.map((z, index) => ({
      ...z,
      id: z.id || `zone-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 9)}`
    }));
    set({ zones: zonesWithIds });
  },
  setRawZoneData: (rawData) => set({ rawZoneData: rawData }),
  addZones: (zones) => set((state) => {
    const zonesWithIds = zones.map((z, index) => ({
      ...z,
      id: z.id || `zone-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 9)}`
    }));
    return { zones: [...state.zones, ...zonesWithIds] };
  }),
  addZone: (zone) => set((state) => {
    if (state.zones.length >= 250) {
      console.warn('Maximum of 250 zones allowed');
      return state;
    }
    // Enforce limit: max 64 channels per zone
    const channels = zone.channels ? zone.channels.slice(0, 64) : [];
    const newZone: Zone = {
      ...zone,
      channels,
      id: `zone-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    };
    return {
      zones: [...state.zones, newZone]
    };
  }),
  updateZone: (id, updates) => set((state) => ({
    zones: state.zones.map(z => {
      if (z.id === id) {
        // Enforce limit: max 64 channels per zone
        if (updates.channels && updates.channels.length > 64) {
          updates.channels = updates.channels.slice(0, 64);
        }
        return { ...z, ...updates };
      }
      return z;
    })
  })),
  renameZone: (id, newName) => {
    const trimmedNewName = newName.trim();
    
    // Validate new name
    if (!trimmedNewName || trimmedNewName.length === 0) {
      return false;
    }
    if (trimmedNewName.length > 10) {
      return false;
    }
    
    // Note: We now ALLOW duplicate names since zones can have the same name
    // The ID ensures they're still unique in the UI
    
    // Rename the zone
    set((state) => ({
      zones: state.zones.map(z => 
        z.id === id ? { ...z, name: trimmedNewName } : z
      )
    }));
    
    return true;
  },
  deleteZone: (id) => set((state) => ({
    zones: state.zones.filter(z => z.id !== id),
    selectedZoneId: state.selectedZoneId === id ? null : state.selectedZoneId
  })),
  setSelectedZoneId: (id) => set({ selectedZoneId: id, selectedZone: id ? get().zones.find(z => z.id === id)?.name || null : null }),
  // Legacy compatibility
  setSelectedZone: (name) => {
    const zone = get().zones.find(z => z.name === name);
    set({ selectedZoneId: zone?.id || null, selectedZone: name });
  },
}));

