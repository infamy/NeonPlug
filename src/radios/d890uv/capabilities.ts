/**
 * AT-D890UV / DA-7X2 capabilities.
 *
 * ⚠️ Limits are transcribed from documentation and confirmed only by bitmap
 * arithmetic, not by hardware. See D890UV-HARDWARE-CHECKLIST.md §4.
 *
 * Per golden rule #3, nothing in the UI should ever branch on the model string —
 * these flags are how the D890's differences from the DM-32 are expressed.
 */

import type { RadioCapabilities } from '../../types/radioCapabilities';
import { D890_LIMITS } from './constants';

/**
 * `RadioCapabilitiesDigital` requires these two parsers, but both are DM-32
 * concepts — encryption keys and digital emergency systems live in that radio's
 * metadata blocks and have no known D890 equivalent (the D890's AES key table is
 * referenced by channel byte 0x22, but its layout is not documented).
 *
 * They return empty rather than throwing: they are called by the Diagnostics tab
 * to render optional sections, and an empty list correctly means "this radio
 * exposes none". Another symptom of the shared capability contract being shaped
 * around the DM-32 — see the model-layer note in D890UV-HARDWARE-CHECKLIST.md.
 */
const parseEncryptionKeys = () => [];
const parseDigitalEmergencies = () => ({ systems: [], config: {} });

export const D890UV_CAPABILITIES: RadioCapabilities = {
  digital: {
    parseEncryptionKeys,
    parseDigitalEmergencies,
    limits: {
      TALK_GROUPS_MAX: D890_LIMITS.TALK_GROUPS_MAX,
      DMR_RADIO_IDS_MAX: D890_LIMITS.DMR_RADIO_IDS_MAX,
      RX_GROUPS_MAX: D890_LIMITS.RX_GROUPS_MAX,
      SCAN_LISTS_MAX: D890_LIMITS.SCAN_LISTS_MAX,
    },
  },
  /**
   * 136-174 and 400-480 MHz TX. The radio also receives 108-136 AM airband and
   * 87.5-108 broadcast FM, but those are RX-only and not expressible in
   * bandLimits — channels there would be filtered out before a write, which is
   * the safe behaviour until airband support is designed properly.
   */
  bandLimits: {
    vhfMin: 136,
    vhfMax: 174,
    uhfMin: 400,
    uhfMax: 480,
  },
  maxChannels: D890_LIMITS.CHANNELS_MAX,
  maxZones: D890_LIMITS.ZONES_MAX,
  maxZoneChannels: D890_LIMITS.ZONE_MEMBERS_MAX,
  maxRxGroupMembers: D890_LIMITS.RX_GROUP_MEMBERS_MAX,
  maxScanLists: D890_LIMITS.SCAN_LISTS_MAX,
  maxScanListChannels: D890_LIMITS.SCAN_LIST_MEMBERS_MAX,
  supportsZones: true,
  supportsScanLists: true,
  analogOnly: false,
  /** VFO A/B occupy channel slots 4000/4001. */
  supportsVfoChannels: true,
  /**
   * False: "bulk read" means the DM-32's contiguous block read. This radio has
   * no contiguous image — reads are sparse and addressed per region.
   */
  supportsBulkRead: false,
  /** Sparse addressed reads — this is what enables the Diagnostics region dump. */
  supportsRawRegionDump: true,
  supportsBootImage: false,
  supportsQuickMessages: false,
  supportsAnalogEmergency: false,
};
