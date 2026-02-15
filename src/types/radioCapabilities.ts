/**
 * Per-radio capabilities for diagnostics, digital tab, and limits.
 * Resolved by getCapabilitiesForModel(model); UI uses these instead of importing from a specific radio.
 */
import type { RadioSettings } from '../models/RadioSettings';
import type { DigitalEmergency, DigitalEmergencyConfig } from '../models/DigitalEmergency';
import type { EncryptionKey } from '../models/EncryptionKey';

/** Result shape for CTCSS/DCS decode (radio-agnostic). */
export interface CTCSSDCSResultLike {
  type: 'CTCSS' | 'DCS' | 'None';
  value?: number;
  polarity?: 'N' | 'P';
}

export interface RadioCapabilitiesDiagnostics {
  parseRadioSettings: (data: Uint8Array) => RadioSettings;
  decodeBCDFrequency: (data: Uint8Array) => number;
  decodeCTCSSDCS: (data: Uint8Array) => CTCSSDCSResultLike;
}

export interface RadioCapabilitiesDigitalLimits {
  TALK_GROUPS_MAX: number;
  DMR_RADIO_IDS_MAX: number;
  QUICK_MESSAGES_MAX?: number;
  RX_GROUPS_MAX?: number;
  SCAN_LISTS_MAX?: number;
}

export interface RadioCapabilitiesDigital {
  parseEncryptionKeys: (data: Uint8Array) => EncryptionKey[];
  parseDigitalEmergencies: (data: Uint8Array) => { systems: DigitalEmergency[]; config: DigitalEmergencyConfig };
  limits: RadioCapabilitiesDigitalLimits;
}

export interface RadioBandLimits {
  vhfMin: number;
  vhfMax: number;
  uhfMin: number;
  uhfMax: number;
}

/** Fallback band limits when no radio/model is known (VHF 87–174, UHF 400–470 MHz). */
export const DEFAULT_BAND_LIMITS: RadioBandLimits = {
  vhfMin: 87,
  vhfMax: 174,
  uhfMin: 400,
  uhfMax: 470,
};

/** Radio-specific rules to run before writing a codeplug. Only applied when model is known. */
export interface WriteValidations {
  /** If true, warn when channels exist that are not in any zone (they will still be written but may be hard to access). */
  channelsMustBeInZones?: boolean;
}

export interface RadioCapabilities {
  diagnostics?: RadioCapabilitiesDiagnostics;
  digital?: RadioCapabilitiesDigital;
  /** Band limits for frequency validation (e.g. VHF 87-174, UHF 400-470 MHz). */
  bandLimits?: RadioBandLimits;
  /** Returns true if firmware is 049 or newer (or radio-specific threshold). */
  isFirmware049OrNewer?: (firmware: string) => boolean;
  /** Validations to run before writing codeplug to this radio. Only run when model is known. */
  writeValidations?: WriteValidations;
  /** Max channel count (e.g. 999 for UV5R-Mini, 4000 for DM32). */
  maxChannels?: number;
  /** If false, radio has no zones (e.g. UV5R-Mini). */
  supportsZones?: boolean;
  /** If false, radio has no scan lists. */
  supportsScanLists?: boolean;
  /** If false, radio has no CSV contacts / contact list (e.g. UV5R-Mini). */
  supportsContacts?: boolean;
  /** If true, analog-only radio — no DMR/digital features. */
  analogOnly?: boolean;
  /** If true, radio supports BLE in addition to serial (transport option in connect). */
  supportsBle?: boolean;
  /** When radio supports both serial and BLE, default transport to offer (store can override). */
  preferredTransport?: 'serial' | 'ble';
  /** If true, hook calls bulkReadRequiredBlocks() before parsing channels (e.g. DM-32UV). */
  supportsBulkRead?: boolean;
  /** If true, channel list includes VFO A/B as channels 4001/4002 (e.g. DM-32UV). Analog-only radios typically do not. */
  supportsVfoChannels?: boolean;
  /** Max zone count when supportsZones is true (e.g. 250 for DM32). */
  maxZones?: number;
  /** Max scan list count when supportsScanLists is true (e.g. 32 for DM32). */
  maxScanLists?: number;
  /** If true, protocol supports readBootImage / writeBootImage. */
  supportsBootImage?: boolean;
  /** If true, protocol supports readQuickMessages. */
  supportsQuickMessages?: boolean;
}
