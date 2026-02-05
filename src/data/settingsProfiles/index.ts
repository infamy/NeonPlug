import type { SettingsProfile } from '../../types/settingsProfile';
import { DM32_MODEL_IDS } from '../../radios';
import { DM32UV_SETTINGS_PROFILE } from '../../radios/dm32uv/settingsProfile';

const PROFILE_REGISTRY: Record<string, SettingsProfile> = Object.fromEntries(
  DM32_MODEL_IDS.map(id => [id, DM32UV_SETTINGS_PROFILE])
);

/**
 * Returns the settings profile for the given radio model, or null if unknown.
 */
export function getSettingsProfileForModel(model: string | null | undefined): SettingsProfile | null {
  if (!model || typeof model !== 'string') return null;
  const trimmed = model.trim();
  return PROFILE_REGISTRY[trimmed] ?? null;
}
