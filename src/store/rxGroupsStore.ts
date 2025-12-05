import { create } from 'zustand';
import type { RXGroup } from '../models/RXGroup';

export interface RawRXGroupData {
  data: Uint8Array;
  groupIndex: number;
  offset: number;
}

interface RXGroupsState {
  groups: RXGroup[];
  rawGroupData: Map<number, RawRXGroupData>; // Store raw data for debug export
  groupsLoaded: boolean;
  setGroups: (groups: RXGroup[]) => void;
  setRawGroupData: (rawData: Map<number, RawRXGroupData>) => void;
  addGroup: (group: RXGroup) => void;
  updateGroup: (index: number, group: Partial<RXGroup>) => void;
  deleteGroup: (index: number) => void;
  setGroupsLoaded: (loaded: boolean) => void;
}

export const useRXGroupsStore = create<RXGroupsState>((set) => ({
  groups: [],
  rawGroupData: new Map(),
  groupsLoaded: false,
  setGroups: (groups) => set({ groups, groupsLoaded: true }),
  setRawGroupData: (rawData) => set({ rawGroupData: rawData }),
  addGroup: (group) => set((state) => ({
    groups: [...state.groups, group]
  })),
  updateGroup: (index, updates) => set((state) => ({
    groups: state.groups.map((g, i) => 
      i === index ? { ...g, ...updates } : g
    )
  })),
  deleteGroup: (index) => set((state) => ({
    groups: state.groups.filter((_, i) => i !== index)
  })),
  setGroupsLoaded: (loaded) => set({ groupsLoaded: loaded }),
}));

