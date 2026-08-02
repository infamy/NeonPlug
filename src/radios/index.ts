/**
 * Protocol registry and picker options built from radio descriptors.
 * Add a new radio by adding its descriptor to RADIO_DESCRIPTORS.
 */
import type { RadioProtocol } from '../types/radio';
import type { RadioDescriptor } from './types';
import { DM32UV_DESCRIPTOR } from './dm32uv/descriptor';
import { UV5RMINI_DESCRIPTOR } from './uv5rmini/descriptor';
import { FT65_DESCRIPTOR, FT4_DESCRIPTOR, FT4VR_DESCRIPTOR, FT25R_DESCRIPTOR } from './ft65/descriptor';

export type ProtocolFactory = () => RadioProtocol;

/** All registered radios. Add new radios here. */
export const RADIO_DESCRIPTORS: readonly RadioDescriptor[] = [
  DM32UV_DESCRIPTOR,
  UV5RMINI_DESCRIPTOR,
  FT65_DESCRIPTOR,
  FT4_DESCRIPTOR,
  FT4VR_DESCRIPTOR,
  FT25R_DESCRIPTOR,
];

/** Backward compatibility: same radio, multiple model IDs. */
export const DM32_MODEL_IDS = DM32UV_DESCRIPTOR.modelIds as readonly ['DM-32UV', 'DP570UV'];

/** Backward compatibility: UV5R-Mini model ID. */
export { UV5RMINI_MODEL_ID } from './uv5rmini/descriptor';

const PROTOCOL_REGISTRY: Record<string, ProtocolFactory> = {};
for (const d of RADIO_DESCRIPTORS) {
  for (const id of d.modelIds) {
    PROTOCOL_REGISTRY[id] = d.protocolFactory;
  }
}

/** Options for the "Pick a radio" modal: one entry per descriptor. */
export interface RadioPickerOption {
  modelId: string;
  label: string;
  icon: string;
  group?: string;
  supportsBle: boolean;
}

const RADIO_PICKER_OPTIONS: RadioPickerOption[] = RADIO_DESCRIPTORS.map((d) => ({
  modelId: d.modelIds[0],
  label: d.label,
  icon: d.icon,
  group: d.group,
  supportsBle: d.supportsBle,
}));

export function getRadioPickerOptions(): RadioPickerOption[] {
  return [...RADIO_PICKER_OPTIONS];
}

export function getMigrationTargetModels(): string[] {
  return RADIO_PICKER_OPTIONS.map((o) => o.modelId);
}

export function createProtocolForModel(model: string): RadioProtocol | null {
  const trimmed = model?.trim();
  if (!trimmed) return null;
  const factory = PROTOCOL_REGISTRY[trimmed];
  return factory ? factory() : null;
}

/** Default protocol when no model is selected (first registered radio). */
export function createDefaultProtocol(): RadioProtocol {
  const firstModel = RADIO_DESCRIPTORS[0]?.modelIds[0];
  return createProtocolForModel(firstModel ?? '') ?? DM32UV_DESCRIPTOR.protocolFactory();
}
