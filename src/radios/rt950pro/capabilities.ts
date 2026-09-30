/**
 * Radtel RT-950 Pro capabilities: analog, 960 channels, no zones or scan lists
 * in this driver.
 */

import type { MemoryRegionSpec, RadioCapabilities } from '../../types/radioCapabilities';
import { RT950PRO_CHANNEL_COUNT, RT950PRO_NAME_LENGTH, RT950PRO_SEGMENTS, RT950PRO_SEGMENT_OFFSETS } from './constants';

/** The image is the vendor CPS's regions laid end to end; the notes give each one's address on the radio. */
const RT950PRO_MEMORY_REGIONS: MemoryRegionSpec[] = RT950PRO_SEGMENTS.map((segment, i) => ({
  label: segment.label,
  start: RT950PRO_SEGMENT_OFFSETS[i],
  length: segment.length,
  notes:
    `Radio address 0x${segment.address.toString(16).padStart(4, '0')}, ` +
    `read 0x${segment.readCommand.toString(16)} / write 0x${segment.writeCommand.toString(16)}.` +
    (segment.label === 'Channels' ? ' 960 slots of 32 bytes; 0xFF = empty.' : ''),
}));

export const RT950PRO_CAPABILITIES: RadioCapabilities = {
  memoryRegions: RT950PRO_MEMORY_REGIONS,
  // What the radio tunes, per the RT-950 Pro CHIRP driver: 18–64 MHz and
  // 70–580 MHz (airband receive-only). Used to flag frequencies in the grid;
  // a write never drops a channel for its band (writeKeepsEveryBand).
  bandLimits: { vhfMin: 18, vhfMax: 64, uhfMin: 70, uhfMax: 580 },
  // A channel is its slot, so a channel the band filter dropped would be
  // DELETED from the radio — the DA-7X2's lesson.
  writeKeepsEveryBand: true,
  writeValidations: { channelsMustBeInZones: false },
  maxChannels: RT950PRO_CHANNEL_COUNT,
  maxChannelNameLength: RT950PRO_NAME_LENGTH,
  channelDeleteKeepsNumbers: true,
  supportsZones: false,
  supportsScanLists: false,
  supportsContacts: false,
  analogOnly: true,
  // It can be programmed over Bluetooth as well (data on ffe1 after an unlock
  // on ff31), which this driver doesn't do yet.
  supportsBle: false,
  preferredTransport: 'serial',
  supportsBulkRead: false,
};
