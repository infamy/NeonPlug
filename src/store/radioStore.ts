import { create } from 'zustand';
import type { RadioSettings, RadioInfo } from '../protocol/interface';

interface RadioState {
  isConnected: boolean;
  radioInfo: RadioInfo | null;
  settings: RadioSettings | null;
  blockMetadata: Map<number, { metadata: number; type: string }>;
  blockData: Map<number, Uint8Array>;
  writeBlockData: Map<number, { address: number; data: Uint8Array; metadata: number }>;
  setConnected: (connected: boolean) => void;
  setRadioInfo: (info: RadioInfo | null) => void;
  setSettings: (settings: RadioSettings | null) => void;
  setBlockMetadata: (metadata: Map<number, { metadata: number; type: string }>) => void;
  setBlockData: (data: Map<number, Uint8Array>) => void;
  setWriteBlockData: (data: Map<number, { address: number; data: Uint8Array; metadata: number }>) => void;
}

export const useRadioStore = create<RadioState>((set) => ({
  isConnected: false,
  radioInfo: null,
  settings: null,
  blockMetadata: new Map(),
  blockData: new Map(),
  writeBlockData: new Map(),
  setConnected: (connected) => set({ isConnected: connected }),
  setRadioInfo: (info) => set({ radioInfo: info }),
  setSettings: (settings) => set({ settings }),
  setBlockMetadata: (metadata) => set({ blockMetadata: metadata }),
  setBlockData: (data) => set({ blockData: data }),
  setWriteBlockData: (data) => set({ writeBlockData: data }),
}));

