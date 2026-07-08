import type {
  Channel, Zone, Contact, RadioSettings, ScanList, DMRRadioID,
  QuickTextMessage, Calibration, RXGroup, QuickContact, EncryptionKey,
  DigitalEmergency, DigitalEmergencyConfig, AnalogEmergency,
} from '../models';

// Re-export RadioSettings for use in stores
export type { RadioSettings } from '../models';

/**
 * Minimal interface shared by all radios: channels + settings.
 * Analog radios (FT-65, UV5R-Mini) implement only this surface.
 */
export interface AnalogRadioProtocol {
  connect(portOrOptions?: string | { forcePortSelection?: boolean; transport?: string }): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  getRadioInfo(): Promise<RadioInfo>;
  readChannels(): Promise<Channel[]>;
  writeChannels(channels: Channel[]): Promise<void>;
  readRadioSettings(): Promise<RadioSettings | null>;
  writeRadioSettings(settings: RadioSettings, options?: { changedFields?: string[] }): Promise<void>;
  onProgress?: (progress: number, message: string) => void;
  /** Extract firmware version from the cached clone image. UV5R-Mini and DM-32UV implement this. */
  getFirmwareFromCache?(): string | null;
}

/**
 * Full interface for digital radios: zones, contacts, scan lists, DMR IDs, etc.
 * Digital radios (DM-32UV and future) implement this.
 */
export interface DigitalRadioProtocol extends AnalogRadioProtocol {
  readZones(): Promise<Zone[]>;
  writeZones(zones: Zone[]): Promise<void>;
  readScanLists(): Promise<ScanList[]>;
  readDMRRadioIDs(): Promise<DMRRadioID[]>;
  writeDMRRadioIDs(radioIds: DMRRadioID[]): Promise<void>;
  readContacts(): Promise<Contact[]>;
  writeContacts(contacts: Contact[]): Promise<void>;
}

/**
 * Full public API of the DM-32UV protocol, including DM32-specific operations
 * not present in the base digital radio interface.
 *
 * DM32UVProtocol implements this. A future DM32-compatible radio should also
 * implement this if it shares the same on-air structures.
 */
export interface DM32Protocol extends DigitalRadioProtocol {
  // Bulk memory read (DM-32 reads all 4 KB blocks up front)
  bulkReadRequiredBlocks(): Promise<void>;

  // Write-path cache restore (avoids re-reading from radio before write)
  restoreCacheFromStore(
    blockData: Map<number, Uint8Array>,
    blockMetadata: Map<number, { metadata: number; type: string }>
  ): void;

  // Boot image
  readBootImage(): Promise<Uint8Array>;
  writeBootImage(data: Uint8Array): Promise<void>;

  // Quick text messages
  readQuickMessages(): Promise<QuickTextMessage[]>;
  writeQuickMessages(messages: QuickTextMessage[]): Promise<void>;

  // Calibration (read-only)
  readCalibration(): Promise<Calibration | null>;

  // RX groups
  readRXGroups(): Promise<RXGroup[]>;
  writeRXGroups(groups: RXGroup[]): Promise<void>;

  // Quick contacts (talk groups in the DM-32 sense)
  readQuickContacts(): Promise<QuickContact[]>;
  writeQuickContacts(contacts: QuickContact[]): Promise<void>;

  // Single-session write for channels + zones + scan lists
  writeAllData(channels: Channel[], zones: Zone[], scanLists: ScanList[]): Promise<void>;

  // Encryption keys
  writeEncryptionKeys(keys: EncryptionKey[]): Promise<void>;

  // Emergency systems
  readDigitalEmergencies(): Promise<{ systems: DigitalEmergency[]; config: DigitalEmergencyConfig } | null>;
  writeDigitalEmergencies(systems: DigitalEmergency[], config: DigitalEmergencyConfig): Promise<void>;
  readAnalogEmergencies(): Promise<AnalogEmergency[] | null>;
  writeAnalogEmergencies(systems: AnalogEmergency[]): Promise<void>;

  // Raw/debug data (set after each read for the Diagnostics tab)
  rawChannelData: Map<number, { data: Uint8Array; blockAddr: number; offset: number }>;
  rawZoneData: Map<string, { data: Uint8Array; zoneNum: number; offset: number }>;
  rawContactBlockData: Uint8Array | null;
  rawContactBlockAddress: number | null;
  rawContactBlocks: Map<number, Uint8Array>;
  rawScanListData: Map<string, { data: Uint8Array; listNum: number; offset: number }>;
  rawRadioSettingsData: Uint8Array | null;
  rawMessageData: Map<number, { data: Uint8Array; messageIndex: number; offset: number }>;
  rawDMRRadioIDData: Map<number, { data: Uint8Array; idIndex: number; offset: number }>;
  rawRXGroupData: Map<number, { data: Uint8Array; groupIndex: number; offset: number }>;
  blockData: Map<number, Uint8Array>;
  blockMetadata: Map<number, { metadata: number; type: string }>;
  writeBlockData: Map<number, { address: number; data: Uint8Array; metadata: number }>;
}

export interface RadioInfo {
  model: string;               // "DP570UV"
  firmware: string;            // "DM32.01.01.046"
  buildDate: string;           // "2022-06-27"
  dspVersion?: string;         // "D1.01.01.004"
  radioVersion?: string;       // "R1.00.01.001"
  codeplugVersion?: string;    // "C1.00.01.001"
  /** Max contact capacity; set by each radio in getRadioInfo (e.g. from layout or constants). */
  maxContacts?: number;
  /** Optional memory range for display; DM-32 uses this, linear radios may omit. */
  memoryLayout?: {
    configStart: number;       // 0x001000
    configEnd: number;         // 0x0C8FFF
  };
  /** Optional raw V-frame data; DM-32 only. Other radios omit. */
  vframes?: Map<number, Uint8Array>;
}

/**
 * Protocol boundary: all methods take or return only standard codeplug types
 * (Channel, Zone, Contact, RadioSettings, etc.). Raw layout (V-frames, blocks,
 * linear addresses) and decode/encode are implementation details of each radio.
 */
export interface RadioProtocol {
  connect(portOrOptions?: string | { forcePortSelection?: boolean }): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  getRadioInfo(): Promise<RadioInfo>;
  readChannels(): Promise<Channel[]>;
  writeChannels(channels: Channel[]): Promise<void>;
  readZones(): Promise<Zone[]>;
  writeZones(zones: Zone[]): Promise<void>;
  readScanLists(): Promise<ScanList[]>;
  readDMRRadioIDs(): Promise<DMRRadioID[]>;
  writeDMRRadioIDs(radioIds: DMRRadioID[]): Promise<void>;
  readContacts(): Promise<Contact[]>;
  writeContacts(contacts: Contact[]): Promise<void>;
  readRadioSettings(): Promise<RadioSettings | null>;
  writeRadioSettings(settings: RadioSettings, options?: { changedFields?: string[] }): Promise<void>;
  onProgress?: (progress: number, message: string) => void;
  getFirmwareFromCache?(): string | null;
  /** Clone-style radios: full memory image cached by the last read/write. */
  getMemoryImage?(): Uint8Array | null;
  /** Clone-style radios: restore a previously read memory image into a fresh instance before writing. */
  setMemoryImage?(image: Uint8Array): void;
  /** True when writeRadioSettings only buffers changes into the memory image that the
   *  next writeChannels uploads (Yaesu clone protocol). The connection hook must call
   *  writeRadioSettings BEFORE writeChannels for these protocols. */
  readonly bufferedSettingsWrite?: boolean;
}
