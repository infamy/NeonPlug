/**
 * DM-32UV capabilities for diagnostics, digital tab, and validation.
 * Referenced by the capabilities registry; no UI imports this directly.
 */
import type { RadioCapabilities } from '../../types/radioCapabilities';
import { DEFAULT_BAND_LIMITS } from '../../types/radioCapabilities';
import { parseRadioSettings } from './structures';
import { decodeBCDFrequency, decodeCTCSSDCS } from './structures';
import { parseEncryptionKeys, parseDigitalEmergencies } from './structures';
import { DM32_BLOCK_LAYOUTS } from './blockLayouts';
import { LIMITS } from './constants';
import { isFirmware049OrNewer } from '../../utils/firmware';

export const DM32UV_CAPABILITIES: RadioCapabilities = {
  diagnostics: {
    parseRadioSettings,
    decodeBCDFrequency,
    decodeCTCSSDCS,
    blockLayouts: DM32_BLOCK_LAYOUTS,
  },
  digital: {
    parseEncryptionKeys,
    parseDigitalEmergencies,
    limits: {
      TALK_GROUPS_MAX: LIMITS.TALK_GROUPS_MAX,
      DMR_RADIO_IDS_MAX: LIMITS.DMR_RADIO_IDS_MAX,
      QUICK_MESSAGES_MAX: LIMITS.QUICK_MESSAGES_MAX,
      RX_GROUPS_MAX: LIMITS.RX_GROUPS_MAX,
      SCAN_LISTS_MAX: LIMITS.SCAN_LISTS_MAX,
    },
  },
  bandLimits: DEFAULT_BAND_LIMITS,
  isFirmware049OrNewer,
  expectedFirmware: 'DM32.01.L01.048',
  writeValidations: {
    channelsMustBeInZones: true,
  },
  /**
   * The DM-32 is the radio this grid was originally built around, so it declares
   * every optional column. Anything absent here would vanish from its UI.
   */
  channelColumns: [
    'loneWorker', 'freeToAir', 'emergency', 'aprs', 'vox',
    'audioProcessing', 'squelch', 'pttId', 'stepFrequency', 'signalType',
    'encryption', 'tdma', 'confirmations',
  ],
  maxChannels: 4000,
  supportsVfoChannels: true,
  supportsZones: true,
  supportsScanLists: true,
  analogOnly: false,
  supportsBulkRead: true,
  maxZones: LIMITS.ZONES_MAX,
  maxZoneChannels: LIMITS.ZONE_CHANNELS_MAX,
  maxRxGroupMembers: LIMITS.RX_GROUPS_MAX,
  maxScanLists: LIMITS.SCAN_LISTS_MAX,
  maxScanListChannels: LIMITS.SCAN_LIST_CHANNELS_MAX,
  supportsBootImage: true,
  supportsQuickMessages: true,
  supportsAnalogEmergency: true,
};
