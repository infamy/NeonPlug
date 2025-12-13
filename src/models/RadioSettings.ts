/**
 * Radio Settings (Metadata 0x04)
 * Contains radio names, boot screen text, and other radio configuration
 */

import type { Channel } from './Channel';

export interface RadioSettings {
  // Header fields (0x00-0x20)
  unknownFlag: number;              // Legacy field (no longer used)
  powerOnInterface: number;         // Offset 0x00 (0-2)
  powerOnDisplayLine1: string;     // Offset 0x01-0x0D (14 bytes, null-terminated)
  powerOnDisplayLine2: string;      // Offset 0x0F-0x1B (14 bytes, null-terminated)
  allowReset: boolean;              // Offset 0x1D (bit 0)
  autoPowerOff: number;            // Offset 0x1E (0-5: 0=Off, 1=30 Min, 2=60 Min, 3=120 Min, 4=240 Min, 5=480 Min)
  alertToneFlags: number;           // Offset 0x20 (8 bits, bit flags)
  alertToneFlagsCont: number;       // Offset 0x21 (8 bits, bit flags + 2-bit field)

  // Display and UI settings (0x30-0x3B)
  backlightBrightness: number;      // Offset 0x30 (1-6, stored as 0-5, displayed as 1-6)
  unknownDisplay: number;           // Offset 0x32
  displayFlags: number;             // Offset 0x33 (8 bits, bit flags + 2-bit field)
  dataDisplayFormat: number;         // Offset 0x33, bit 3: 0=yyy/m/d (format 0), 1=d/m/yyy (format 1)
  callsignColor: number;            // Offset 0x34 (0-15) - Callsign Color
  standbyTextColor: number;         // Offset 0x35 (0-15) - Standby Text Color
  menuExitTime: number;             // Offset 0x36 (1-30)
  autoBacklightDuration: number;    // Offset 0x31 (5-30 seconds, step 5: 5, 10, 15, 20, 25, 30)
  standbyCharacterColor1: number;   // Offset 0x37 (0-30)
  channelAColor: number;               // Offset 0x38 (0-15) - Channel A Color
  channelBColor: number;                // Offset 0x39 (0-15) - Channel B Color
  standbyCharacterColor2: number;   // TODO: Offset unknown - Standby Character Color 2
  zoneAColor: number;         // Offset 0x3A (0-15) - Zone A Color
  zoneBColor: number;        // Offset 0x3B (0-15) - Zone B Color

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

  // Key Lock Settings (0x85-0x86, 0x93)
  lockKey: 'Manual' | 'Auto';          // Offset 0x85 (bit 0: 0=Manual, 1=Auto)
  knobLock: boolean;                  // Offset 0x85 (bit 1: 0=Off, 1=On)
  sideKeyLock: boolean;               // Offset 0x85 (bit 2: 0=Off, 1=On)
  autoKeypadLockDelayTime: number;    // Offset 0x86 (5-60, seconds)
  longPressTime: number;              // Offset 0x93 (1-5, 1=shortest, 5=longest)

  // Button Functions (0x87-0x90)
  sk1Short: number;                   // Offset 0x87 (0-42)
  sk1Long: number;                    // Offset 0x88 (0-42)
  sk2Short: number;                   // Offset 0x89 (0-42)
  sk2Long: number;                    // Offset 0x8A (0-42)
  p1Short: number;                    // Offset 0x8D (0-42)
  p1Long: number;                     // Offset 0x8E (0-42)
  p2Short: number;                    // Offset 0x8F (0-42)
  p2Long: number;                     // Offset 0x90 (0-42)

  // One Key Operation (0x11E-0x125, 0x1FB-0x213, 0x1F5-0x23B)
  analogCall: Array<{
    callType: number;                 // 0=No., 1=Call Type, 2=Call ID
    callId: number;                   // Contact number or ID
  }>;                                 // 4 entries, 2 bytes each, starting at 0x11E
  
  oneTouchCall: Array<{
    callType: number;                 // 0=Off, 1=Analog, 2=Digital
    callObject: number;               // Contact ID (uint16, little-endian)
    digitalCallType: number;          // 0=Off, 1=Private, 2=Group, etc.
    sms: number;                      // SMS number/index
  }>;                                 // 5 entries, 5 bytes each, starting at 0x1FB
  
  funPlus: Array<{
    operateMode: number;              // +0x00: 0=Call, 1=Menu
    menuSelect: number;                // +0x01: Menu item (0-13)
    callWay: number;                  // +0x03: 0=Off, 1=Analog, 2=Digital
    callObject: number;                // +0x04: Contact/ID
    digitalCallType: number;           // +0x05: Digital call type (0-8)
    sms: number;                      // +0x06: SMS number/index
  }>;                                 // 10 entries, 7 bytes each, starting at 0x230

  // Menu Enable/Disable Flags (0x500-0x507)
  menuEnableFlags: {
    // Offset 0x500
    zoneList: boolean;        // Bit 0, inverted
    newZone: boolean;         // Bit 1
    
    // Offset 0x501
    callAlert: boolean;       // Bit 0, inverted
    radioCheck: boolean;      // Bit 1
    remoteMonitor: boolean;   // Bit 2
    radioEnable: boolean;     // Bit 3
    radioDisable: boolean;    // Bit 4
    measurePeriod: boolean;   // Bit 5
    
    // Offset 0x502
    talkaround: boolean;      // Bit 0, inverted
    alertTone: boolean;       // Bit 1
    txPower: boolean;         // Bit 2
    startDisplay: boolean;    // Bit 3
    langSelect: boolean;      // Bit 4
    matchPrivate: boolean;    // Bit 5
    matchGroup: boolean;      // Bit 6
    displayMode: boolean;     // Bit 7
    
    // Offset 0x503
    smsFormat: boolean;       // Bit 0, inverted
    subChannelMode: boolean;  // Bit 1
    powerSave: boolean;       // Bit 2
    fmRadio: boolean;         // Bit 3
    gps: boolean;             // Bit 4
    aprs: boolean;            // Bit 5
    record: boolean;          // Bit 6
    
    // Offset 0x504
    addContact: boolean;      // Bit 0, inverted
    delContact: boolean;      // Bit 1
    editContact: boolean;     // Bit 2
    sendMessage: boolean;     // Bit 3
    functionality: boolean;   // Bit 4
    manualDial: boolean;      // Bit 5
    csvContacts: boolean;     // Bit 6
    
    // Offset 0x505 (Call Log section)
    missedCall: boolean;      // Bit 0, inverted
    answeredCall: boolean;    // Bit 1
    sentCall: boolean;        // Bit 2
    delLog: boolean;          // Bit 3
    
    // Offset 0x506 (Program section)
    rxFrequency: boolean;     // Bit 0, inverted
    txFrequency: boolean;     // Bit 1
    ctcDcs: boolean;          // Bit 2
    txContact: boolean;       // Bit 3
    colorCode: boolean;       // Bit 4
    timeSlot: boolean;        // Bit 5
    radioId: boolean;         // Bit 6
    radioName: boolean;       // Bit 7
    
    // Offset 0x507 (Program section continued)
    channelType: boolean;     // Bit 0, inverted
    tdmaDirectMode: boolean;  // Bit 1
    rxGroupList: boolean;     // Bit 2
    addChannel: boolean;      // Bit 3
    channelName: boolean;      // Bit 4
  };

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

  // VFO Channel Information
  vfoA: Channel;                     // Offset 0x276-0x2A5 (48 bytes) - VFO A Channel
  vfoB: Channel;                     // Offset 0x2A6-0x2D5 (48 bytes) - VFO B Channel
}
