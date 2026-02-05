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
  DIGITAL_EMERGENCY: 0x10,  // Digital Emergency Systems (same block as encryption keys, offset 0x000)
  VFO_SETTINGS: 0x04,       // Radio Settings / Radio Names / Embedded Information
  ANALOG_EMERGENCY: 0x10,   // Analog Emergency Systems
  METADATA_0x41: 0x41,      // Metadata block 0x41
  QUICK_MESSAGES: 0x0A,     // Quick text messages block
  METADATA_0x0B: 0x0B,      // Metadata block 0x0B
  RX_GROUPS: 0x0F,          // DMR RX Groups (DMR Receive Groups) - separate from V-frame 0x0F
  CALIBRATION: 0x02,        // Frequency adjustment/calibration data
  METADATA_0x44: 0x44,      // Metadata block 0x44 (Talk Groups)
  METADATA_0x06: 0x06,      // Metadata block 0x06 (Config section 4 - contains Talk Groups counter at 0x1FF)
  TX_CONTACT_LOW: 0x42,     // TX Contact for channels 1-2048 (2 bytes per channel)
  TX_CONTACT_HIGH: 0x43,    // TX Contact for channels 2049+ and VFOs (2 bytes per channel)
  DMR_RADIO_IDS: 0x67,      // DMR Radio ID list block
  EMPTY: 0x00,              // Empty block
  EMPTY_ALT: 0xFF,          // Alternative empty block marker
} as const;

// Memory block sizes
export const BLOCK_SIZE = {
  STANDARD: 4096,           // 4KB blocks
  CHANNEL: 48,              // Bytes per channel
  ZONE: 145,                // Bytes per zone
  SCAN_LIST: 57,            // Bytes per scan list (per spec: 57-byte entries)
  DIGITAL_EMERGENCY: 40,    // Bytes per digital emergency entry
  ANALOG_EMERGENCY: 36,     // Bytes per analog emergency entry
  ZONE_NAME: 11,            // Bytes for zone name
  CHANNEL_NAME: 16,         // Bytes for channel name
  QUICK_MESSAGE: 129,       // Bytes per quick message entry (0x81)
  RX_GROUP: 109,            // Bytes per DMR RX group entry (0x6D)
  DMR_RADIO_ID: 16,         // Bytes per DMR radio ID entry (0x10)
  QUICK_CONTACT: 16,        // Bytes per quick contact entry (0x10)
} as const;

// Memory offsets
export const OFFSET = {
  CHANNEL_COUNT: 0x00,      // Offset of channel count in first block
  FIRST_CHANNEL: 0x10,      // First channel starts at offset 0x10 in first block
  ZONE_START: 16,           // Zones start at offset 16
  SCAN_LIST_START: 1,       // Scan lists: count at 0x00, entries start at offset 1 using formula (57*N)-56
  METADATA_BYTE: 0xFFF,     // Offset to read metadata byte (last byte of 4KB block)
  QUICK_MESSAGE_COUNT: 0x00, // Count field at offset 0
  QUICK_MESSAGE_HEADER_SIZE: 0x10, // Header size (16 bytes: 1 byte count + 15 bytes padding)
  QUICK_MESSAGE_ENTRY_START: 0x10, // Entries start at offset 0x10
  DMR_RADIO_ID_COUNT: 0x00,  // Count field at offset 0 (4 bytes, DWORD, little-endian)
  DMR_RADIO_ID_BASE: 0x00,   // Entry base offset (entries start at buffer base)
  TALK_GROUP_COUNTER: 0x1FF, // Talk Groups counter in block 0x06 (offset 511)
  TX_CONTACT_VFO_A: 0x0FFA,  // VFO A TX Contact offset in block 0x43 (4KB block-relative)
  TX_CONTACT_VFO_B: 0x0FFC,  // VFO B TX Contact offset in block 0x43 (4KB block-relative)
} as const;

// TX Contact block constants
export const TX_CONTACT = {
  ENTRY_SIZE: 2,              // 2 bytes per channel
  MAX_CHANNELS_PER_BLOCK: 2048,
  LOW_BLOCK_CHANNELS: 2048,   // Block 0x42: channels 1-2048
  HIGH_BLOCK_START: 2049,     // Block 0x43: channels 2049+
  VFO_A_OFFSET: 0x0FFA,       // Fixed offset for VFO A in block 0x43 (4KB block-relative)
  VFO_B_OFFSET: 0x0FFC,       // Fixed offset for VFO B in block 0x43 (4KB block-relative)
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
  // Timeout values (in milliseconds)
  // Per-request timeout: 5s per message/ack cycle (matches C code), resets with each response
  TIMEOUT: {
    REQUEST_RESPONSE: 5000,  // 5s per request/response cycle (matches C code, resets on each message/ack)
    HANDSHAKE: 5000,         // 5s for handshake commands (PSEARCH, PASSSTA, etc.)
    READ_BYTES: 5000,        // 5s for reading bytes (per read operation)
    READ_MEMORY: 5000,       // 5s for reading memory blocks
    WRITE_MEMORY: 5000,      // 5s for write acknowledgment
    VFRAME_QUERY: 5000,      // 5s per V-frame query
    FILL_BUFFER: 5000,       // 5s for filling buffer
    PORT_OPEN: 5000,         // 5s for opening serial port (one-time operation)
  },
} as const;

// Channel limits
export const LIMITS = {
  CHANNEL_MAX: 4000,
  CHANNEL_MIN: 1,
  ZONES_MAX: 250,           // Maximum of 250 zones
  ZONES_PER_BLOCK: 28,      // Approximate (4096 - 16) / 145
  ZONE_CHANNELS_MAX: 64,    // Max 64 channels per zone
  SCAN_LISTS_PER_BLOCK: 44, // First 44 start at offset 16
  SCAN_LISTS_MAX: 32,        // Maximum of 32 scan lists
  SCAN_LIST_CHANNELS_MAX: 15,    // Max 15 channels per scan list (30 bytes / 2)
  DIGITAL_EMERGENCY_MAX: 37, // (4096 - 0x218) / 40 ≈ 37
  ANALOG_EMERGENCY_MAX: 108, // (4096 - 0xAC) / 36 ≈ 108
  QUICK_MESSAGES_MAX: 20,   // Maximum of 20 quick messages
  RX_GROUPS_MAX: 32,        // Max 32 groups (limited by 32-bit bitmask in header)
  DMR_RADIO_IDS_MAX: 250,   // Maximum of 250 DMR Radio IDs per spec
  TALK_GROUPS_MAX: 800,     // Maximum of 800 talk groups
} as const;

