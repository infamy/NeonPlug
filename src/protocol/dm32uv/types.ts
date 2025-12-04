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
  blockMetadata: Map<number, { metadata: number; type: string }>;
  blockData: Map<number, Uint8Array>;
}

