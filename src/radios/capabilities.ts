/**
 * Registry of radio capabilities (parsers, limits) by model.
 * UI resolves via getCapabilitiesForModel(radioInfo?.model) instead of importing from a specific radio.
 */
import type { RadioCapabilities } from '../types/radioCapabilities';
import { DM32_MODEL_IDS, UV5RMINI_MODEL_ID } from './index';
import { DM32UV_CAPABILITIES } from './dm32uv/capabilities';
import { UV5RMINI_CAPABILITIES } from './uv5rmini/capabilities';

const CAPABILITIES_REGISTRY: Record<string, RadioCapabilities> = {
  ...Object.fromEntries(DM32_MODEL_IDS.map(id => [id, DM32UV_CAPABILITIES])),
  [UV5RMINI_MODEL_ID]: UV5RMINI_CAPABILITIES,
};

export function getCapabilitiesForModel(model: string | null | undefined): RadioCapabilities | null {
  if (!model || typeof model !== 'string') return null;
  const trimmed = model.trim();
  return CAPABILITIES_REGISTRY[trimmed] ?? null;
}
