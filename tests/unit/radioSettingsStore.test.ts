import { describe, it, expect, beforeEach } from 'vitest';
import { useRadioSettingsStore } from '../../src/store/radioSettingsStore';
import type { RadioSettings } from '../../src/models/RadioSettings';

// Helpers for exercising deepEqual's nested-object and array branches
function settingsWithNested(nested: unknown, arr: unknown[]): RadioSettings {
  return { squelchLevel: 3, nested, arr } as unknown as RadioSettings;
}

function makeSettings(overrides: Record<string, unknown> = {}): RadioSettings {
  return { squelchLevel: 3, backlightBrightness: 3, ...overrides } as unknown as RadioSettings;
}

beforeEach(() => {
  useRadioSettingsStore.setState({
    settings: null,
    originalSettings: null,
    changedFields: new Set(),
  });
});

describe('setSettings', () => {
  it('stores settings and a deep-cloned original', () => {
    const s = makeSettings({ squelchLevel: 5 });
    useRadioSettingsStore.getState().setSettings(s);
    const { settings, originalSettings } = useRadioSettingsStore.getState();
    expect(settings?.squelchLevel).toBe(5);
    expect(originalSettings?.squelchLevel).toBe(5);
    expect(settings).not.toBe(originalSettings); // different object references
  });

  it('clears changedFields on load', () => {
    useRadioSettingsStore.getState().setSettings(makeSettings());
    useRadioSettingsStore.getState().updateSettings({ squelchLevel: 9 } as any);
    useRadioSettingsStore.getState().setSettings(makeSettings()); // reload
    expect(useRadioSettingsStore.getState().changedFields.size).toBe(0);
  });

  it('accepts null to clear settings', () => {
    useRadioSettingsStore.getState().setSettings(makeSettings());
    useRadioSettingsStore.getState().setSettings(null);
    expect(useRadioSettingsStore.getState().settings).toBeNull();
    expect(useRadioSettingsStore.getState().originalSettings).toBeNull();
  });
});

describe('updateSettings', () => {
  it('marks field as changed when value differs from original', () => {
    useRadioSettingsStore.getState().setSettings(makeSettings({ squelchLevel: 3 }));
    useRadioSettingsStore.getState().updateSettings({ squelchLevel: 7 } as any);
    expect(useRadioSettingsStore.getState().changedFields.has('squelchLevel')).toBe(true);
  });

  it('removes field from changedFields when value reverts to original', () => {
    useRadioSettingsStore.getState().setSettings(makeSettings({ squelchLevel: 3 }));
    useRadioSettingsStore.getState().updateSettings({ squelchLevel: 7 } as any);
    useRadioSettingsStore.getState().updateSettings({ squelchLevel: 3 } as any); // revert
    expect(useRadioSettingsStore.getState().changedFields.has('squelchLevel')).toBe(false);
  });

  it('tracks multiple changed fields independently', () => {
    useRadioSettingsStore.getState().setSettings(makeSettings({ squelchLevel: 3, backlightBrightness: 3 }));
    useRadioSettingsStore.getState().updateSettings({ squelchLevel: 7, backlightBrightness: 5 } as any);
    const { changedFields } = useRadioSettingsStore.getState();
    expect(changedFields.has('squelchLevel')).toBe(true);
    expect(changedFields.has('backlightBrightness')).toBe(true);
  });
});

describe('clearChanges', () => {
  it('empties changedFields', () => {
    useRadioSettingsStore.getState().setSettings(makeSettings({ squelchLevel: 3 }));
    useRadioSettingsStore.getState().updateSettings({ squelchLevel: 7 } as any);
    useRadioSettingsStore.getState().clearChanges();
    expect(useRadioSettingsStore.getState().changedFields.size).toBe(0);
  });

  it('advances originalSettings to current settings', () => {
    useRadioSettingsStore.getState().setSettings(makeSettings({ squelchLevel: 3 }));
    useRadioSettingsStore.getState().updateSettings({ squelchLevel: 7 } as any);
    useRadioSettingsStore.getState().clearChanges();
    expect(useRadioSettingsStore.getState().originalSettings?.squelchLevel).toBe(7);
  });

  // This test captures the exact bug that was fixed: write→edit→write skipping the second write.
  // After clearChanges(), editing back to what was the pre-write value is now a real change —
  // it should appear in changedFields and trigger a write.
  it('after clearChanges, reverting to pre-clear value is treated as a change', () => {
    useRadioSettingsStore.getState().setSettings(makeSettings({ squelchLevel: 3 }));
    useRadioSettingsStore.getState().updateSettings({ squelchLevel: 7 } as any);
    useRadioSettingsStore.getState().clearChanges(); // simulates successful write

    // Now edit back to what the original value was before the write
    useRadioSettingsStore.getState().updateSettings({ squelchLevel: 3 } as any);

    // Must register as changed — original is now 7, current is 3
    expect(useRadioSettingsStore.getState().changedFields.has('squelchLevel')).toBe(true);
  });

  it('after clearChanges, keeping the current value shows no change', () => {
    useRadioSettingsStore.getState().setSettings(makeSettings({ squelchLevel: 3 }));
    useRadioSettingsStore.getState().updateSettings({ squelchLevel: 7 } as any);
    useRadioSettingsStore.getState().clearChanges();
    useRadioSettingsStore.getState().updateSettings({ squelchLevel: 7 } as any); // same as written value
    expect(useRadioSettingsStore.getState().changedFields.has('squelchLevel')).toBe(false);
  });
});

