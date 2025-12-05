/**
 * Digital Emergency System (Metadata 0x03)
 * DMR digital emergency system configurations
 */

export interface DigitalEmergency {
  index: number;                    // Entry index (0-based)
  enabled: boolean;                 // Flag bit 0: enabled/disabled
  unknown: number;                  // 2 bytes unknown/reserved
  value1: number;                    // 2 bytes, little-endian uint16
  value2: number;                    // 2 bytes, little-endian uint16
  name: string;                     // 16 bytes, Unicode WCHAR (8 DWORDs)
}

export interface DigitalEmergencyConfig {
  countIndex: number;               // Offset 0x01, validates 1-32
  unknown: number;                   // Offset 0x30, validates 0-50
  numericFields: [number, number, number]; // Offsets 0x31-0x33, stored as actual_value + 5
  byteFields: [number, number];     // Offsets 0x34, 0x36, max 0x14 and 0x32
  values16bit: [number, number, number, number]; // Offsets 0x37-0x3E, four 16-bit values
  bitFlags: number;                  // Offset 0x3F, bits 0 and 1
  indexCount: number;                // Offset 0x40, stored as actual_value + 1
  entryArray: number[];              // Offsets 0x41-0x7F, 16 entries × 4 bytes
  additionalConfig: Uint8Array;      // Offsets 0x730-0x7F0, 192 bytes
}

