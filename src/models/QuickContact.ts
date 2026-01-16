export interface QuickContact {
  index: number;              // Entry index (1-based)
  offset: number;             // Byte offset in the block where this entry starts
  name: string;               // Contact name (variable length, ASCII, null-terminated)
  contactNumber: number;      // Contact number (little-endian uint32)
  callType: number;           // Call type: 0x03 = Private Call, 0x04 = Group Call, 0x05 = All Call
  hasHeader: boolean;         // True if this is Contact 1 with 1-byte header (0x00)
  flag: number;               // Flag byte: 0x00 = PC-created, 0x01 = Radio-created
  rawData: Uint8Array;        // Raw entry data for debugging
}
