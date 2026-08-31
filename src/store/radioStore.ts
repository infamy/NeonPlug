import { create } from 'zustand';
import type { D890RoamingChannel, D890RoamingZone } from '../radios/d890uv/structures';
import type { D890SatelliteRecord } from '../radios/d890uv/satellite';
import type { RadioInfo } from '../types/radio';

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
  /**
   * DA-7X2 boot image and both standby pictures, read with the codeplug.
   * Separate from `bootImageRaw` because this radio has three of them and they
   * are a different format (160x128 RGB565) from the DM-32's single image.
   */
  d890Images: { boot: Uint8Array | null; bk1: Uint8Array | null; bk2: Uint8Array | null } | null;
  /**
   * DA-7X2 roaming and satellite tables. Read with the codeplug and kept raw —
   * neither has a model of its own yet, and inventing one before there is a UI
   * would be guessing at what that UI needs.
   */
  d890Roaming: { channels: D890RoamingChannel[]; zones: D890RoamingZone[] } | null;
  d890Satellites: D890SatelliteRecord[] | null;
  bootImageDescription: string | null;
  connectionError: string | null;
  setConnected: (connected: boolean) => void;
  setRadioInfo: (info: RadioInfo | null) => void;
  setRawRadioSettingsData: (data: Uint8Array | null) => void;
  setRawContactBlockData: (data: Uint8Array | null, address: number | null) => void;
  setRawContactBlocks: (blocks: Map<number, Uint8Array>) => void;
  setBlockMetadata: (metadata: Map<number, { metadata: number; type: string }>) => void;
  setBlockData: (data: Map<number, Uint8Array>) => void;
  setCachedMemoryImage: (entry: { model: string; image: Uint8Array } | null) => void;
  setWriteBlockData: (data: Map<number, { address: number; data: Uint8Array; metadata: number }>) => void;
  setZoneComparisonData: (data: ZoneComparisonData) => void;
  setBootImageRaw: (data: Uint8Array | null) => void;
  setD890Images: (images: { boot: Uint8Array | null; bk1: Uint8Array | null; bk2: Uint8Array | null } | null) => void;
  setD890Roaming: (roaming: { channels: D890RoamingChannel[]; zones: D890RoamingZone[] } | null) => void;
  setD890Satellites: (sats: D890SatelliteRecord[] | null) => void;
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
  d890Images: null,
  d890Roaming: null,
  d890Satellites: null,
  bootImageDescription: null,
  connectionError: null,
  setConnected: (connected) => set({ isConnected: connected }),
  setRadioInfo: (info) => set({ radioInfo: info }),
  setRawRadioSettingsData: (data) => set({ rawRadioSettingsData: data }),
  setRawContactBlockData: (data, address) => set({ rawContactBlockData: data, rawContactBlockAddress: address }),
  setRawContactBlocks: (blocks) => set({ rawContactBlocks: blocks }),
  setBlockMetadata: (metadata) => set({ blockMetadata: metadata }),
  setBlockData: (data) => set({ blockData: data }),
  setCachedMemoryImage: (entry) => set({ cachedMemoryImage: entry }),
  setWriteBlockData: (data) => set({ writeBlockData: data }),
  setZoneComparisonData: (data) => set({ zoneComparisonData: data }),
  setBootImageRaw: (data) => set({ bootImageRaw: data }),
  setD890Images: (images) => set({ d890Images: images }),
  setD890Roaming: (roaming) => set({ d890Roaming: roaming }),
  setD890Satellites: (sats) => set({ d890Satellites: sats }),
  setBootImageDescription: (description) => set({ bootImageDescription: description }),
  setConnectionError: (error) => set({ connectionError: error }),
  setSelectedRadioModel: (model) => set({ selectedRadioModel: model }),
  setPreferredTransport: (transport) => set({ preferredTransport: transport }),
  setShowPickRadioModal: (show) => set({ showPickRadioModal: show }),
}));

