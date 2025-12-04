/**
 * Firmware utility functions
 */

/**
 * Contact structure size in bytes
 * Based on parseContacts: each contact is 16 bytes
 */
const CONTACT_SIZE = 16;

/**
 * Get contact capacity based on V-frame 0x0F memory range
 * 
 * Calculates capacity from the actual storage space allocated:
 * - Capacity = (endAddr - startAddr + 1) / CONTACT_SIZE
 * 
 * Typical values:
 * - Standard: ~50,000 contacts (depends on memory range)
 * - L01 variant: ~150,000 contacts (larger memory range)
 * 
 * @param contactsVFrame V-frame 0x0F data (8 bytes: start_addr + end_addr, both 4 bytes LE)
 * @returns Maximum number of contacts, or null if V-frame is invalid
 */
export function getContactCapacityFromVFrame(contactsVFrame: Uint8Array | undefined): number | null {
  if (!contactsVFrame || contactsVFrame.length < 8) {
    return null;
  }
  
  // Parse memory range (8 bytes: start_addr (4 bytes LE) + end_addr (4 bytes LE))
  const startAddr = contactsVFrame[0] | 
                    (contactsVFrame[1] << 8) | 
                    (contactsVFrame[2] << 16) | 
                    (contactsVFrame[3] << 24);
  const endAddr = contactsVFrame[4] | 
                  (contactsVFrame[5] << 8) | 
                  (contactsVFrame[6] << 16) | 
                  (contactsVFrame[7] << 24);
  
  if (startAddr === 0 && endAddr === 0) {
    return null; // Contacts disabled or not available
  }
  
  // Calculate capacity: (endAddr - startAddr + 1) / CONTACT_SIZE
  const totalBytes = endAddr - startAddr + 1;
  const capacity = Math.floor(totalBytes / CONTACT_SIZE);
  
  return capacity;
}

/**
 * Get contact capacity based on firmware version (fallback method)
 * 
 * If firmware contains "L01", the radio has room for 150,000 contacts.
 * Otherwise, it has room for 50,000 contacts.
 * 
 * This is a fallback when V-frame 0x0F is not available.
 * 
 * @param firmware Firmware version string (e.g., "DM32.01.01.046" or "DM32.01.L01.048")
 * @returns Maximum number of contacts
 */
export function getContactCapacity(firmware: string): number {
  if (firmware.includes('L01')) {
    return 150000;
  }
  return 50000;
}

/**
 * Get contact capacity with firmware priority
 * 
 * Uses firmware string check first (L01 = 150k, otherwise 50k).
 * This is the primary method as it's more reliable than V-frame calculation.
 * 
 * @param _contactsVFrame V-frame 0x0F data (currently unused, kept for future use)
 * @param firmware Firmware version string (e.g., "DM32.01.01.046" or "DM32.01.L01.048")
 * @returns Maximum number of contacts (150000 for L01, 50000 otherwise)
 */
export function getContactCapacityWithFallback(
  _contactsVFrame: Uint8Array | undefined,
  firmware: string
): number {
  // Primary method: Check firmware string
  // L01 firmware = 150,000 contacts, otherwise 50,000 contacts
  return getContactCapacity(firmware);
}

/**
 * Check if firmware is the L01 variant (extended contact capacity)
 * 
 * @param firmware Firmware version string
 * @returns True if firmware contains "L01"
 */
export function isL01Firmware(firmware: string): boolean {
  return firmware.includes('L01');
}

