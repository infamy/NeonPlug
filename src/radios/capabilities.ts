/**
 * Registry of radio capabilities (parsers, limits) by model.
 * UI resolves via getCapabilitiesForModel(radioInfo?.model) instead of importing from a specific radio.
 */
import type { RadioCapabilities } from '../types/radioCapabilities';
import { DM32_MODEL_IDS } from './index';
import { DM32UV_CAPABILITIES } from './dm32uv/capabilities';

const CAPABILITIES_REGISTRY: Record<string, RadioCapabilities> = Object.fromEntries(
  DM32_MODEL_IDS.map(id => [id, DM32UV_CAPABILITIES])
);

export function getCapabilitiesForModel(model: string | null | undefined): RadioCapabilities | null {
  if (!model || typeof model !== 'string') return null;
  const trimmed = model.trim();
  return CAPABILITIES_REGISTRY[trimmed] ?? null;
}
