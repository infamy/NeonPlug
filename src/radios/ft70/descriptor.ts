/**
 * RadioDescriptor for the Yaesu FT-70D (ADMS-10 clone cable, generic Yaesu block protocol).
 */
import type { RadioDescriptor } from '../types';
import { FT70Protocol } from './protocol';
import { FT70_CAPS } from './capabilities';
import { FT70_SETTINGS_PROFILE } from './settingsProfile';

export const FT70_DESCRIPTOR: RadioDescriptor = {
  modelIds: ['FT-70', 'FT-70D', 'FT-70DR', 'FT-70DE'],
  label: 'FT-70D',
  icon: '📻',
  group: 'Yaesu',
  supportsBle: false,
  protocolFactory: () => new FT70Protocol(),
  capabilities: FT70_CAPS,
  settingsProfile: FT70_SETTINGS_PROFILE,
};
