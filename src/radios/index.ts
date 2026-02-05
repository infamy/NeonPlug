/**
 * Protocol registry: maps model ids to protocol factories.
 * Use createDefaultProtocol() or createProtocolForModel(model) so app code
 * does not import a specific radio implementation.
 */
import type { RadioProtocol } from '../types/radio';
import { DM32UVProtocol } from './dm32uv/protocol';

export type ProtocolFactory = () => RadioProtocol;

const PROTOCOL_REGISTRY: Record<string, ProtocolFactory> = {
  'DM-32UV': () => new DM32UVProtocol(),
  'DP570UV': () => new DM32UVProtocol(),
};

/**
 * Returns a new protocol instance for the given radio model, or null if unknown.
 */
export function createProtocolForModel(model: string): RadioProtocol | null {
  const trimmed = model?.trim();
  if (!trimmed) return null;
  const factory = PROTOCOL_REGISTRY[trimmed];
  return factory ? factory() : null;
}

/**
 * Returns the default protocol instance (connect first, detect model later).
 * Currently returns DM-32UV; when more radios exist, could be user-selected or first registered.
 */
export function createDefaultProtocol(): RadioProtocol {
  return createProtocolForModel('DM-32UV') ?? new DM32UVProtocol();
}
