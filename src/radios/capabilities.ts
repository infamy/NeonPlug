/**
 * Capabilities registry built from radio descriptors.
 * UI resolves via getCapabilitiesForModel(model); no per-radio imports here.
 */
import type { RadioCapabilities } from '../types/radioCapabilities';
import { RADIO_DESCRIPTORS } from './index';

const CAPABILITIES_REGISTRY: Record<string, RadioCapabilities> = {};
for (const d of RADIO_DESCRIPTORS) {
  for (const id of d.modelIds) {
    CAPABILITIES_REGISTRY[id] = d.capabilities;
  }
}

export function getCapabilitiesForModel(model: string | null | undefined): RadioCapabilities | null {
  if (!model || typeof model !== 'string') return null;
  const trimmed = model.trim();
  return CAPABILITIES_REGISTRY[trimmed] ?? null;
}
