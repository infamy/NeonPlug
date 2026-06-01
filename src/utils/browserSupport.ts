/**
 * Utility functions for browser feature detection
 */

export function isWebSerialSupported(): boolean {
  return 'serial' in navigator;
}

export function isWebBluetoothSupported(): boolean {
  return 'bluetooth' in navigator;
}

/** Browsers that support both Web Serial and Web Bluetooth */
export function getSupportedBrowsers(): string[] {
  return ['Chrome', 'Edge', 'Opera', 'Brave'];
}