// ─── deepEqual branch coverage via updateSettings ────────────────────────────

describe('updateSettings with nested objects (deepEqual branches)', () => {
  it('detects a change in a nested object field', () => {
    useRadioSettingsStore.getState().setSettings(
      settingsWithNested({ tone: 100 }, [1, 2, 3])
    );
    useRadioSettingsStore.getState().updateSettings(
      { nested: { tone: 200 } } as any
    );
    expect(useRadioSettingsStore.getState().changedFields.has('nested')).toBe(true);
  });

  it('does not mark changed when nested object is equal', () => {
    useRadioSettingsStore.getState().setSettings(
      settingsWithNested({ tone: 100 }, [1, 2, 3])
    );
    useRadioSettingsStore.getState().updateSettings(
      { nested: { tone: 100 } } as any
    );
    expect(useRadioSettingsStore.getState().changedFields.has('nested')).toBe(false);
  });

  it('detects a change in an array field', () => {
    useRadioSettingsStore.getState().setSettings(
      settingsWithNested({ tone: 100 }, [1, 2, 3])
    );
    useRadioSettingsStore.getState().updateSettings(
      { arr: [1, 2, 9] } as any
    );
    expect(useRadioSettingsStore.getState().changedFields.has('arr')).toBe(true);
  });

  it('does not mark changed when array is equal', () => {
    useRadioSettingsStore.getState().setSettings(
      settingsWithNested({ tone: 100 }, [1, 2, 3])
    );
    useRadioSettingsStore.getState().updateSettings(
      { arr: [1, 2, 3] } as any
    );
    expect(useRadioSettingsStore.getState().changedFields.has('arr')).toBe(false);
  });

  it('detects array length change', () => {
    useRadioSettingsStore.getState().setSettings(
      settingsWithNested({}, [1, 2, 3])
    );
    useRadioSettingsStore.getState().updateSettings(
      { arr: [1, 2] } as any
    );
    expect(useRadioSettingsStore.getState().changedFields.has('arr')).toBe(true);
  });

  it('detects nested object key count change', () => {
    useRadioSettingsStore.getState().setSettings(
      settingsWithNested({ a: 1 }, [])
    );
    useRadioSettingsStore.getState().updateSettings(
      { nested: { a: 1, b: 2 } } as any
    );
    expect(useRadioSettingsStore.getState().changedFields.has('nested')).toBe(true);
  });
});

describe('hasChanges / getChangedFields', () => {
  it('hasChanges returns false when nothing is modified', () => {
    useRadioSettingsStore.getState().setSettings(makeSettings());
    expect(useRadioSettingsStore.getState().hasChanges()).toBe(false);
  });

  it('hasChanges returns true after a modification', () => {
    useRadioSettingsStore.getState().setSettings(makeSettings({ squelchLevel: 3 }));
    useRadioSettingsStore.getState().updateSettings({ squelchLevel: 5 } as any);
    expect(useRadioSettingsStore.getState().hasChanges()).toBe(true);
  });

  it('getChangedFields lists modified field names', () => {
    useRadioSettingsStore.getState().setSettings(makeSettings({ squelchLevel: 3 }));
    useRadioSettingsStore.getState().updateSettings({ squelchLevel: 5 } as any);
    expect(useRadioSettingsStore.getState().getChangedFields()).toContain('squelchLevel');
  });
});

describe('setSettings markAllChanged (import write-gate fix, issue #2)', () => {
  it('default (read-from-radio) marks no fields changed', () => {
    useRadioSettingsStore.getState().setSettings(makeSettings({ squelchLevel: 3, backlightBrightness: 4 }));
    expect(useRadioSettingsStore.getState().getChangedFields()).toHaveLength(0);
    expect(useRadioSettingsStore.getState().hasChanges()).toBe(false);
  });

  it('markAllChanged flags every settings key so an imported codeplug writes back', () => {
    const s = makeSettings({ squelchLevel: 3, backlightBrightness: 4 });
    useRadioSettingsStore.getState().setSettings(s, { markAllChanged: true });
    const changed = useRadioSettingsStore.getState().getChangedFields();
    // every own key of the imported settings should be marked changed
    for (const key of Object.keys(s)) {
      expect(changed).toContain(key);
    }
    expect(useRadioSettingsStore.getState().hasChanges()).toBe(true);
  });

  it('markAllChanged with null settings marks nothing', () => {
    useRadioSettingsStore.getState().setSettings(null, { markAllChanged: true });
    expect(useRadioSettingsStore.getState().getChangedFields()).toHaveLength(0);
  });
});
