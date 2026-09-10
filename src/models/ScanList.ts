/**
 * Scan List Model
 * Represents a scan list containing up to 15 channels
 * Based on spec: fixed 57-byte entries at offset (57 * N) - 56
 */

export interface ScanList {
  name: string;                    // Max 10 chars (11 bytes with null terminator)
  /**
   * Hardware slot, when the radio that produced this list has one.
   *
   * The DA-7X2 reads scan lists by walking a presence mask, so array position
   * is NOT the slot — the two diverge the moment a slot in the middle is
   * unused. `ScanListDecoded` carries this, but that type never leaves
   * `radios/d890uv/`, so without it here the slot is lost the instant a list
   * reaches the store and a write would place every list after a gap into the
   * wrong record.
   *
   * Optional: the DM-32 has no equivalent, and a list the user just created has
   * no slot until one is allocated.
   */
  slot?: number;
  channels: number[];              // Up to 15 channel numbers (1-65535)
  channelCount?: number;           // Number of channels (auto-calculated, 0-15)
  ctcScanMode: number;             // 0-3: CTC Scan Mode (bits 0-1)
  scanTxMode: number;              // 0-2: Scan TX Mode (bits 2-3)
  hangTime?: number;               // Tenths of seconds (1-255 = 0.1s to 25.5s), optional
  priority1Type?: number;          // 0=None, 1=Current, 2=Specific (bits 0-3 of priority types byte)
  priority2Type?: number;          // 0=None, 1=Current, 2=Specific (bits 4-7 of priority types byte)
  priorityChannel1?: number;       // Channel ID (1-999), stored directly, optional
  priorityChannel2?: number;       // Channel ID (0-999), ENCODED with -2, optional (0=None, 1=Current, 2+=Specific)
  designatedTxChannel?: number;    // Channel ID (0-999), ENCODED with -2, optional (0=None, 1=Current, 2+=Specific)
}
