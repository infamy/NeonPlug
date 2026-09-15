import { describe, it, expect } from 'vitest';
import { fieldUpdate, isFieldChanged } from '../../src/components/settings/settingsFields';
import type { RadioSettings } from '../../src/models/RadioSettings';

describe('a checkbox on a setting the radio reads as 1 or 0', () => {
  const read = { radioSpecific: { beep: 1, volume: 5 } } as unknown as RadioSettings;

  it('keeps the value a number', () => {
    expect(fieldUpdate(read, 'radioSpecific.beep', false)).toEqual({ radioSpecific: { beep: 0, volume: 5 } });
    expect(fieldUpdate(read, 'radioSpecific.beep', true)).toEqual({ radioSpecific: { beep: 1, volume: 5 } });
  });

  it('is not changed once ticked back', () => {
    const ticked = { ...read, ...fieldUpdate(read, 'radioSpecific.beep', true) } as RadioSettings;
    expect(isFieldChanged(ticked, read, 'radioSpecific.beep')).toBe(false);
  });

  it('leaves a field that really is a boolean alone', () => {
    const settings = { beepEnabled: true } as unknown as RadioSettings;
    expect(fieldUpdate(settings, 'beepEnabled', false)).toEqual({ beepEnabled: false });
  });
});
