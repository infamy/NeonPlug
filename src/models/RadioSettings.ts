/**
 * Radio Settings (Metadata 0x04)
 * Contains radio names, boot screen text, and other radio configuration
 */

export interface RadioSettings {
  // Header fields (0x00-0x20)
  unknownFlag: number;              // Offset 0x00
  powerOnDisplayLine1: string;     // Offset 0x01-0x0D (14 bytes, null-terminated)
  powerOnDisplayLine2: string;      // Offset 0x0F-0x1B (14 bytes, null-terminated)
  allowReset: boolean;              // Offset 0x1D (bit 0)
  powerOnInterface: number;         // Offset 0x1E (0-5)
  alertToneFlags: number;           // Offset 0x20 (8 bits, bit flags)
  alertToneFlagsCont: number;       // Offset 0x21 (8 bits, bit flags + 2-bit field)

  // Display and UI settings (0x30-0x3B)
  zoneAColor: number;               // Offset 0x30 (0-15)
  zoneBColor: number;                // Offset 0x31 (0-15)
  unknownDisplay: number;           // Offset 0x32
  displayFlags: number;             // Offset 0x33 (8 bits, bit flags + 2-bit field)
  backlightBrightness: number;      // Offset 0x34 (1-6)
  autoBacklightDuration: number;    // Offset 0x35 (5-30, step 5)
  menuExitTime: number;             // Offset 0x36 (1-30)
  standbyCharacterColor1: number;   // Offset 0x37 (0-30)
  callDisplayColor: number;          // Offset 0x38 (0-15)
  standbyCharacterColor2: number;   // Offset 0x39 (0-15)
  aChannelNameColor: number;         // Offset 0x3A (0-15)
  bChannelNameColor: number;        // Offset 0x3B (0-15)

  // Work mode and GPS settings (0x40-0x45)
  workModeFlags: number;             // Offset 0x40 (8 bits, bit flags + 2-bit fields)
  utcZone: number;                   // Offset 0x41 (0-25)
  measurePeriodInterval: number;    // Offset 0x42 (value+5)
  unknownFlags: number;              // Offset 0x45 (8 bits, bit flags + 2-bit field)

  // GPS/APRS and Digital settings (0x60-0x67)
  gpsAprsFlags: number;              // Offset 0x60 (8 bits, bit flags)
  callHoldTime: number;             // Offset 0x61 (0-61)
  activeWaitTime: number;            // Offset 0x62 (value+1)
  activeRetriesTime: number;        // Offset 0x63 (value+1)
  preCarrierTime: number;           // Offset 0x64 (direct value)
  digitalSettingsFlags: number;     // Offset 0x65 (8 bits, bit flags + 2-bit field)
  remoteMonitorTime: number;        // Offset 0x66 (direct value)
  digitalSettingsCont: number;       // Offset 0x67 (8 bits, bit flags + 2-bit field)

  // VFO/Embedded settings (0x80-0x81)
  vfoEmbeddedFlags: number;         // Offset 0x80 (8 bits, bit flags + 2-bit fields)
  txDwellTime: number;              // Offset 0x81 (direct value)

  // Language/Other settings (0xA0-0xA7)
  languageOtherSettings: Uint8Array; // Offset 0xA0-0xA7 (8 bytes)

  // Legacy fields (0x301+) - keeping for backward compatibility
  unknownRadioSetting: number;       // Offset 0x301
  radioEnabled: boolean;             // Offset 0x302 (bit 0)
  latitude: string;                 // Offset 0x306 (14 bytes)
  latitudeDirection: 'N' | 'S';    // Offset 0x30F (0x4E='N', 0x53='S')
  longitude: string;                 // Offset 0x310 (14 bytes)
  longitudeDirection: 'E' | 'W';    // Offset 0x319 (0x45='E', 0x57='W')
  currentChannelA: number;           // Offset 0x320 (1-based, 0 = none, little-endian uint16)
  currentChannelB: number;           // Offset 0x322 (1-based, 0 = none, little-endian uint16)
  channelSetting3: number;           // Offset 0x324 (little-endian uint16)
  channelSetting4: number;           // Offset 0x326 (little-endian uint16)
  channelSetting5: number;          // Offset 0x328 (little-endian uint16)
  channelSetting6: number;           // Offset 0x32A (little-endian uint16)
  channelSetting7: number;           // Offset 0x32C (little-endian uint16)
  channelSetting8: number;           // Offset 0x32E (little-endian uint16)
  currentZone: number;               // Offset 0x330 (1-based, 0 = none)
  zoneEnabled: boolean;              // Offset 0x331 (bit 0)
  unknownValue: string;              // Offset 0x332 (3 bytes, formatted as hex string)
}
