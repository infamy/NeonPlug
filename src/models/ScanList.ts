/**
 * Scan List Model
 * Represents a scan list containing up to 16 channels
 * Based on spec: fixed 92-byte entries at offset 0x10 + (listNum - 1) * 92
 */

export interface ScanList {
  name: string;                    // Max 15 chars (16 bytes with null terminator)
  channels: number[];              // Up to 16 channel numbers (1-65535)
  ctcScanMode: number;             // 0-3: CTC Scan Mode (bits 0-1 of settings byte)
  scanTxMode: number;              // 0-2: Scan TX Mode (bits 2-3 of settings byte)
  hangTime?: string;               // ASCII string (seconds), optional
  priorityChannel1?: number;       // Channel ID (1-65535), optional, empty = 0xFFFF
  priorityChannel2?: number;       // Channel ID (1-65535), optional, empty = 0xFFFF
  designatedTxChannel?: number;    // Channel ID (1-65535), optional, empty = 0xFFFF
  prioritySweepTime?: string;     // ASCII string (milliseconds), optional
}
