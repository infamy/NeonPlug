import { getCapabilitiesForModel } from '../radios/capabilities';
import { useRadioStore } from './radioStore';
import { create } from 'zustand';
import type { RXGroup } from '../models/RXGroup';
import { lowestFreeSlot } from '../utils/lowestFreeSlot';

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
    if (groups.length >= (getCapabilitiesForModel(useRadioStore.getState().selectedRadioModel ?? '')?.digital?.limits?.RX_GROUPS_MAX ?? 32)) {
      console.warn('Maximum of 32 RX groups allowed');
      return;
    }
    // The LOWEST FREE SLOT, not the list length. Deletes leave holes, so a
    // radio holding groups in slots 0 and 2 has length 2 — and `groups.length`
    // would hand the new group slot 2 and overwrite the one already there,
    // while slot 1 stayed empty forever.
    const newIndex = lowestFreeSlot(
      groups.map((g) => g.index),
      getCapabilitiesForModel(useRadioStore.getState().selectedRadioModel ?? '')
        ?.digital?.limits?.RX_GROUPS_MAX ?? 32
    );
    if (newIndex === undefined) {
      console.warn('No free RX group slot');
      return;
    }
    // Enforce limit: max 32 talk groups per RX group
    const maxMembers = getCapabilitiesForModel(useRadioStore.getState().selectedRadioModel ?? '')?.maxRxGroupMembers ?? 32;
    const talkGroupIndices = group.talkGroupIndices ? group.talkGroupIndices.slice(0, maxMembers) : [];
    const newGroup: RXGroup = {
      ...group,
      index: newIndex,
      talkGroupIndices,
    };
    set({ groups: [...groups, newGroup] });
  },
  updateGroup: (index, updates) => set((state) => ({
    groups: state.groups.map((g) => {
      if (g.index === index) {
        // Enforce limit: max 32 talk groups per RX group
        if (updates.talkGroupIndices && updates.talkGroupIndices.length > 32) {
          updates.talkGroupIndices = updates.talkGroupIndices.slice(0, getCapabilitiesForModel(useRadioStore.getState().selectedRadioModel ?? '')?.maxRxGroupMembers ?? 32);
        }
        return { ...g, ...updates };
      }
      return g;
    })
  })),
  deleteGroup: (index) => {
    // NO RE-INDEXING. `index` is a HARDWARE SLOT and a delete leaves a HOLE:
    // measured 2026-09-10 from a vendor CPS delete captured either side
    // (`7x2_rxgroupsadded.txt` / `7x2_rxgroupsdel.txt`). Removing the group in
    // slot 0 of {0,1} moved the presence mask from 0x03 to 0x02 and rewrote only
    // slot 1 — whose 288 bytes came back byte-for-byte identical. The survivor
    // kept its slot.
    //
    // Renumbering survivors here would have written the wrong record to every
    // slot after the gap and silently repointed every channel referencing them,
    // because a channel names a receive group by slot (`rxGroupListId`, +0x1c).
    // Same rule as zones, radio IDs and scan lists; talk groups are the one
    // table that compacts.
    const groups = get().groups.filter((g) => g.index !== index);
    set({ groups });
    if (get().selectedGroup === index) {
      set({ selectedGroup: null });
    }
  },
  setGroupsLoaded: (loaded) => set({ groupsLoaded: loaded }),
}));

