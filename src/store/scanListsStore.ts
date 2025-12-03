import { create } from 'zustand';
import type { ScanList } from '../models/ScanList';

interface ScanListsState {
  scanLists: ScanList[];
  selectedScanList: string | null;
  rawScanListData: Map<string, { data: Uint8Array; listNum: number; offset: number }>;
  setScanLists: (scanLists: ScanList[]) => void;
  addScanList: (scanList: ScanList) => void;
  updateScanList: (name: string, scanList: Partial<ScanList>) => void;
  deleteScanList: (name: string) => void;
  setSelectedScanList: (name: string | null) => void;
  setRawScanListData: (data: Map<string, { data: Uint8Array; listNum: number; offset: number }>) => void;
}

export const useScanListsStore = create<ScanListsState>((set) => ({
  scanLists: [],
  selectedScanList: null,
  rawScanListData: new Map(),
  setScanLists: (scanLists) => set({ scanLists }),
  addScanList: (scanList) => set((state) => ({
    scanLists: [...state.scanLists, scanList]
  })),
  updateScanList: (name, updates) => set((state) => ({
    scanLists: state.scanLists.map(sl =>
      sl.name === name ? { ...sl, ...updates } : sl
    )
  })),
  deleteScanList: (name) => set((state) => ({
    scanLists: state.scanLists.filter(sl => sl.name !== name)
  })),
  setSelectedScanList: (name) => set({ selectedScanList: name }),
  setRawScanListData: (data) => set({ rawScanListData: data }),
}));

