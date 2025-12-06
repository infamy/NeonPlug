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
  DIGITAL_EMERGENCY: 0x03,  // Digital Emergency Systems
  VFO_SETTINGS: 0x04,       // Radio Settings / Radio Names / Embedded Information
  ANALOG_EMERGENCY: 0x10,   // Analog Emergency Systems
  QUICK_MESSAGES: 0x0A,     // Quick text messages block
  RX_GROUPS: 0x0F,          // DMR RX Groups (DMR Receive Groups) - separate from V-frame 0x0F
  CALIBRATION: 0x02,        // Frequency adjustment/calibration data
  DMR_RADIO_IDS: 0x67,      // DMR Radio ID list block
  EMPTY: 0x00,              // Empty block
  EMPTY_ALT: 0xFF,          // Alternative empty block marker
} as const;

// Memory block sizes
export const BLOCK_SIZE = {
  STANDARD: 4096,           // 4KB blocks
  CHANNEL: 48,              // Bytes per channel
  ZONE: 145,                // Bytes per zone
  SCAN_LIST: 92,            // Bytes per scan list
  DIGITAL_EMERGENCY: 40,    // Bytes per digital emergency entry
  ANALOG_EMERGENCY: 36,     // Bytes per analog emergency entry
  ZONE_NAME: 11,            // Bytes for zone name
  CHANNEL_NAME: 16,         // Bytes for channel name
  QUICK_MESSAGE: 129,       // Bytes per quick message entry (0x81)
  RX_GROUP: 109,            // Bytes per DMR RX group entry (0x6D)
  DMR_RADIO_ID: 16,         // Bytes per DMR radio ID entry (0x10)
} as const;

// Memory offsets
export const OFFSET = {
  CHANNEL_COUNT: 0x00,      // Offset of channel count in first block
  FIRST_CHANNEL: 0x10,      // First channel starts at offset 0x10 in first block
  ZONE_START: 16,           // Zones start at offset 16
  SCAN_LIST_START: 16,      // Scan lists start at offset 16 (for first 44)
  METADATA_BYTE: 0xFFF,     // Offset to read metadata byte (last byte of 4KB block)
  QUICK_MESSAGE_COUNT: 0x00, // Count field at offset 0
  QUICK_MESSAGE_BASE: 0x80,  // Entry base offset (128) for entry 0
  DMR_RADIO_ID_COUNT: 0x00,  // Count field at offset 0 (4 bytes, DWORD, little-endian)
  DMR_RADIO_ID_BASE: 0x00,   // Entry base offset (entries start at buffer base)
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
  // Per-request timeout: 1s per message/ack cycle, resets with each response
  TIMEOUT: {
    REQUEST_RESPONSE: 1000,  // 1s per request/response cycle (resets on each message/ack)
    HANDSHAKE: 2000,         // 2s for handshake commands (PSEARCH, PASSSTA, etc.)
    READ_BYTES: 2000,        // 2s for reading bytes (per read operation)
    READ_MEMORY: 5000,       // 5s for reading memory blocks (allows for multiple 2s reads within a block)
    WRITE_MEMORY: 2000,      // 2s for write acknowledgment
    VFRAME_QUERY: 2000,      // 2s per V-frame query
    FILL_BUFFER: 2000,       // 2s for filling buffer
    PORT_OPEN: 5000,         // 5s for opening serial port (one-time operation)
  },
} as const;

// Channel limits
export const LIMITS = {
  CHANNEL_MAX: 4000,
  CHANNEL_MIN: 1,
  ZONES_PER_BLOCK: 28,      // Approximate (4096 - 16) / 145
  SCAN_LISTS_PER_BLOCK: 44, // First 44 start at offset 16
  SCAN_LIST_CHANNELS_MAX: 16,
  DIGITAL_EMERGENCY_MAX: 37, // (4096 - 0x218) / 40 ≈ 37
  ANALOG_EMERGENCY_MAX: 108, // (4096 - 0xAC) / 36 ≈ 108
  QUICK_MESSAGES_MAX: 30,   // floor((4096 - 128) / 129) = 30
  RX_GROUPS_MAX: 37,        // floor(4096 / 109) = 37
  DMR_RADIO_IDS_MAX: 256,   // 4096 / 16 = 256
} as const;

