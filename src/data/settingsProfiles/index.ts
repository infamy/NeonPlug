import type { SettingsProfile } from '../../types/settingsProfile';
import { RADIO_DESCRIPTORS } from '../../radios';

const PROFILE_REGISTRY: Record<string, SettingsProfile> = {};
for (const d of RADIO_DESCRIPTORS) {
  if (d.settingsProfile) {
    for (const id of d.modelIds) {
      PROFILE_REGISTRY[id] = d.settingsProfile;
    }
  }
}

/**
 * Returns the settings profile for the given radio model, or null if unknown or no settings UI.
 */
export function getSettingsProfileForModel(model: string | null | undefined): SettingsProfile | null {
  if (!model || typeof model !== 'string') return null;
  const trimmed = model.trim();
  return PROFILE_REGISTRY[trimmed] ?? null;
}
