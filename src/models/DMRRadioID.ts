export interface DMRRadioID {
  index: number;           // 0-based index in the ID list
  dmrId: string;          // DMR Radio ID as decimal string (e.g., "1337")
  dmrIdValue: number;     // DMR Radio ID as numeric value
  dmrIdBytes: Uint8Array;  // Raw 3-byte ID value (little-endian)
  name: string;            // Name (12 bytes, null-terminated)
}

