/**
 * Scan List Model
 * Represents a scan list containing up to 15 channels
 * Based on the DM-32 format: fixed 57-byte entries at offset (57 * N) - 56.
 * Membership lives entirely in the +0x1A list (15 slots). The +0x0F slot is
 * NOT scanned by the radio — a channel stored there effectively vanishes —
 * so it is never treated as a member (hardware-verified 2026-08-07).
 */

export interface ScanList {
  name: string;                    // Max length per radio, caps.maxScanListNameLength (DM-32: an 11-byte field, null-terminated only when shorter)
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
  channels: number[];              // Up to 15 channel numbers (1-65535), user order
  channelCount?: number;           // Number of channels (auto-calculated, 0-15)
  ctcScanMode: number;             // 0-3: CTC Scan Mode (bits 0-1)
  scanTxMode: number;              // 0-2: Scan TX Mode (bits 2-3)
  hangTime?: number;               // In the radio's own units, caps.scanListHangTime (DM-32: 0.5s steps, 6 = 3.0s; D890UV: tenths), optional
  priority1Type?: number;          // 0=None, 1=Current, 2=Specific (bits 0-3 of priority types byte)
  priority2Type?: number;          // 0=None, 1=Current, 2=Specific (bits 4-7 of priority types byte)
  priorityChannel1?: number;       // Used when priority1Type=2 (DM-32: stored at +0x11). With caps.scanListPriorityMembersOnly it MUST be a list member
  priorityChannel2?: number;       // Used when priority2Type=2 (DM-32: stored at +0x13). With caps.scanListPriorityMembersOnly it MUST be a list member
  designatedTxChannel?: number;    // Storage offset UNKNOWN (+0x11 turned out to be Priority 1) — currently not read/written
}
