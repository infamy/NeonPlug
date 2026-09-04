import { getCapabilitiesForModel } from '../radios/capabilities';
import { useRadioStore } from './radioStore';
import { create } from 'zustand';
import type { ScanList } from '../models/ScanList';

interface ScanListsState {
  scanLists: ScanList[];
  selectedScanList: string | null;
  rawScanListData: Map<string, { data: Uint8Array; listNum: number; offset: number }>;
  setScanLists: (scanLists: ScanList[]) => void;
  addScanList: (scanList: ScanList) => void;
  updateScanList: (name: string, scanList: Partial<ScanList>) => void;
  renameScanList: (oldName: string, newName: string) => boolean;
  deleteScanList: (name: string) => void;
  setSelectedScanList: (name: string | null) => void;
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
  updateScanList: (name, updates) => set((state) => ({
    scanLists: state.scanLists.map(sl => {
      if (sl.name === name) {
        // Enforce limit: max 15 channels per scan list
        if (updates.channels && updates.channels.length > 15) {
          updates.channels = updates.channels.slice(0, getCapabilitiesForModel(useRadioStore.getState().selectedRadioModel ?? '')?.maxScanListChannels ?? 15);
        }
        return { ...sl, ...updates };
      }
      return sl;
    })
  })),
  renameScanList: (oldName, newName) => {
    const trimmedNewName = newName.trim();
    
    // Validate new name
    if (!trimmedNewName || trimmedNewName.length === 0) {
      return false;
    }
    if (trimmedNewName.length > 16) {
      return false;
    }
    
    // Check for duplicate names
    const state = useScanListsStore.getState();
    if (state.scanLists.some(sl => sl.name === trimmedNewName && sl.name !== oldName)) {
      return false;
    }
    
    // Rename the scan list and update selected scan list if needed
    set((state) => ({
      scanLists: state.scanLists.map(sl => 
        sl.name === oldName ? { ...sl, name: trimmedNewName } : sl
      ),
      selectedScanList: state.selectedScanList === oldName ? trimmedNewName : state.selectedScanList
    }));
    
    return true;
  },
  deleteScanList: (name) => set((state) => ({
    scanLists: state.scanLists.filter(sl => sl.name !== name)
  })),
  setSelectedScanList: (name) => set({ selectedScanList: name }),
  setRawScanListData: (data) => set({ rawScanListData: data }),
}));

