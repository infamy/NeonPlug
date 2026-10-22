import type { RadioHardwareFeature } from '../../types/radio';

/**
 * Byte 0x80 of the factory info page (connection.readFactoryInfo) is the
 * vendor CPS's "Function Item" list, one bit each, as its Solidifying dialog
 * shows them (CPS 1.45 and 1.60 agree). Not yet checked against a radio.
 */
export const FACTORY_INFO_FEATURE_OFFSET = 0x80;

const FEATURE_BITS: ReadonlyArray<[RadioHardwareFeature, number]> = [
  ['vibrate', 0x01],
  ['manDown', 0x02],
  ['gps', 0x04],
  ['bluetooth', 0x08],
  ['sdCard', 0x10],
  ['roaming', 0x20],
  ['recording', 0x40],
];

/**
 * Erased flash reads 0xFF. A DM-32UV answered 0xFF here on 2026-10-10, claiming
 * Bluetooth it does not have; bit 7 is not one of the CPS's items either. So
 * 0xFF is a page nobody programmed, and says nothing about the hardware.
 */
const UNPROGRAMMED = 0xff;

export function parseHardwareFeatures(page: Uint8Array): Partial<Record<RadioHardwareFeature, boolean>> | undefined {
  if (page.length <= FACTORY_INFO_FEATURE_OFFSET) return undefined;
  const flags = page[FACTORY_INFO_FEATURE_OFFSET];
  if (flags === UNPROGRAMMED) return undefined;
  return Object.fromEntries(FEATURE_BITS.map(([feature, bit]) => [feature, (flags & bit) !== 0]));
}
