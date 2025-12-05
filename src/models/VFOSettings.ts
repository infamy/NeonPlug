/**
 * Radio Settings (Metadata 0x04)
 * Contains radio names, boot screen text, and other radio configuration
 */

export interface RadioSettings {
  // Header fields (0x00-0x20)
  unknownFlag: number;              // Offset 0x00
  radioNameA: string;               // Offset 0x01 (14 bytes, chunked format)
  radioNameB: string;               // Offset 0x0F (14 bytes, chunked format)
  bitFlags1: number;                // Offset 0x1D (bit 0 used)
  value: number;                    // Offset 0x1E (range 0-5)
  bitFlags2: number;                // Offset 0x20 (bits: 0x80, 0x40, 0x20, 0x10, 0x08, 0x04, 0x02)

  // Radio Settings (0x301+)
  unknownRadioSetting: number;         // Offset 0x301
  radioEnabled: boolean;              // Offset 0x302 (bit 0)
  latitude: string;                 // Offset 0x306 (14 bytes)
  latitudeDirection: 'N' | 'S';     // Offset 0x30F (0x4E='N', 0x53='S')
  longitude: string;                // Offset 0x310 (14 bytes)
  longitudeDirection: 'E' | 'W';    // Offset 0x319 (0x45='E', 0x57='W')
  currentChannelA: number;           // Offset 0x320 (1-based, 0 = none, little-endian uint16)
  currentChannelB: number;          // Offset 0x322 (1-based, 0 = none, little-endian uint16)
  channelSetting3: number;          // Offset 0x324 (little-endian uint16)
  channelSetting4: number;          // Offset 0x326 (little-endian uint16)
  channelSetting5: number;          // Offset 0x328 (little-endian uint16)
  channelSetting6: number;          // Offset 0x32A (little-endian uint16)
  channelSetting7: number;          // Offset 0x32C (little-endian uint16)
  channelSetting8: number;          // Offset 0x32E (little-endian uint16)
  currentZone: number;              // Offset 0x330 (1-based, 0 = none)
  zoneEnabled: boolean;             // Offset 0x331 (bit 0)
  unknownValue: string;             // Offset 0x332 (3 bytes, formatted as hex string)
}

