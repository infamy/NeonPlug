/**
 * Types for the central radio registry. Each radio folder exports a descriptor
 * that is registered in radios/index.ts; protocol, picker, capabilities, and
 * settings profile are all derived from descriptors.
 */
import type { RadioProtocol } from '../types/radio';
import type { RadioCapabilities } from '../types/radioCapabilities';
import type { SettingsProfile } from '../types/settingsProfile';

export interface RadioDescriptor {
  /** One or more model IDs (e.g. ['DM-32UV', 'DP570UV'] or ['UV5R-Mini']). */
  modelIds: readonly string[];
  /** Display label in pick-a-radio modal. */
  label: string;
  /** Icon (emoji or character) for picker. */
  icon: string;
  /** Manufacturer/family group for the picker UI (e.g. "Yaesu", "Baofeng"). */
  group?: string;
  /** Whether the radio supports BLE in addition to serial. */
  supportsBle: boolean;
  /** Factory that returns a new protocol instance. */
  protocolFactory: () => RadioProtocol;
  /** Capabilities for this radio (limits, feature flags, parsers). */
  capabilities: RadioCapabilities;
  /** Settings profile for the Settings tab; null when radio has no settings UI. */
  settingsProfile?: SettingsProfile | null;
}
