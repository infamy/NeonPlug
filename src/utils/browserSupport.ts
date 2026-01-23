/**
 * Utility functions for browser feature detection
 */

/**
 * Check if the current browser supports the Web Serial API
 * @returns true if Web Serial API is supported, false otherwise
 */
export function isWebSerialSupported(): boolean {
  return 'serial' in navigator;
}

/**
 * Get a list of browsers that support Web Serial API
 * @returns Array of supported browser names
 */
export function getSupportedBrowsers(): string[] {
  return ['Chrome', 'Edge', 'Opera', 'Brave'];
}

/**
 * Get a user-friendly message for browsers that don't support Web Serial API
 * @returns Warning message string
 */
export function getWebSerialUnsupportedMessage(): string {
  const browsers = getSupportedBrowsers().join(', ');
  return `Your browser does not support the Web Serial API. Please use ${browsers} to connect to your radio.`;
}
