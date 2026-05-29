/**
 * Digital Emergency System (Metadata 0x10, offset 0x000)
 * Entry structure: 20 bytes (0x14), max 8 entries
 * Confirmed by hexdump + CPS decompilation (DMR CPS.exe.c FUN_00470xxx accessors)
 */

export interface DigitalEmergency {
  index: number;                  // Entry index (0-based)
  name: string;                   // +0x00–0x09: 10 bytes ASCII, null-padded
  alarmType: number;              // +0x0A: 0–5 (None/Only Whistle/Normal/Secret/Secret With Voice/Alarm Whistle), raw = value
  alarmMode: number;              // +0x0B: 0–2 (Emergency Alarm/Alarm Call/Emergency Call), stored as value+1
  revertChannel: number;          // +0x0C–0x0D: u16 LE channel reference
  retransmission: number;         // +0x0E: 1–15, raw = value
  hotMicDuration: number;         // +0x0F: 1–15 seconds, raw = value
  emergencyCallsNumber: number;   // +0x10: 10–120 in steps of 10, stored as (value/10)-1 (raw 0–11)
  enabled: boolean;               // +0x11: bit 0
  rxDurationTime: number;         // +0x12: 1–255 seconds, raw = value
  autoEmergencyCallTimer: number; // +0x13: 10–120 in steps of 10, stored as (value/10)-1 (raw 0–11)
}

export interface DigitalEmergencyConfig {
  // Placeholder — not used
  [key: string]: unknown;
}
