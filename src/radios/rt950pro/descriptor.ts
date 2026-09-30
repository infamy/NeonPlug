/**
 * Radtel RT-950 Pro radio descriptor. Registered in radios/index.ts.
 *
 * ALPHA: the driver reads and writes, but nothing in it has been on a radio.
 */
import type { RadioDescriptor } from '../types';
import { RT950ProProtocol } from './protocol';
import { RT950PRO_CAPABILITIES } from './capabilities';
import { RT950PRO_MODEL_ID } from './modelId';
import { RT950PRO_SETTINGS_PROFILE } from './settingsProfile';

export { RT950PRO_MODEL_ID };

export const RT950PRO_DESCRIPTOR: RadioDescriptor = {
  modelIds: [RT950PRO_MODEL_ID],
  label: 'RT-950 Pro',
  icon: '📻',
  group: 'Radtel',
  supportsBle: true,
  status: 'alpha',
  protocolFactory: () => new RT950ProProtocol(),
  capabilities: RT950PRO_CAPABILITIES,
  settingsProfile: RT950PRO_SETTINGS_PROFILE,
};
