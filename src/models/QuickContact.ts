export interface QuickContact {
  index: number;              // Entry index (1-based)
  /**
   * Stable identity across edits, assigned at READ time. Optional because the
   * DM-32 has no use for it and its own reader does not set one.
   *
   * `index` cannot serve: `quickContactsStore.deleteContact` re-indexes the
   * survivors to `idx + 1` and `addContact` assigns `length + 1`, so a list
   * position stops corresponding to a hardware slot the moment anything is
   * added or removed. On the DA-7X2 that mapping is what a write places records
   * by, and losing it means writing every record after the edit into the wrong
   * slot. Zones already solve this with `Zone.id`; this is the same idea.
   *
   * A contact with NO uid is one the user just created — it gets the lowest
   * free slot, exactly like a new zone.
   */
  uid?: string;
  offset: number;             // Byte offset in the block where this entry starts
  name: string;               // Contact name (variable length, ASCII, null-terminated)
  contactNumber: number;      // Contact number (little-endian uint32)
  callType: number;           // Call type: 0x03 = Private Call, 0x04 = Group Call, 0x05 = All Call
  hasHeader: boolean;         // True if this is Contact 1 with 1-byte header (0x00)
  flag: number;               // Flag byte: 0x00 = PC-created, 0x01 = Radio-created
  rawData: Uint8Array;        // Raw entry data for debugging
}
