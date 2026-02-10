/**
 * UV5R-Mini capabilities: analog-only, 999 channels, no zones/scan lists.
 */

import type { RadioCapabilities } from '../../types/radioCapabilities';
import { DEFAULT_BAND_LIMITS } from '../../types/radioCapabilities';

export const UV5RMINI_CAPABILITIES: RadioCapabilities = {
  bandLimits: DEFAULT_BAND_LIMITS,
  writeValidations: {
    channelsMustBeInZones: false,
  },
  maxChannels: 999,
  supportsZones: false,
  supportsScanLists: false,
  supportsContacts: false,
  analogOnly: true,
};
