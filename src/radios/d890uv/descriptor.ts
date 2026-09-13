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
import { D890UV_SETTINGS_PROFILE } from './settingsProfile';

export { D890_MODEL_IDS };

/**
 * The same radio under both of its names, as two picker entries.
 *
 * BTECH sells it as the DA-7X2 (and DA-7XR); Anytone sells it as the AT-D890UV.
 * One driver serves all three model IDs — `getRadioInfo` still reports
 * `D890_MODEL_IDS[0]` — but the picker used to carry a single "BTECH / Anytone"
 * heading, which asks somebody holding an Anytone to recognise a BTECH label.
 * Two descriptors, one protocol, one set of capabilities.
 *
 * Both are ALPHA: the driver reads and writes the whole codeplug, most regions
 * confirmed by hardware round trips and the rest written back exactly as read.
 * `DA7X2-COVERAGE.md` says which is which.
 */
const D890UV_SHARED = {
  icon: '📡',
  supportsBle: false,
  protocolFactory: () => new D890UVProtocol(),
  capabilities: D890UV_CAPABILITIES,
  settingsProfile: D890UV_SETTINGS_PROFILE,
  status: 'alpha',
} as const;

export const D890UV_DESCRIPTOR: RadioDescriptor = {
  ...D890UV_SHARED,
  // DA-7XR rides with the BTECH entry: same vendor, same badge on the case.
  modelIds: D890_MODEL_IDS.filter((id) => id !== 'AT-D890UV'),
  label: 'DA-7X2',
  group: 'BTECH',
};

export const D890UV_ANYTONE_DESCRIPTOR: RadioDescriptor = {
  ...D890UV_SHARED,
  modelIds: ['AT-D890UV'],
  label: 'AT-D890UV',
  group: 'Anytone',
};
