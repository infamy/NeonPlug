import { describe, it, expect } from 'vitest';
import {
  changedSettingLabels,
  fieldMatches,
  fieldUpdate,
  getFieldValue,
  isFieldChanged,
} from '../../src/components/settings/settingsFields';
import type { RadioSettings } from '../../src/models/RadioSettings';
import type { SettingsFieldDescriptor, SettingsProfile } from '../../src/types/settingsProfile';

const settings = (over: Record<string, unknown> = {}) =>
  ({ squelch: 3, lockKey: 'Manual', menuEnableFlags: { zoneList: true, scan: false }, ...over }) as unknown as RadioSettings;

const bits: SettingsFieldDescriptor = {
  key: 'alertTones',
  label: 'Alert Tone Flags',
  type: 'bitfield',
  bits: [{ bitIndex: 0, label: 'Voice Prompt' }],
};
const select: SettingsFieldDescriptor = {
  key: 'squelch',
  label: 'Squelch Level',
  type: 'select',
  options: [{ value: 3, label: 'Level 3' }],
  hint: 'How strong a signal must be to open the speaker',
};
const nested: SettingsFieldDescriptor = { key: 'menuEnableFlags.zoneList', label: 'Zone List', type: 'checkbox' };
const profile = { radioType: 'test', sections: [{ id: 'a', title: 'Buttons', fields: [select, nested, bits] }] } as SettingsProfile;

describe('settings fields', () => {
  it('reads and writes nested fields and the lock key', () => {
    const s = settings();
    expect(getFieldValue(s, 'menuEnableFlags.zoneList')).toBe(true);
    expect(fieldUpdate(s, 'menuEnableFlags.zoneList', false)).toEqual({ menuEnableFlags: { zoneList: false, scan: false } });
    expect(getFieldValue(s, 'lockKey')).toBe(0);
    expect(fieldUpdate(s, 'lockKey', 1)).toEqual({ lockKey: 'Auto' });
  });

  it('marks a field changed only when its own value differs', () => {
    const original = settings();
    const edited = settings({ menuEnableFlags: { zoneList: false, scan: false } });
    expect(isFieldChanged(edited, original, 'menuEnableFlags.zoneList')).toBe(true);
    expect(isFieldChanged(edited, original, 'menuEnableFlags.scan')).toBe(false);
  });

  it('finds a field by its hint, section, bit label or option label', () => {
    expect(fieldMatches(bits, 'voice prompt')).toBe(true);
    expect(fieldMatches(select, 'level 3')).toBe(true);
    expect(fieldMatches(select, 'speaker')).toBe(true);
    expect(fieldMatches(nested, 'buttons', 'Buttons')).toBe(true);
    expect(fieldMatches(nested, 'nothing like it', 'Buttons')).toBe(false);
  });

  it('lists the changed settings a write sends, by label', () => {
    const original = settings();
    const edited = settings({ squelch: 5 });
    expect(changedSettingLabels(profile, edited, original, new Set(['squelch']))).toEqual({
      labels: ['Squelch Level'],
      all: false,
    });
    // A changed key that no profile field covers is named by its key.
    expect(changedSettingLabels(profile, edited, original, new Set(['squelch', 'gpsEnabled'])).labels).toEqual([
      'Squelch Level',
      'gpsEnabled',
    ]);
  });

  it('reports an imported codeplug, whose every setting is marked changed, as all of them', () => {
    const s = settings();
    expect(changedSettingLabels(profile, s, s, new Set(Object.keys(s)))).toEqual({ labels: [], all: true });
  });
});
