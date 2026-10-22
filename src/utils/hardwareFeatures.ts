import type { RadioHardwareFeature, RadioInfo } from '../types/radio';
import type { SettingsFeature } from '../types/settingsProfile';

/**
 * True only when the radio said it does not have this hardware. A codeplug
 * loaded from a file, a radio that never answered, or a radio that does not
 * report features at all leaves the answer unknown, and unknown shows everything.
 */
export function radioLacks(info: RadioInfo | null | undefined, feature: RadioHardwareFeature): boolean {
  return info?.hardwareFeatures?.[feature] === false;
}

/** Settings areas that only mean something on a radio fitted with this hardware. */
const SETTINGS_FEATURE_HARDWARE: Partial<Record<SettingsFeature, RadioHardwareFeature>> = {
  gpsAprs: 'gps',
};

/** A settings area the radio's own report says it cannot use. */
export function settingsFeatureUnfitted(feature: SettingsFeature, info: RadioInfo | null | undefined): boolean {
  const hardware = SETTINGS_FEATURE_HARDWARE[feature];
  return hardware !== undefined && radioLacks(info, hardware);
}

const HARDWARE_LABELS: Record<RadioHardwareFeature, string> = {
  vibrate: 'Vibrate',
  manDown: 'Man Down',
  gps: 'GPS',
  bluetooth: 'Bluetooth',
  sdCard: 'SD card',
  roaming: 'Roaming',
  recording: 'Recording',
};

/** The hardware a radio reported having, for display; null when it reported nothing. */
export function describeHardwareFeatures(info: RadioInfo | null | undefined): string | null {
  const features = info?.hardwareFeatures;
  if (!features) return null;
  const present = (Object.keys(HARDWARE_LABELS) as RadioHardwareFeature[]).filter((f) => features[f]);
  return present.length ? present.map((f) => HARDWARE_LABELS[f]).join(', ') : 'None';
}
