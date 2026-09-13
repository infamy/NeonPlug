export interface QuickContact {
  index: number;              // Entry index (1-based)
  /**
   * The hardware slot this talk group was READ from.
   *
   * ⚠️ NOT used to place records. Talk groups COMPACT — entry i is written to
   * slot i — so placement needs no identity at all. This exists for the other
   * half of a delete: channels and receive groups reference talk groups BY
   * SLOT, so when the table shifts every reference above the deleted entry must
   * shift with it. See `talkgroupRenumber.ts`.
   *
   * Absent on a talk group the user just added, which is correct: a new one
   * cannot be the target of a reference that predates it.
   */
  readSlot?: number;
  offset: number;             // Byte offset in the block where this entry starts
  name: string;               // Contact name (variable length, ASCII, null-terminated)
  contactNumber: number;      // Contact number (little-endian uint32)
  callType: number;           // Call type: 0x03 = Private Call, 0x04 = Group Call, 0x05 = All Call
  hasHeader: boolean;         // True if this is Contact 1 with 1-byte header (0x00)
  flag: number;               // Flag byte: 0x00 = PC-created, 0x01 = Radio-created
  rawData: Uint8Array;        // Raw entry data for debugging
}
