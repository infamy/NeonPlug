/**
 * DM-3x radio descriptors: the DM-32UV / DP570UV and the DM-36, one driver.
 * Registered in radios/index.ts.
 */
import type { RadioDescriptor } from '../types';
import type { RadioCapabilities } from '../../types/radioCapabilities';
import { DM3xRadio, DM36_VARIANT } from './protocol';
import { DM32UV_CAPABILITIES } from './capabilities';
import { DM32UV_SETTINGS_PROFILE } from './settingsProfile';

export const DM32_MODEL_IDS = ['DM-32UV', 'DP570UV'] as const;

export const DM32UV_DESCRIPTOR: RadioDescriptor = {
  modelIds: DM32_MODEL_IDS,
  label: 'DM-32UV',
  icon: '📻',
  group: 'Baofeng',
  supportsBle: false,
  protocolFactory: () => new DM3xRadio(),
  capabilities: DM32UV_CAPABILITIES,
  settingsProfile: DM32UV_SETTINGS_PROFILE,
};

/**
 * The DM-36 runs the DM-32UV's vendor CPS (1.60, which is also the DM-1801
 * Pro's), and the DM-32 driver reads it as is: channels and zones checked
 * against the radio 2026-10-14. It answers PSEARCH as a DP570UV; its firmware
 * string is what marks it (see DM3xVariant).
 */
export const DM36_MODEL_ID = DM36_VARIANT.model;

/**
 * The DM-32UV's, without its firmware opinions: those name DM-32 builds, and a
 * DM-36 would be warned about every one of them.
 */
const DM36_CAPABILITIES: RadioCapabilities = {
  ...DM32UV_CAPABILITIES,
  isFirmware049OrNewer: undefined,
  expectedFirmware: undefined,
  supportedFirmware: undefined,
};

export const DM36_DESCRIPTOR: RadioDescriptor = {
  modelIds: [DM36_MODEL_ID],
  label: 'DM-36',
  icon: '📻',
  group: 'Baofeng',
  // It has Bluetooth, but the link's services are not known yet. Serial only
  // until then; its Bluetooth settings (0x04 block, 0x600-0x602) are not shown
  // either, and a settings write puts them back as read.
  supportsBle: false,
  status: 'alpha',
  protocolFactory: () => new DM3xRadio(DM36_VARIANT),
  capabilities: DM36_CAPABILITIES,
  settingsProfile: DM32UV_SETTINGS_PROFILE,
};
