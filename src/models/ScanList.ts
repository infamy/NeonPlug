/**
 * Scan List Model
 * Represents a scan list containing up to 16 channels
 */

export interface ScanList {
  name: string;
  ctcScanMode: number; // 0-3
  settings: number[]; // 8 bytes
  channels: number[]; // Up to 16 channel numbers
}

