/**
 * Reading, changing and finding settings by their profile field key.
 *
 * Shared by the Settings tab and the write confirmation, so a setting the tab
 * marks as changed is one the confirmation lists.
 */

import type { RadioSettings } from '../../models/RadioSettings';
import type { SettingsFieldDescriptor, SettingsProfile } from '../../types/settingsProfile';
import { deepEqual } from '../../store/radioSettingsStore';
import { getOptionsForId } from './settingsConstants';

/** Get value from settings by key; supports nested path (e.g. menuEnableFlags.zoneList) and lockKey mapping */
export function getFieldValue(settings: RadioSettings | null, key: string): unknown {
  if (!settings) return undefined;
  if (key === 'lockKey') return settings.lockKey === 'Auto' ? 1 : 0;
  if (key.includes('.')) {
    const parts = key.split('.');
    let v: unknown = settings;
    for (const p of parts) v = (v as unknown as Record<string, unknown>)?.[p];
    return v;
  }
  return (settings as unknown as Record<string, unknown>)[key];
}

/** The partial update that sets one field; supports nested path and lockKey mapping. Null without settings. */
export function fieldUpdate(settings: RadioSettings | null, key: string, value: unknown): Partial<RadioSettings> | null {
  if (!settings) return null;
  if (key === 'lockKey') return { lockKey: value === 1 ? 'Auto' : 'Manual' } as Partial<RadioSettings>;
  // A checkbox sends true or false, but some radios read these fields as 1 or 0.
  // Keeping the type that was read means ticking a box back matches the radio
  // again, rather than staying "Changed" because true is not 1.
  const current = getFieldValue(settings, key);
  const typed = typeof value === 'boolean' && typeof current === 'number' ? (value ? 1 : 0) : value;
  if (key.includes('.')) {
    const [parent, ...rest] = key.split('.');
    const leaf = rest.join('.');
    const parentObj = (settings as unknown as Record<string, unknown>)[parent];
    const spread = typeof parentObj === 'object' && parentObj !== null ? { ...(parentObj as Record<string, unknown>) } : {};
    (spread as Record<string, unknown>)[leaf] = typed;
    return { [parent]: spread } as Partial<RadioSettings>;
  }
  return { [key]: typed } as Partial<RadioSettings>;
}

/** True when a field's value differs from what was last read, written or opened. */
export function isFieldChanged(settings: RadioSettings | null, original: RadioSettings | null, key: string): boolean {
  if (!settings || !original) return false;
  return !deepEqual(getFieldValue(settings, key), getFieldValue(original, key));
}

/**
 * Whether a field is found by `query` (already lowercased): by its label, its
 * hint, its section's title, or the label of one of its bits or options. A
 * setting is often remembered by the option it was set to rather than its name.
 */
export function fieldMatches(field: SettingsFieldDescriptor, query: string, sectionTitle = ''): boolean {
  if (!query) return true;
  const words: string[] = [field.label, field.hint ?? '', sectionTitle];
  if (field.type === 'bitfield') words.push(...field.bits.map((b) => b.label));
  if (field.type === 'select' || field.type === 'color') {
    const options = field.options?.length ? field.options : field.optionsId ? getOptionsForId(field.optionsId) : [];
    words.push(...options.map((o) => o.label));
  }
  return words.some((w) => w.toLowerCase().includes(query));
}

/**
 * The settings a write will send, by label.
 *
 * A write sends every top-level key in `changedFields`. A field is named when
 * its own value differs from the original; a changed key no profile field
 * covers is named by its key. An imported codeplug marks every key changed
 * without any value differing, and is reported as `all`.
 */
export function changedSettingLabels(
  profile: SettingsProfile | null | undefined,
  settings: RadioSettings | null,
  original: RadioSettings | null,
  changedFields: ReadonlySet<string>
): { labels: string[]; all: boolean } {
  if (!settings || changedFields.size === 0) return { labels: [], all: false };
  if (Object.keys(settings).every((key) => changedFields.has(key))) return { labels: [], all: true };
  const labels: string[] = [];
  const covered = new Set<string>();
  for (const field of profile?.sections.flatMap((s) => s.fields) ?? []) {
    const top = field.key.split('.')[0];
    if (!changedFields.has(top)) continue;
    covered.add(top);
    if (isFieldChanged(settings, original, field.key)) labels.push(field.label);
  }
  for (const key of changedFields) if (!covered.has(key)) labels.push(key);
  return { labels, all: false };
}
