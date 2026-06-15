import type { RadioCapabilities } from '../../types/radioCapabilities';

const FT65_CAPS_BASE: RadioCapabilities = {
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

/** FT-65R / FT-65E: dual-band VHF+UHF. */
export const FT65_CAPS_DUAL: RadioCapabilities = { ...FT65_CAPS_BASE };

/** FT-4XR / FT-4XE: dual-band VHF+UHF. */
export const FT4X_CAPS_DUAL: RadioCapabilities = { ...FT65_CAPS_BASE };

/** FT-25R / FT-4VR: VHF-only. */
export const FT_CAPS_VHF: RadioCapabilities = {
  ...FT65_CAPS_BASE,
  bandLimits: { vhfMin: 136, vhfMax: 174, uhfMin: 400, uhfMax: 480 },
};
