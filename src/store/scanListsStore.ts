import { getCapabilitiesForModel } from '../radios/capabilities';
import { useRadioStore } from './radioStore';
import { create } from 'zustand';
import type { ScanList } from '../models/ScanList';

interface ScanListsState {
  scanLists: ScanList[];
  /**
   * The list open in the Scan Lists editor, by its position in `scanLists`.
   * Lists are picked and changed by position, never by name: the radio lets
   * several share one (a DM-32 read held six called "Scan List"), and picking
   * by name selected all six, and an edit, rename or delete hit all six at once.
   */
  selectedScanList: number | null;
  rawScanListData: Map<string, { data: Uint8Array; listNum: number; offset: number }>;
  setScanLists: (scanLists: ScanList[]) => void;
  addScanList: (scanList: ScanList) => void;
  /** Change the list at `index` in `scanLists`. */
  updateScanList: (index: number, scanList: Partial<ScanList>) => void;
  /** Rename the list at `index`. False for an empty or too long name, or one another list has. */
  renameScanList: (index: number, newName: string) => boolean;
  /** Delete the list at `index`; a selection further down moves up with its list. */
  deleteScanList: (index: number) => void;
  setSelectedScanList: (index: number | null) => void;
  setRawScanListData: (data: Map<string, { data: Uint8Array; listNum: number; offset: number }>) => void;
}

export const useScanListsStore = create<ScanListsState>((set) => ({
  scanLists: [],
  selectedScanList: null,
  rawScanListData: new Map(),
  setScanLists: (scanLists) => set({ scanLists }),
  addScanList: (scanList) => set((state) => {
    if (state.scanLists.length >= (getCapabilitiesForModel(useRadioStore.getState().selectedRadioModel ?? '')?.maxScanLists ?? 32)) {
      console.warn('Maximum of 32 scan lists allowed');
      return state;
    }
    // Enforce the per-radio limit rather than the DM-32's 15. Reading a D890
    // scan list (up to 50 members) through here used to silently drop the tail.
    const maxChannels = getCapabilitiesForModel(
      useRadioStore.getState().selectedRadioModel ?? ''
    )?.maxScanListChannels ?? 15;
    const channels = scanList.channels ? scanList.channels.slice(0, maxChannels) : [];
    return {
      scanLists: [...state.scanLists, { ...scanList, channels }]
    };
  }),
  updateScanList: (index, updates) => set((state) => ({
    scanLists: state.scanLists.map((sl, i) => {
      if (i === index) {
        // Enforce limit: max 15 channels per scan list
        if (updates.channels && updates.channels.length > 15) {
          updates.channels = updates.channels.slice(0, getCapabilitiesForModel(useRadioStore.getState().selectedRadioModel ?? '')?.maxScanListChannels ?? 15);
        }
        return { ...sl, ...updates };
      }
      return sl;
    })
  })),
  renameScanList: (index, newName) => {
    const trimmedNewName = newName.trim();

    // Validate new name
    if (!trimmedNewName || trimmedNewName.length === 0) {
      return false;
    }
    // Per radio: the DM-32's name field is 11 bytes, the D890UV family's 16 characters.
    const maxNameLength =
      getCapabilitiesForModel(useRadioStore.getState().selectedRadioModel ?? '')?.maxScanListNameLength ?? 16;
    if (trimmedNewName.length > maxNameLength) {
      return false;
    }

    const state = useScanListsStore.getState();
    const list = state.scanLists[index];
    if (!list) return false;
    if (list.name === trimmedNewName) return true;

    // Check for duplicate names
    if (state.scanLists.some((sl, i) => i !== index && sl.name === trimmedNewName)) {
      return false;
    }

    set((state) => ({
      scanLists: state.scanLists.map((sl, i) => (i === index ? { ...sl, name: trimmedNewName } : sl)),
    }));

    return true;
  },
  deleteScanList: (index) => set((state) => ({
    scanLists: state.scanLists.filter((_, i) => i !== index),
    selectedScanList:
      state.selectedScanList === null || state.selectedScanList < index
        ? state.selectedScanList
        : state.selectedScanList === index
          ? null
          : state.selectedScanList - 1,
  })),
  setSelectedScanList: (index) => set({ selectedScanList: index }),
  setRawScanListData: (data) => set({ rawScanListData: data }),
}));

