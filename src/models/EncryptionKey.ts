/**
 * Encryption Key Model
 * Represents a single encryption key entry from metadata block 0x10
 * Entry Size: 44 bytes (0x2C)
 * Initial Offset: 0x300
 * Entry Calculation: entry_base = 0x300 + (entry_num - 1) * 0x2C
 */
export interface EncryptionKey {
  /** Entry number (1-8, 1-based for UI) */
  entryNumber: number;
  
  /** ID (1 byte, 0x01-0x08) */
  id: number;
  
  /** Name (10 bytes, ASCII string) */
  name: string;
  
  /** Encryption Type (1 byte, 0-4: 0=None, 1=Custom, 2=ARC4, 3=AES128, 4=AES256) */
  encryptionType: number;
  
  /** Key (32 bytes, 64 hex chars) */
  key: string;

  /**
   * Radio-side identifier that a channel references to select this key.
   *
   * Present only on radios whose key table carries an ID separate from the
   * slot — the DA-7X2's basic "Encryption Code" table stores a 16-bit ID
   * alongside the key, and a channel points at that ID rather than at the slot.
   * The DM-32 has no equivalent, so this is undefined there and must stay
   * optional.
   *
   * It is NOT the same as `id`, which is the slot/entry number.
   */
  encryptionId?: number;
}

