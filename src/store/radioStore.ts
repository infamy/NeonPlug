import { create } from 'zustand';
import type { RadioSettings, RadioInfo } from '../types/radio';

type ZoneComparisonData = Array<{
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

interface RadioState {
  /** Model ID selected in the pick-a-radio modal for the next "Read from Radio" (e.g. DM-32UV). */
  selectedRadioModel: string | null;
  /** When connecting to a radio that supports both (e.g. UV5R-Mini), use this transport. */
  preferredTransport: 'serial' | 'ble' | null;
  /** When true, show the pick-a-radio modal (e.g. from Toolbar "Change radio"). */
  showPickRadioModal: boolean;
  isConnected: boolean;
  radioInfo: RadioInfo | null;
  settings: RadioSettings | null;
  rawRadioSettingsData: Uint8Array | null;
  rawContactBlockData: Uint8Array | null;
  rawContactBlockAddress: number | null;
  rawContactBlocks: Map<number, Uint8Array>;
  blockMetadata: Map<number, { metadata: number; type: string }>;
  blockData: Map<number, Uint8Array>;
  /** Full memory image from the last read of a clone-style radio (FT-65 family).
   *  Restored into the fresh protocol instance on write so non-channel regions
   *  (settings, DTMF, P-keys) survive the read→write cycle. Tagged with the
   *  model it came from so it is never written to a different radio. */
  cachedMemoryImage: { model: string; image: Uint8Array } | null;
  writeBlockData: Map<number, { address: number; data: Uint8Array; metadata: number }>;
  zoneComparisonData: ZoneComparisonData;
  bootImageRaw: Uint8Array | null;
  bootImageDescription: string | null;
  connectionError: string | null;
  setConnected: (connected: boolean) => void;
  setRadioInfo: (info: RadioInfo | null) => void;
  setSettings: (settings: RadioSettings | null) => void;
  setRawRadioSettingsData: (data: Uint8Array | null) => void;
  setRawContactBlockData: (data: Uint8Array | null, address: number | null) => void;
  setRawContactBlocks: (blocks: Map<number, Uint8Array>) => void;
  setBlockMetadata: (metadata: Map<number, { metadata: number; type: string }>) => void;
  setBlockData: (data: Map<number, Uint8Array>) => void;
  setCachedMemoryImage: (entry: { model: string; image: Uint8Array } | null) => void;
  setWriteBlockData: (data: Map<number, { address: number; data: Uint8Array; metadata: number }>) => void;
  setZoneComparisonData: (data: ZoneComparisonData) => void;
  setBootImageRaw: (data: Uint8Array | null) => void;
  setBootImageDescription: (description: string | null) => void;
  setConnectionError: (error: string | null) => void;
  setSelectedRadioModel: (model: string | null) => void;
  setPreferredTransport: (transport: 'serial' | 'ble' | null) => void;
  setShowPickRadioModal: (show: boolean) => void;
}

export const useRadioStore = create<RadioState>((set) => ({
  selectedRadioModel: null,
  preferredTransport: null,
  showPickRadioModal: false,
  isConnected: false,
  radioInfo: null,
  settings: null,
  rawRadioSettingsData: null,
  rawContactBlockData: null,
  rawContactBlockAddress: null,
  rawContactBlocks: new Map(),
  blockMetadata: new Map(),
  blockData: new Map(),
  cachedMemoryImage: null,
  writeBlockData: new Map(),
  zoneComparisonData: [],
  bootImageRaw: null,
  bootImageDescription: null,
  connectionError: null,
  setConnected: (connected) => set({ isConnected: connected }),
  setRadioInfo: (info) => set({ radioInfo: info }),
  setSettings: (settings) => set({ settings }),
  setRawRadioSettingsData: (data) => set({ rawRadioSettingsData: data }),
  setRawContactBlockData: (data, address) => set({ rawContactBlockData: data, rawContactBlockAddress: address }),
  setRawContactBlocks: (blocks) => set({ rawContactBlocks: blocks }),
  setBlockMetadata: (metadata) => set({ blockMetadata: metadata }),
  setBlockData: (data) => set({ blockData: data }),
  setCachedMemoryImage: (entry) => set({ cachedMemoryImage: entry }),
  setWriteBlockData: (data) => set({ writeBlockData: data }),
  setZoneComparisonData: (data) => set({ zoneComparisonData: data }),
  setBootImageRaw: (data) => set({ bootImageRaw: data }),
  setBootImageDescription: (description) => set({ bootImageDescription: description }),
  setConnectionError: (error) => set({ connectionError: error }),
  setSelectedRadioModel: (model) => set({ selectedRadioModel: model }),
  setPreferredTransport: (transport) => set({ preferredTransport: transport }),
  setShowPickRadioModal: (show) => set({ showPickRadioModal: show }),
}));

