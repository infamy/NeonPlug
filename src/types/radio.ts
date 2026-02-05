import type { Channel, Zone, Contact, RadioSettings, ScanList, DMRRadioID } from '../models';

// Re-export RadioSettings for use in stores
export type { RadioSettings } from '../models';

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
  // Connection
  // port: legacy for protocols that take a path; options: e.g. { forcePortSelection } for Web Serial
  connect(portOrOptions?: string | { forcePortSelection?: boolean }): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;

  // Radio Info
  getRadioInfo(): Promise<RadioInfo>;

  // Channels
  readChannels(): Promise<Channel[]>;
  writeChannels(channels: Channel[]): Promise<void>;

  // Zones
  readZones(): Promise<Zone[]>;
  writeZones(zones: Zone[]): Promise<void>;

  // Scan Lists
  readScanLists(): Promise<ScanList[]>;

  // DMR Radio IDs
  readDMRRadioIDs(): Promise<DMRRadioID[]>;
  writeDMRRadioIDs(radioIds: DMRRadioID[]): Promise<void>;

  // Contacts
  readContacts(): Promise<Contact[]>;
  writeContacts(contacts: Contact[]): Promise<void>;

  // Settings
  readRadioSettings(): Promise<RadioSettings | null>;
  writeRadioSettings(settings: RadioSettings): Promise<void>;

  // Progress callbacks
  onProgress?: (progress: number, message: string) => void;
}
