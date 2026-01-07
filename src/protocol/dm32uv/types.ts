/**
 * DM-32UV Protocol Type Definitions
 * Type-safe interfaces for protocol implementation
 */

/**
 * Web Serial API SerialPort interface
 * Matches the Web Serial API specification
 */
export interface WebSerialPort {
  readonly readable: ReadableStream<Uint8Array> | null;
  readonly writable: WritableStream<Uint8Array> | null;
  open(options: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
}

/**
 * Raw data storage for debug export
 */
export interface RawDataStorage {
  channels: Map<number, { data: Uint8Array; blockAddr: number; offset: number }>;
  zones: Map<string, { data: Uint8Array; zoneNum: number; offset: number }>;
  scanLists: Map<string, { data: Uint8Array; listNum: number; offset: number }>;
  contacts: Uint8Array | null;
  contactBlockAddress: number | null;
}

/**
 * Cached block data structure
 */
export interface CachedBlock {
  metadata: number;
  address: number;
  data: Uint8Array;
}

/**
 * Block metadata information
 */
export interface BlockMetadata {
  metadata: number;
  type: string;
}

/**
 * Write block data structure
 */
export interface WriteBlock {
  address: number;
  data: Uint8Array;
  metadata: number;
}

/**
 * Zone comparison data for debug export
 */
export interface ZoneComparisonData {
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
}

/**
 * Protocol debug data interface
 * Exposes all debug/raw data properties in a type-safe way
 */
export interface ProtocolDebugData {
  rawChannelData: Map<number, { data: Uint8Array; blockAddr: number; offset: number }>;
  rawZoneData: Map<string, { data: Uint8Array; zoneNum: number; offset: number }>;
  rawContactBlockData: Uint8Array | null;
  rawContactBlockAddress: number | null;
  rawScanListData: Map<string, { data: Uint8Array; listNum: number; offset: number }>;
  rawRadioSettingsData: Uint8Array | null;
  rawDigitalEmergencyData: Uint8Array | null;
  rawAnalogEmergencyData: Uint8Array | null;
  rawMessageData: Map<number, { data: Uint8Array; messageIndex: number; offset: number }>;
  rawDMRRadioIDData: Map<number, { data: Uint8Array; idIndex: number; offset: number }>;
  rawRXGroupData: Map<number, { data: Uint8Array; groupIndex: number; offset: number }>;
  blockMetadata: Map<number, BlockMetadata>;
  blockData: Map<number, Uint8Array>;
  writeBlockData: Map<number, WriteBlock>;
  zoneComparisonData: ZoneComparisonData[];
  allBlockMetadata: Map<number, BlockMetadata>;
  allBlockData: Map<number, Uint8Array>;
  cachedBlockData: CachedBlock[];
  discoveredBlocks: import('./memory').MemoryBlock[];
}
