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
  name: string;               // Group name (11 bytes, null-terminated)
  bitmask: number;            // 32-bit bitmask (little-endian) - group selection/priority flags
  statusFlag: number;         // Status flag (1 byte)
  entryFlag: number;          // Entry validation flag (1 byte)
  validationFlag: number;     // Validation flag (1 byte at entry_base - 0x5D)
  contactIds: number[];       // Array of DMR contact IDs (3 bytes each, little-endian)
}

