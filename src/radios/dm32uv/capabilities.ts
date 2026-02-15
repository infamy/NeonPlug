/**
 * DM-32UV capabilities for diagnostics, digital tab, and validation.
 * Referenced by the capabilities registry; no UI imports this directly.
 */
import type { RadioCapabilities } from '../../types/radioCapabilities';
import { DEFAULT_BAND_LIMITS } from '../../types/radioCapabilities';
import { parseRadioSettings } from './structures';
import { decodeBCDFrequency, decodeCTCSSDCS } from './structures';
import { parseEncryptionKeys, parseDigitalEmergencies } from './structures';
import { LIMITS } from './constants';
import { isFirmware049OrNewer } from '../../utils/firmware';

export const DM32UV_CAPABILITIES: RadioCapabilities = {
  diagnostics: {
    parseRadioSettings,
    decodeBCDFrequency,
    decodeCTCSSDCS,
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
  writeValidations: {
    channelsMustBeInZones: true,
  },
  maxChannels: 4000,
  supportsVfoChannels: true,
  supportsZones: true,
  supportsScanLists: true,
  analogOnly: false,
  supportsBulkRead: true,
  maxZones: LIMITS.ZONES_MAX,
  maxScanLists: LIMITS.SCAN_LISTS_MAX,
  supportsBootImage: true,
  supportsQuickMessages: true,
};
