import { create } from 'zustand';
import type { RXGroup } from '../models/RXGroup';

export interface RawRXGroupData {
  data: Uint8Array;
  groupIndex: number;
  offset: number;
}

interface RXGroupsState {
  groups: RXGroup[];
  selectedGroup: number | null;
  rawGroupData: Map<number, RawRXGroupData>; // Store raw data for debug export
  groupsLoaded: boolean;
  setGroups: (groups: RXGroup[]) => void;
  setRawGroupData: (rawData: Map<number, RawRXGroupData>) => void;
  setSelectedGroup: (index: number | null) => void;
  addGroup: (group: Omit<RXGroup, 'index'>) => void;
  updateGroup: (index: number, group: Partial<RXGroup>) => void;
  deleteGroup: (index: number) => void;
  setGroupsLoaded: (loaded: boolean) => void;
}

export const useRXGroupsStore = create<RXGroupsState>((set, get) => ({
  groups: [],
  selectedGroup: null,
  rawGroupData: new Map(),
  groupsLoaded: false,
  setGroups: (groups) => set({ groups, groupsLoaded: true }),
  setRawGroupData: (rawData) => set({ rawGroupData: rawData }),
  setSelectedGroup: (index) => set({ selectedGroup: index }),
  addGroup: (group) => {
    const groups = get().groups;
    const newIndex = groups.length;
    const newGroup: RXGroup = {
      ...group,
      index: newIndex,
    };
    set({ groups: [...groups, newGroup] });
  },
  updateGroup: (index, updates) => set((state) => ({
    groups: state.groups.map((g) => 
      g.index === index ? { ...g, ...updates } : g
    )
  })),
  deleteGroup: (index) => {
    const groups = get().groups.filter(g => g.index !== index);
    // Re-index remaining groups
    const reindexed = groups.map((g, idx) => ({
      ...g,
      index: idx,
    }));
    set({ groups: reindexed });
    // Clear selection if deleted group was selected
    if (get().selectedGroup === index) {
      set({ selectedGroup: null });
    }
  },
  setGroupsLoaded: (loaded) => set({ groupsLoaded: loaded }),
}));

