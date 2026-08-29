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

/**
 * One annotated field/region inside a raw memory block. Display-only —
 * drives Diagnostics hex overlays, tooltips, offset lookup, and legends.
 */
export interface BlockFieldSpec {
  /** Byte offset of the (first) occurrence within the block. */
  at: number;
  /** Length in bytes per occurrence. Default 1. */
  len?: number;
  name: string;
  /** Bit range [hi, lo] within a single-byte field. */
  bits?: [number, number];
  /** Repeating record array: occurrences at `at + i * stride` for i < count. */
  repeat?: { count: number; stride: number };
  /** Optional human-readable decode of one occurrence's bytes. */
  decode?: (bytes: Uint8Array, index: number) => string;
  /** Free-form note shown in the layout legend. */
  notes?: string;
}

/** Declarative annotation of one memory block. Earlier fields win on overlap. */
export interface BlockLayoutSpec {
  label: string;
  fields: BlockFieldSpec[];
}

/**
 * One named span of a clone radio's memory image, for the Diagnostics image
 * viewer. Deliberately top-level on RadioCapabilities rather than under
 * `diagnostics`, which requires three DM-32-shaped parsers the simpler radios
 * have no use for.
 */
export interface MemoryRegionSpec {
  label: string;
  /** Byte offset into the memory image. */
  start: number;
  /** Length in bytes. */
  length: number;
  /** Optional note shown beside the region. */
  notes?: string;
}

export interface RadioCapabilitiesDiagnostics {
  parseRadioSettings: (data: Uint8Array) => RadioSettings;
  decodeBCDFrequency: (data: Uint8Array) => number;
  decodeCTCSSDCS: (data: Uint8Array) => CTCSSDCSResultLike;
  /** Per-block hex annotations, keyed by metadata id (e.g. 0x04, 0x41). */
  blockLayouts?: Record<number, BlockLayoutSpec>;
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
  /** Absent on VHF-only radios (e.g. FT-25R, FT-4VR): the radio has no UHF band. */
  uhfMin?: number;
  uhfMax?: number;
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
  /**
   * Firmware string this radio is known-good on. When set, the status bar warns
   * if the connected radio reports anything else (unless isFirmware049OrNewer
   * says it is newer). When ABSENT, no firmware warning is ever shown.
   *
   * Was hardcoded to the DM-32's 'DM32.01.L01.048' in the shared StatusBar, so
   * every other radio warned permanently — the D890UV reports 'V100' and got a
   * warning for not being a DM-32.
   */
  expectedFirmware?: string;
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
  /**
   * If true, the radio can read arbitrary memory spans by address, and the
   * Diagnostics tab offers a raw region dump for capturing test fixtures.
   *
   * True only for sparse address-addressed radios (D890UV family). The clone
   * protocols expose whole blocks instead, which the existing block panels
   * already cover.
   */
  supportsRawRegionDump?: boolean;
  /**
   * Set false while a driver is being brought up and cannot decode channels yet.
   *
   * `readFromRadio` then skips the channel step and records a warning instead of
   * letting the throw abort the whole read — everything else the radio exposes
   * (zones, scan lists, talkgroups, RX groups) still lands. Absent means true.
   *
   * This is a temporary state, not a radio trait: remove it once the driver's
   * `readChannels()` works.
   */
  supportsChannelRead?: boolean;
  /**
   * Named spans of this radio's contiguous memory image. When set, Diagnostics
   * shows the cached image from the last Read as an annotated hex dump — the
   * clone-radio counterpart to `supportsRawRegionDump`.
   *
   * Only meaningful for radios whose protocol implements `getMemoryImage()`,
   * since that is what populates `radioStore.cachedMemoryImage`.
   */
  memoryRegions?: MemoryRegionSpec[];
  /** If true, channel list includes VFO A/B as channels 4001/4002 (e.g. DM-32UV). Analog-only radios typically do not. */
  supportsVfoChannels?: boolean;
  /** Max zone count when supportsZones is true (e.g. 250 for DM32). */
  maxZones?: number;
  /**
   * Max channels per zone. 64 on the DM-32, 160 on the D890UV family. Absent
   * falls back to 64 — the value the store and UI hardcoded before this existed,
   * which silently truncated a D890 zone at 64 of its 160 channels.
   */
  maxZoneChannels?: number;
  /** Max talkgroups per RX group. 32 on the DM-32, 64 on the D890UV family. */
  maxRxGroupMembers?: number;
  /**
   * Max channels per scan list. 15 on the DM-32 (its list is a 30-byte array),
   * 50 on the D890UV family. Absent falls back to the DM-32's 15, which is what
   * the UI and store hardcoded before this existed.
   */
  maxScanListChannels?: number;
  /** Max scan list count when supportsScanLists is true (e.g. 32 for DM32). */
  maxScanLists?: number;
  /** If true, protocol supports readBootImage / writeBootImage. */
  supportsBootImage?: boolean;
  /** If true, protocol supports readQuickMessages. */
  supportsQuickMessages?: boolean;
  /** If true, radio has Analog Emergency Systems (DM-32UV only). */
  supportsAnalogEmergency?: boolean;
}
