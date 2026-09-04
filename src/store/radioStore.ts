import { create } from 'zustand';
import type { RadioTables } from '../types/radioTables';
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
   * Optional data tables this radio holds, keyed by an agnostic table id.
   *
   * This used to be ten `d890*` slots. See `types/radioTables.ts` for why the
   * ids are generic: no consumer of this data ever behaved differently because
   * of which radio it came from, so none of them should have to name one.
   *
   * A key is absent when the table has not been read or the radio has no such
   * table — those two cases are deliberately not distinguished, because every
   * consumer treats them the same way.
   */
  tables: Partial<RadioTables>;
  /**
   * A radio operation owns the serial port right now.
   *
   * SHARED deliberately. `useRadioConnection` is called from four components and
   * each gets its own `isConnecting`, so the Contacts read could not disable the
   * toolbar's Read/Write. Starting a second operation calls port.open() on an
   * already-open port, which throws AND leaves the port locked for the next
   * attempt — one misclick during a multi-minute read breaks the session.
   */
  radioBusy: boolean;
  /**
   * Progress of a LONG radio operation — contacts, boot image, backgrounds.
   *
   * Lives in the store rather than the component that started it, for two
   * reasons: the Contacts tab unmounts when you switch tabs and would otherwise
   * lose its bar mid-read, and a job that runs for minutes should be visible
   * from wherever you happen to be. Short operations leave this null; a header
   * bar for a two-second read would be noise.
   */
  radioProgress: { label: string; percent: number; message: string } | null;
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
  /**
   * Store one table. Passing null clears it, so a fresh read starts clean.
   * The key is checked against `RadioTables`, so a typo cannot compile.
   */
  setTable: <K extends keyof RadioTables>(key: K, value: RadioTables[K] | null) => void;
  /** Drop every table. Used when disconnecting or switching radios. */
  clearTables: () => void;
  setRadioBusy: (busy: boolean) => void;
  setRadioProgress: (
    p: { label: string; percent: number; message: string } | null
  ) => void;
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
  tables: {},
  radioBusy: false,
  radioProgress: null,
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
  setTable: (key, value) =>
    set((state) => {
      const tables = { ...state.tables };
      // null clears rather than storing an empty slot, so `key in tables` and a
      // truthiness check agree about what the radio actually gave us.
      if (value === null) delete tables[key];
      else tables[key] = value;
      return { tables };
    }),
  clearTables: () => set({ tables: {} }),
  setRadioBusy: (busy) => set({ radioBusy: busy, ...(busy ? {} : { radioProgress: null }) }),
  setRadioProgress: (p) => set({ radioProgress: p }),
  setBootImageDescription: (description) => set({ bootImageDescription: description }),
  setConnectionError: (error) => set({ connectionError: error }),
  setSelectedRadioModel: (model) => set({ selectedRadioModel: model }),
  setPreferredTransport: (transport) => set({ preferredTransport: transport }),
  setShowPickRadioModal: (show) => set({ showPickRadioModal: show }),
}));

