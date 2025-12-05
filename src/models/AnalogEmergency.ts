/**
 * Analog Emergency System (Metadata 0x10)
 * Analog emergency system configurations
 */

export interface AnalogEmergency {
  index: number;                    // Entry index (0-based)
  name: string;                      // 17 bytes, null-terminated
  alarmType: number;                  // 0-4: None, Only Whistle, Normal, Secret, Secret With Voice
  alarmMode: number;                 // 0-1: Emergency Alarm, Alarm Call, Emergency Call
  signalling: number;                 // 0-3: BDC1200 1-4
  revertChannel: number;             // 1-16, stored as value - 1
  squelchMode: number;               // 0-1: Carrier, CTC, stored as value + 1
  idType: number;                    // 0-1: None, BDC1200, stored as value + 1
  flags: number;                      // Status byte
  frequencyId: number;               // 16-bit value, little-endian
  enabled: boolean;                   // Flags bit 0: enabled/disabled
  // Secondary structure (20 bytes at offset -0x14 + entry*0x14)
  secondaryData?: Uint8Array;
  // Tertiary structure (44 bytes at offset 0x2D5 + entry*0x2C)
  tertiaryData?: Uint8Array;
}

