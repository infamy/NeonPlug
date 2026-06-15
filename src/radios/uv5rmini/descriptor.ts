/**
 * UV5R-Mini radio descriptor. Registered in radios/index.ts.
 */
import type { RadioDescriptor } from '../types';
import { UV5RMiniProtocol } from './protocol';
import { UV5RMINI_CAPABILITIES } from './capabilities';
import { UV5RMINI_SETTINGS_PROFILE } from './settingsProfile';

export const UV5RMINI_MODEL_ID = 'UV5R-Mini';

export const UV5RMINI_DESCRIPTOR: RadioDescriptor = {
  modelIds: [UV5RMINI_MODEL_ID],
  label: 'UV5R-Mini',
  icon: '📻',
  group: 'Baofeng',
  supportsBle: true,
  protocolFactory: () => new UV5RMiniProtocol(),
  capabilities: UV5RMINI_CAPABILITIES,
  settingsProfile: UV5RMINI_SETTINGS_PROFILE,
};
