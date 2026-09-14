/**
 * UV5R-Mini capabilities: analog-only, 999 channels, no zones/scan lists.
 */

import type { RadioCapabilities, MemoryRegionSpec } from '../../types/radioCapabilities';
import { DEFAULT_BAND_LIMITS } from '../../types/radioCapabilities';
import {
  BAOFENG_CHANNEL_COUNT,
  BAOFENG_CHANNEL_SIZE,
  BAOFENG_FW_VER_OFFSET,
} from './constants';
import { UV5RMINI_SETTINGS_OFFSET } from './settingsFormat';

/**
 * Map of the UV5R-Mini clone image, for the Diagnostics image viewer.
 *
 * Note the image is assembled from three non-contiguous reads
 * (BAOFENG_MEM_STARTS 0x0000 / 0x9000 / 0xa000) into one buffer, so offsets here
 * are into that assembled image, not raw radio addresses.
 */
const UV5RMINI_MEMORY_REGIONS: MemoryRegionSpec[] = [
  {
    label: 'Channel slots',
    start: 0x0000,
    length: BAOFENG_CHANNEL_COUNT * BAOFENG_CHANNEL_SIZE,
    notes: `${BAOFENG_CHANNEL_COUNT} slots × ${BAOFENG_CHANNEL_SIZE} bytes. 0xff = empty.`,
  },
  {
    label: 'Firmware version string',
    start: BAOFENG_FW_VER_OFFSET,
    length: 16,
    notes:
      'NESTED inside the channel span: 0x1ef0 is 7,920 bytes in, which lands on ' +
      'channel slot 248 (7920 / 32). getFirmwareFromCache() reads it from there. ' +
      'Either the radio reserves that slot or the offset is wrong — unverified.',
  },
  {
    label: 'Settings',
    start: UV5RMINI_SETTINGS_OFFSET,
    length: 64,
    notes: 'Parsed by settingsFormat.ts. Written separately from channels.',
  },
];

export const UV5RMINI_CAPABILITIES: RadioCapabilities = {
  memoryRegions: UV5RMINI_MEMORY_REGIONS,
  bandLimits: DEFAULT_BAND_LIMITS,
  writeValidations: {
    channelsMustBeInZones: false,
  },
  maxChannels: 999,
  supportsZones: false,
  supportsScanLists: false,
  supportsContacts: false,
  analogOnly: true,
  supportsBle: true,
  preferredTransport: 'serial',
  supportsBulkRead: false,
};
