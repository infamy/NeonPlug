/**
 * DM-32UV / DP570UV radio descriptor. Registered in radios/index.ts.
 */
import type { RadioDescriptor } from '../types';
import { DM32UVProtocol } from './protocol';
import { DM32UV_CAPABILITIES } from './capabilities';
import { DM32UV_SETTINGS_PROFILE } from './settingsProfile';

export const DM32_MODEL_IDS = ['DM-32UV', 'DP570UV'] as const;

export const DM32UV_DESCRIPTOR: RadioDescriptor = {
  modelIds: DM32_MODEL_IDS,
  label: 'DM-32UV',
  icon: '📻',
  group: 'Baofeng',
  supportsBle: false,
  protocolFactory: () => new DM32UVProtocol(),
  capabilities: DM32UV_CAPABILITIES,
  settingsProfile: DM32UV_SETTINGS_PROFILE,
};
