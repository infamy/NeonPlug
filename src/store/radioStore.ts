import { create } from 'zustand';
import type { RadioSettings, RadioInfo } from '../protocol/interface';

interface RadioState {
  isConnected: boolean;
  radioInfo: RadioInfo | null;
  settings: RadioSettings | null;
  blockMetadata: Map<number, { metadata: number; type: string }>;
  blockData: Map<number, Uint8Array>;
  writeBlockData: Map<number, { address: number; data: Uint8Array; metadata: number }>;
  zoneComparisonData: Array<{
    blockIndex: number;
    address: string;
    isIdentical: boolean;
    differences: number;
    differencePositions: number[];
    zoneComparisons: Array<{
      zoneNumber: number;
      offset: number;
      originalName: string;
      newName: string;
      originalChannelCount: number;
      newChannelCount: number;
      matches: boolean;
      originalHex: string;
      newHex: string;
    }>;
    metadataMatch: boolean;
    originalMetadata: number;
    newMetadata: number;
  }>;
  setConnected: (connected: boolean) => void;
  setRadioInfo: (info: RadioInfo | null) => void;
  setSettings: (settings: RadioSettings | null) => void;
  setBlockMetadata: (metadata: Map<number, { metadata: number; type: string }>) => void;
  setBlockData: (data: Map<number, Uint8Array>) => void;
  setWriteBlockData: (data: Map<number, { address: number; data: Uint8Array; metadata: number }>) => void;
  setZoneComparisonData: (data: Array<{
    blockIndex: number;
    address: string;
    isIdentical: boolean;
    differences: number;
    differencePositions: number[];
    zoneComparisons: Array<{
      zoneNumber: number;
      offset: number;
      originalName: string;
      newName: string;
      originalChannelCount: number;
      newChannelCount: number;
      matches: boolean;
      originalHex: string;
      newHex: string;
    }>;
    metadataMatch: boolean;
    originalMetadata: number;
    newMetadata: number;
  }>) => void;
}

export const useRadioStore = create<RadioState>((set) => ({
  isConnected: false,
  radioInfo: null,
  settings: null,
  blockMetadata: new Map(),
  blockData: new Map(),
  writeBlockData: new Map(),
  zoneComparisonData: [],
  setConnected: (connected) => set({ isConnected: connected }),
  setRadioInfo: (info) => set({ radioInfo: info }),
  setSettings: (settings) => set({ settings }),
  setBlockMetadata: (metadata) => set({ blockMetadata: metadata }),
  setBlockData: (data) => set({ blockData: data }),
  setWriteBlockData: (data) => set({ writeBlockData: data }),
  setZoneComparisonData: (data) => set({ zoneComparisonData: data }),
}));

