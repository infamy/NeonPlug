/**
 * Protocol registry: maps model ids to protocol factories.
 * Use createDefaultProtocol() or createProtocolForModel(model) so app code
 * does not import a specific radio implementation.
 */
import type { RadioProtocol } from '../types/radio';
import { DM32UVProtocol } from './dm32uv/protocol';
import { UV5RMiniProtocol } from './uv5rmini/protocol';

export type ProtocolFactory = () => RadioProtocol;

/** Same radio: DM-32UV (marketing), DP570UV (internal). */
export const DM32_MODEL_IDS = ['DM-32UV', 'DP570UV'] as const;

/** UV5R-Mini model ID. */
export const UV5RMINI_MODEL_ID = 'UV5R-Mini';

const PROTOCOL_REGISTRY: Record<string, ProtocolFactory> = {
  ...Object.fromEntries(DM32_MODEL_IDS.map(id => [id, () => new DM32UVProtocol()])),
  [UV5RMINI_MODEL_ID]: () => new UV5RMiniProtocol(),
};

/** Options for the "Pick a radio" modal: one entry per supported radio. */
export interface RadioPickerOption {
  modelId: string;
  label: string;
  icon: string;
  supportsBle: boolean;
}

const RADIO_PICKER_OPTIONS: RadioPickerOption[] = [
  { modelId: DM32_MODEL_IDS[0], label: 'DM-32UV', icon: '📻', supportsBle: false },
  { modelId: UV5RMINI_MODEL_ID, label: 'UV5R-Mini', icon: '📻', supportsBle: true },
];

/**
 * Returns the list of radios to show in the pick-a-radio modal (display label, icon, BLE support).
 */
export function getRadioPickerOptions(): RadioPickerOption[] {
  return [...RADIO_PICKER_OPTIONS];
}

/**
 * Returns model IDs that can be used as migration targets (Convert for another radio).
 */
export function getMigrationTargetModels(): string[] {
  return RADIO_PICKER_OPTIONS.map((o) => o.modelId);
}

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
  return createProtocolForModel(DM32_MODEL_IDS[0]) ?? new DM32UVProtocol();
}
