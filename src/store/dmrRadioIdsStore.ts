import { create } from 'zustand';
import type { DMRRadioID } from '../models/DMRRadioID';

export interface RawDMRRadioIDData {
  data: Uint8Array;
  idIndex: number;
  offset: number;
}

interface DMRRadioIDsState {
  radioIds: DMRRadioID[];
  rawRadioIdData: Map<number, RawDMRRadioIDData>; // Store raw data for debug export
  radioIdsLoaded: boolean;
  setRadioIds: (radioIds: DMRRadioID[]) => void;
  setRawRadioIdData: (rawData: Map<number, RawDMRRadioIDData>) => void;
  addRadioId: (radioId: DMRRadioID) => void;
  updateRadioId: (index: number, radioId: Partial<DMRRadioID>) => void;
  deleteRadioId: (index: number) => void;
  setRadioIdsLoaded: (loaded: boolean) => void;
}

export const useDMRRadioIDsStore = create<DMRRadioIDsState>((set) => ({
  radioIds: [],
  rawRadioIdData: new Map(),
  radioIdsLoaded: false,
  setRadioIds: (radioIds) => set({ radioIds, radioIdsLoaded: true }),
  setRawRadioIdData: (rawData) => set({ rawRadioIdData: rawData }),
  addRadioId: (radioId) => set((state) => ({
    radioIds: [...state.radioIds, radioId]
  })),
  updateRadioId: (index, updates) => set((state) => ({
    radioIds: state.radioIds.map((id, i) => 
      i === index ? { ...id, ...updates } : id
    )
  })),
  deleteRadioId: (index) => set((state) => ({
    radioIds: state.radioIds.filter((_, i) => i !== index)
  })),
  setRadioIdsLoaded: (loaded) => set({ radioIdsLoaded: loaded }),
}));

