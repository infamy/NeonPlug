/**
 * AT-D890UV / DA-7X2 capabilities.
 *
 * ⚠️ Limits are transcribed from documentation and confirmed only by mask
 * arithmetic, not by hardware. See D890UV-HARDWARE-CHECKLIST.md §4.
 *
 * Per golden rule #3, nothing in the UI should ever branch on the model string —
 * these flags are how the D890's differences from the DM-32 are expressed.
 */

import type { RadioCapabilities } from '../../types/radioCapabilities';
import { D890_ADDR, D890_LIMITS } from './constants';

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
      QUICK_MESSAGES_MAX: D890_ADDR.PREDEFINED_SMS_MAX,
      /**
       * 200, from the vendor's own `SMSData(… Context varchar(200))`.
       *
       * ⚠️ INDIRECT EVIDENCE. That DDL describes the CPS's database, not the
       * radio, and it is already known to be wrong about this very field's
       * ENCODING — it says varchar where the radio stores UTF-16LE. So 200 is
       * the vendor's practical limit, not a measured hardware one.
       *
       * The STRUCTURAL ceiling is 255: the slot is 0x200 bytes at two bytes per
       * character, less a terminator. 200 is the safer of the two — writing 255
       * to a radio that expects 200 is the failure with teeth, and being wrong
       * the other way costs 55 unusable characters.
       */
      QUICK_MESSAGE_CHARS_MAX: D890_ADDR.PREDEFINED_SMS_MAX_CHARS,
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
   *
   * ⚠️ THESE ARE TRANSMIT LIMITS. The receive range is wider and is a different
   * question: this radio receives 108-136 MHz AM airband and the FM broadcast
   * band, on neither of which it can transmit. `planChannelWrite` checks TX only
   * for exactly that reason.
   *
   * They are DECLARED, not read. The radio's actual TX range appears nowhere in
   * a full codeplug capture — not in LocalInfo (model string and serial only)
   * and not in any of the 52 KB the vendor CPS reads. Searched 2026-08-31.
   */
  bandLimits: {
    vhfMin: 136,
    vhfMax: 174,
    uhfMin: 400,
    uhfMax: 480,
  },
  /**
   * Channel columns this radio HAS — not what this driver currently decodes.
   *
   * Sourced from the vendor CPS's own 77-column channel export, which is the
   * authority on what the hardware supports. An earlier revision listed only
   * what `parseChannel` populated, which was a mistake: it hid NeonPlug's own
   * decoding gaps behind an empty grid and made the driver look complete.
   *
   * `emergency`, `stepFrequency` and `signalType` are absent because the vendor
   * schema has no equivalent — those are genuinely DM-32 features.
   *
   * ⚠️ Several of these are declared but not yet decoded (see the channel field
   * coverage note in D890UV-HARDWARE-CHECKLIST.md). They render as defaults
   * until their byte offsets are found, and finding them needs a codeplug that
   * varies them — the current diverse codeplug leaves them all at one value.
   */
  channelColumns: [
    'freeToAir', 'loneWorker', 'aprs', 'squelch', 'pttId',
    'audioProcessing', 'encryption', 'confirmations',
    // Declarative extras (EXTRA_CHANNEL_COLUMNS). Every one of these is a real
    // column in the vendor's 77-column export and a real byte in the channel
    // record; several are marked in the UI because only the OFFSET is confirmed
    // and the value range is not. DA7X2-NEEDS-CONFIRMING.md tracks which.
    'customCtcss', 'toneSignalling', 'reverse', 'busyLock', 'frequencyCorrection',
    'txColorCode', 'slotSuit', 'dmrAdvanced', 'scanRoaming', 'ranging',
    'callConfirmation', 'messaging', 'aprsAdvanced', 'emergencyCodes',
  ],
  /** Four levels, confirmed on hardware against the vendor CPS export. */
  powerLevels: ['Low', 'Medium', 'High', 'Turbo'],
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
  /** "Pre-defined SMS" in the vendor CPS; layout confirmed on hardware 2026-08-30. */
  /**
   * ⚠️ NO FIRMWARE CHECK IS POSSIBLE ON THIS RADIO, and `expectedFirmware` is
   * deliberately NOT set.
   *
   * DA-7X2 support requires firmware 1.05, but the version cannot be read:
   * confirmed 2026-08-30 by checking every place it could be. The identify reply
   * is `IDMR-7X2.V100..` with all sixteen bytes accounted for, so `V100` is
   * everything the radio reports and it is not the firmware version.
   * `LocalInfo` (0x4f80000) holds only the model string and serial. The device
   * identity block (0x7000000) is blank. The vendor CPS does not display a
   * firmware version either — only the radio's own menu does, reading it from a
   * part of flash the programming protocol never exposes.
   *
   * Consequences, which are real and not merely theoretical:
   *   - A user on firmware older than 1.05 CANNOT be warned. We will not know.
   *   - What such a radio does on a read is untested and unknown.
   *   - Setting `expectedFirmware` would be worse than leaving it unset: it
   *     implies a check that cannot exist, and would compare against `V100`,
   *     which never changes with firmware.
   *
   * If a firmware gate is ever needed, it has to be a question to the user, not
   * a protocol read.
   */
  supportsQuickMessages: true,
  supportsAnalogEmergency: false,
  /**
   * False. This radio HAS emergency features — the vendor's Emergency
   * Information form carries 24 controls — but not in the DM-32's shape. Its
   * alarm data is two 0x30 records at 0x3482e00 (contact) and 0x3483000
   * (settings), fully mapped 2026-08-31, and there is no metadata block 0x10.
   * The DM-32's section would render an editor over data that does not exist.
   */
  supportsDigitalEmergency: false,
};
