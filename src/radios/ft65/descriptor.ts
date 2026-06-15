/**
 * RadioDescriptor entries for the Yaesu FT-65/FT-4/FT-25 family (SCU-35 cable).
 *
 * Three picker entries cover six hardware variants:
 *   FT-65  → FT-65R (US/Asia) + FT-65E (EU)   — same PCB, same ID prefix
 *   FT-4   → FT-4XR, FT-4XE (dual-band) + FT-4VR (VHF-only)
 *   FT-25R → FT-25R (VHF-only, US/Asia)
 */
import type { RadioDescriptor } from '../types';
import { FT65Protocol } from './protocol';
import { FT65_CAPS_DUAL, FT_CAPS_VHF } from './capabilities';
import {
  ID_PREFIX_FT65, ID_PREFIX_FT4X, ID_PREFIX_FT4V, ID_PREFIX_FT25,
  OFFSET_FACTOR_FT65, OFFSET_FACTOR_FT4,
  MAX_NAME_LEN_FT65, MAX_NAME_LEN_FT4,
} from './constants';
import { FT65_SETTINGS_PROFILE, FT4_SETTINGS_PROFILE, FT25R_SETTINGS_PROFILE } from './settingsProfile';

/** FT-65 — covers FT-65R and FT-65E (identical hardware). */
export const FT65_DESCRIPTOR: RadioDescriptor = {
  modelIds: ['FT-65', 'FT-65R', 'FT-65E'],
  label: 'FT-65',
  icon: '📻',
  group: 'Yaesu',
  supportsBle: false,
  protocolFactory: () => new FT65Protocol('FT-65', [ID_PREFIX_FT65], OFFSET_FACTOR_FT65, MAX_NAME_LEN_FT65),
  capabilities: FT65_CAPS_DUAL,
  settingsProfile: FT65_SETTINGS_PROFILE,
};

/** FT-4 — covers FT-4XR, FT-4XE (dual-band) and FT-4VR (VHF-only). */
export const FT4_DESCRIPTOR: RadioDescriptor = {
  modelIds: ['FT-4', 'FT-4XR', 'FT-4XE', 'FT-4VR'],
  label: 'FT-4',
  icon: '📻',
  group: 'Yaesu',
  supportsBle: false,
  protocolFactory: () => new FT65Protocol('FT-4', [ID_PREFIX_FT4X, ID_PREFIX_FT4V], OFFSET_FACTOR_FT4, MAX_NAME_LEN_FT4),
  capabilities: FT65_CAPS_DUAL,
  settingsProfile: FT4_SETTINGS_PROFILE,
};

/** FT-25R — VHF-only, US/Asia. */
export const FT25R_DESCRIPTOR: RadioDescriptor = {
  modelIds: ['FT-25R'],
  label: 'FT-25R',
  icon: '📻',
  group: 'Yaesu',
  supportsBle: false,
  protocolFactory: () => new FT65Protocol('FT-25R', [ID_PREFIX_FT25], OFFSET_FACTOR_FT65, MAX_NAME_LEN_FT65),
  capabilities: FT_CAPS_VHF,
  settingsProfile: FT25R_SETTINGS_PROFILE,
};
