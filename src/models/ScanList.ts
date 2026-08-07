/**
 * Scan List Model
 * Represents a scan list containing up to 15 channels
 * Based on the DM-32 format: fixed 57-byte entries at offset (57 * N) - 56.
 * Membership lives entirely in the +0x1A list (15 slots). The +0x0F slot is
 * NOT scanned by the radio — a channel stored there effectively vanishes —
 * so it is never treated as a member (hardware-verified 2026-08-07).
 */

export interface ScanList {
  name: string;                    // Max 11 chars (11-byte field, null-terminated only when shorter)
  channels: number[];              // Up to 15 channel numbers (1-65535), user order
  channelCount?: number;           // Number of channels (auto-calculated, 0-15)
  ctcScanMode: number;             // 0-3: CTC Scan Mode (bits 0-1)
  scanTxMode: number;              // 0-2: Scan TX Mode (bits 2-3)
  hangTime?: number;               // 0.5s steps (6 = 3.0s), raw radio byte, optional
  priority1Type?: number;          // 0=None, 1=Current, 2=Specific (bits 0-3 of priority types byte)
  priority2Type?: number;          // 0=None, 1=Current, 2=Specific (bits 4-7 of priority types byte)
  priorityChannel1?: number;       // Stored directly at +0x11 when priority1Type=2; MUST be a list member (radio discards non-member priorities)
  priorityChannel2?: number;       // Stored directly at +0x13 when priority2Type=2; MUST be a list member (radio discards non-member priorities)
  designatedTxChannel?: number;    // Storage offset UNKNOWN (+0x11 turned out to be Priority 1) — currently not read/written
}
