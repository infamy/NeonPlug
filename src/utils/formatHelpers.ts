/**
 * Common formatting and utility helper functions
 */

/**
 * Format a memory address as hexadecimal
 */
export function formatAddress(addr?: number): string {
  if (addr === undefined) return 'N/A';
  return `0x${addr.toString(16).padStart(6, '0').toUpperCase()}`;
}

/**
 * Format bytes as human-readable size
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

/**
 * Clamp a value between min and max
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
