/**
 * DA-7X2 / AT-D890UV radio descriptor. Registered in radios/index.ts.
 *
 * One descriptor covers all three names because they are the same radio: the
 * BTECH DA-7X2 and DA-7XR are rebrands of the Anytone AT-D890UV, the same way
 * DM32UV_DESCRIPTOR covers both DM-32UV and DP570UV.
 *
 * ⚠️ The model IDs here are the names shown in the picker. The strings the radio
 * *reports over the wire* live in D890_ID_PREFIXES (constants.ts) and are known
 * only for the Anytone-branded unit — see D890UV-HARDWARE-CHECKLIST.md §1.
 */
import type { RadioDescriptor } from '../types';
import { D890UVProtocol } from './protocol';
import { D890UV_CAPABILITIES } from './capabilities';
import { D890_MODEL_IDS } from './constants';

export { D890_MODEL_IDS };

export const D890UV_DESCRIPTOR: RadioDescriptor = {
  modelIds: D890_MODEL_IDS,
  label: 'DA-7X2',
  icon: '📡',
  group: 'BTECH / Anytone',
  supportsBle: false,
  protocolFactory: () => new D890UVProtocol(),
  capabilities: D890UV_CAPABILITIES,
  // No settings profile yet — the settings region is not mapped.
  settingsProfile: null,
};
