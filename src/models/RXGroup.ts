/**
 * DMR RX Group (DMR Receive Group)
 * 
 * DMR RX Groups are stored in metadata 0x0F blocks.
 * Each group contains a list of DMR contact IDs (talkgroups) that the radio will receive.
 * These groups are used for DMR receive filtering - the radio will only receive
 * transmissions from DMR contacts that are in the active RX Group.
 */

export interface RXGroup {
  index: number;              // 0-based index in the group list
  name: string;               // Group name (11 bytes, null-terminated, max 10 chars)
  bitmask: number;            // 32-bit bitmask (little-endian) - active groups bitmask in header
  statusFlag: number;         // Status flag (1 byte) - not used in new format
  entryFlag: number;          // Entry flag (1 byte) - always 0x01
  validationFlag: number;     // Validation flag - not used in new format
  talkGroupIndices: number[]; // Array of DMR IDs (contactNumber) from Talk Groups (up to 32, 3 bytes each, little-endian)
}

