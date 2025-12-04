/**
 * DM-32UV Protocol Constants
 * Centralized constants for protocol implementation
 */

// Memory block metadata values
export const METADATA = {
  CHANNEL_FIRST: 0x12,      // First channel block
  CHANNEL_LAST: 0x41,       // Last channel block (max)
  ZONE: 0x5c,               // Zone block
  SCAN_LIST: 0x11,          // Scan list block
  EMPTY: 0x00,              // Empty block
  EMPTY_ALT: 0xFF,          // Alternative empty block marker
} as const;

// Memory block sizes
export const BLOCK_SIZE = {
  STANDARD: 4096,           // 4KB blocks
  CHANNEL: 48,              // Bytes per channel
  ZONE: 145,                // Bytes per zone
  SCAN_LIST: 92,            // Bytes per scan list
  ZONE_NAME: 11,            // Bytes for zone name
  CHANNEL_NAME: 16,         // Bytes for channel name
} as const;

// Memory offsets
export const OFFSET = {
  CHANNEL_COUNT: 0x00,      // Offset of channel count in first block
  FIRST_CHANNEL: 0x10,      // First channel starts at offset 0x10 in first block
  ZONE_START: 16,           // Zones start at offset 16
  SCAN_LIST_START: 16,      // Scan lists start at offset 16 (for first 44)
  METADATA_BYTE: 0xFFF,     // Offset to read metadata byte (last byte of 4KB block)
} as const;

// V-Frame IDs
export const VFRAME = {
  FIRMWARE: 0x01,
  BUILD_DATE: 0x03,
  DSP_VERSION: 0x04,
  RADIO_VERSION: 0x05,
  MEMORY_LAYOUT: 0x0A,
  CODEPLUG_VERSION: 0x0B,
  CONTACTS: 0x0F,            // Contacts/Talkgroups memory range
  MEMBERSHIPS: 0x0E,          // RX Groups/Memberships memory range
} as const;

// Connection settings
export const CONNECTION = {
  BAUD_RATE: 115200,
  INIT_DELAY: 200,          // ms after port open
  CLEAR_BUFFER_DELAY: 100,  // ms after clearing buffer
  BLOCK_READ_DELAY: 50,     // ms between block reads
} as const;

// Channel limits
export const LIMITS = {
  CHANNEL_MAX: 4000,
  CHANNEL_MIN: 1,
  ZONES_PER_BLOCK: 28,      // Approximate (4096 - 16) / 145
  SCAN_LISTS_PER_BLOCK: 44, // First 44 start at offset 16
  SCAN_LIST_CHANNELS_MAX: 16,
} as const;

