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

export interface RadioCapabilities {
  diagnostics?: RadioCapabilitiesDiagnostics;
  digital?: RadioCapabilitiesDigital;
  /** Band limits for frequency validation (e.g. VHF 87-174, UHF 400-470 MHz). */
  bandLimits?: RadioBandLimits;
  /** Returns true if firmware is 049 or newer (or radio-specific threshold). */
  isFirmware049OrNewer?: (firmware: string) => boolean;
}
