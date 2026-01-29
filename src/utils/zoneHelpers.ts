/**
 * Zone Helper Utilities
 */

/**
 * Generate a unique ID for a zone
 */
export function generateZoneId(): string {
  return `zone-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
