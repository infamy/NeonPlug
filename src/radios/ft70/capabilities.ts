import type { RadioCapabilities } from '../../types/radioCapabilities';

/**
 * The FT-70D has no software-triggerable clone mode — the user must arm it
 * manually on the radio before each Read/Write. Steps from CHIRP's
 * ft70.py get_prompts() (pre_download / pre_upload).
 */
const FT70_CLONE_MODE_INSTRUCTIONS = {
  read:
    'FT-70D Clone Mode — Read (radio → computer)\n\n' +
    '1. Turn the radio on and connect the USB clone cable to the DATA terminal.\n' +
    '2. Unclip the battery, then press and hold [AMS] + the power key while clipping the battery back in. "ADMS" appears on the display.\n' +
    '3. Click Continue below, then immediately press the [BAND] key on the radio to start sending.',
  write:
    'FT-70D Clone Mode — Write (computer → radio)\n\n' +
    '1. Turn the radio on and connect the USB clone cable to the DATA terminal.\n' +
    '2. Unclip the battery, then press and hold [AMS] + the power key while clipping the battery back in. "ADMS" appears on the display.\n' +
    '3. Press the [MODE] key on the radio — the display shows "-WAIT-" — then click Continue below.',
};

/** FT-70D / FT-70DR / FT-70DE: dual-band VHF+UHF, C4FM digital voice (decoded as analog-only here). */
export const FT70_CAPS: RadioCapabilities = {
  cloneModeInstructions: FT70_CLONE_MODE_INSTRUCTIONS,
  bandLimits: {
    vhfMin: 136,
    vhfMax: 174,
    uhfMin: 400,
    uhfMax: 480,
  },
  writeValidations: { channelsMustBeInZones: false },
  maxChannels: 900,
  supportsZones: false, // FT-70 has 24 banks (chirp FT70Bank); not yet mapped to NeonPlug zones
  supportsScanLists: false,
  supportsContacts: false,
  analogOnly: true,
  supportsBle: false,
  preferredTransport: 'serial',
  supportsBulkRead: false,
};
