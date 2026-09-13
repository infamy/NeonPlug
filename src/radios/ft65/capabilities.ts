import type { RadioCapabilities, MemoryRegionSpec } from '../../types/radioCapabilities';
import {
  FT65_MAX_CHANNELS,
  FT65_CHANNEL_SIZE,
  FT65_ADDR_CHANNELS,
  FT65_ADDR_ENABLE,
  FT65_ADDR_SCAN,
  FT65_ADDR_NAMES,
  FT65_ADDR_TXFREQS,
  FT65_ADDR_SETTINGS,
} from './constants';

/**
 * Map of the SCU-35 clone image, for the Diagnostics image viewer.
 *
 * Block 0 is called out because it is read-only: it holds the radio type ID and
 * the write loop deliberately starts at block 1. Anyone reading a dump needs to
 * know that before wondering why it never changes.
 */
const FT65_MEMORY_REGIONS: MemoryRegionSpec[] = [
  {
    label: 'Block 0 — radio type ID',
    start: 0x0000,
    length: FT65_ADDR_CHANNELS,
    notes: 'Read-only. Writes start at block 1; overwriting this can brick the radio.',
  },
  {
    label: 'Channel slots',
    start: FT65_ADDR_CHANNELS,
    length: FT65_MAX_CHANNELS * FT65_CHANNEL_SIZE,
    notes: `${FT65_MAX_CHANNELS} slots × ${FT65_CHANNEL_SIZE} bytes`,
  },
  {
    label: 'Enable bitmap',
    start: FT65_ADDR_ENABLE,
    length: 32,
    notes: '1 bit per channel. All-zero means every channel is disabled.',
  },
  { label: 'Scan bitmap', start: FT65_ADDR_SCAN, length: 32, notes: '1 bit per channel.' },
  { label: 'Names', start: FT65_ADDR_NAMES, length: 220 * 8, notes: '8 bytes per entry.' },
  { label: 'TX frequencies', start: FT65_ADDR_TXFREQS, length: 220 * 4, notes: '4 bytes per entry.' },
  {
    label: 'Settings',
    start: FT65_ADDR_SETTINGS,
    length: 64,
    notes: 'Parsed by settingsFormat.ts (shared with FT-4 / FT-25R).',
  },
];

const FT65_CAPS_BASE: RadioCapabilities = {
  memoryRegions: FT65_MEMORY_REGIONS,
  bandLimits: {
    vhfMin: 136,
    vhfMax: 174,
    uhfMin: 400,
    uhfMax: 480,
  },
  writeValidations: { channelsMustBeInZones: false },
  maxChannels: 200,
  supportsZones: false,
  supportsScanLists: false,
  supportsContacts: false,
  analogOnly: true,
  supportsBle: false,
  preferredTransport: 'serial',
  supportsBulkRead: false,
};

/** FT-65R / FT-65E and FT-4XR / FT-4XE: dual-band VHF+UHF. */
export const FT65_CAPS_DUAL: RadioCapabilities = { ...FT65_CAPS_BASE };

/** FT-25R / FT-4VR: VHF-only — no UHF band, so UHF channels are filtered out before write. */
export const FT_CAPS_VHF: RadioCapabilities = {
  ...FT65_CAPS_BASE,
  bandLimits: { vhfMin: 136, vhfMax: 174 },
};
