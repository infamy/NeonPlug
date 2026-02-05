import type { SettingsProfile } from '../../types/settingsProfile';
import { DM32UV_SETTINGS_PROFILE } from '../../radios/dm32uv/settingsProfile';

const PROFILE_REGISTRY: Record<string, SettingsProfile> = {
  'DM-32UV': DM32UV_SETTINGS_PROFILE,
  'DP570UV': DM32UV_SETTINGS_PROFILE,
};

/**
 * Returns the settings profile for the given radio model, or null if unknown.
 */
export function getSettingsProfileForModel(model: string | null | undefined): SettingsProfile | null {
  if (!model || typeof model !== 'string') return null;
  const trimmed = model.trim();
  return PROFILE_REGISTRY[trimmed] ?? null;
}

export { DM32UV_SETTINGS_PROFILE } from '../../radios/dm32uv/settingsProfile';
