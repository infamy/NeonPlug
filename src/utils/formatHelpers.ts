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
 * Progress through a transfer, "3.6 of 12.9 MB": both numbers in the TOTAL's
 * unit, so the pair reads as one quantity (formatBytes picks a unit per number
 * and would print "512.0 KB of 12.9 MB"). 1,024-based, like the KB/s usually
 * printed beside it. Megabytes to one decimal from 1 MB up; whole kilobytes
 * below, where tenths of a megabyte are too coarse ("0.0 of 0.1 MB").
 */
export function formatByteProgress(done: number, total: number): string {
  const MB = 1024 * 1024;
  if (total >= MB) return `${(done / MB).toFixed(1)} of ${(total / MB).toFixed(1)} MB`;
  if (total >= 1024) {
    return `${Math.round(done / 1024).toLocaleString()} of ${Math.round(total / 1024).toLocaleString()} KB`;
  }
  return `${done} of ${total} B`;
}

/**
 * Clamp a value between min and max
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
