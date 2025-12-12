/**
 * Digital Emergency System (Metadata 0x10)
 * DMR digital emergency system configurations
 * Entry structure: 20 bytes (0x14) starting at offset 0x000
 * Entry Calculation: entry_base = 0x000 + entry_num * 0x14
 */

export interface DigitalEmergency {
  index: number;                    // Entry index (0-based)
  name: string;                     // 10 bytes, ASCII string
  fields: Uint8Array;               // 10 bytes, structure TBD
}

export interface DigitalEmergencyConfig {
  // Simplified config - may be expanded later
  [key: string]: any;
}

