import type { Channel, Zone, Contact, RadioSettings, ScanList } from '../models';

// Re-export RadioSettings for use in stores
export type { RadioSettings } from '../models';

export interface RadioInfo {
  model: string;               // "DP570UV"
  firmware: string;            // "DM32.01.01.046"
  buildDate: string;           // "2022-06-27"
  dspVersion?: string;         // "D1.01.01.004"
  radioVersion?: string;       // "R1.00.01.001"
  codeplugVersion?: string;    // "C1.00.01.001"
  memoryLayout: {
    configStart: number;       // 0x001000
    configEnd: number;         // 0x0C8FFF
  };
  vframes: Map<number, Uint8Array>; // All raw V-frame data
}

export interface RadioProtocol {
  // Connection
  connect(port: string): Promise<void>;
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
  writeScanLists(scanLists: ScanList[]): Promise<void>;
  
  // Contacts
  readContacts(): Promise<Contact[]>;
  writeContacts(contacts: Contact[]): Promise<void>;
  
  // Settings
  readRadioSettings(): Promise<RadioSettings | null>;
  writeRadioSettings(settings: RadioSettings): Promise<void>;
  
  // Progress callbacks
  onProgress?: (progress: number, message: string) => void;
}

