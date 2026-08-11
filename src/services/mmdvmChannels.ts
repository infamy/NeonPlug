/**
 * MMDVM Channel Generator
 * Creates digital channels for an MMDVM hotspot — either simplex (single frequency, the
 * common case) or duplex (separate RX/TX, for a hotspot linked to a real repeater pair on
 * 2m or 70cm). Color Code 1. Talk groups are resolved by the caller against the Talk Groups
 * (QuickContact) list before calling this — this function only builds channels.
 */

import type { Channel } from '../models';
import { createDefaultChannel } from '../utils/channelHelpers';

export const MMDVM_FREQ_MIN_MHZ = 431;
export const MMDVM_FREQ_MAX_MHZ = 435;

/**
 * A duplex hotspot's RX/TX pair with a real repeater, which can sit anywhere in the 2m or
 * 70cm ham band depending on the hotspot's radio module — not just the narrow 431-435 MHz
 * simplex-hotspot calling range above. Applies to BOTH frequencies in duplex mode, not just
 * TX: the radio's RX mirrors the hotspot's own transmit-to-repeater frequency, which is just
 * as unconstrained as the TX side.
 */
export const MMDVM_DUPLEX_VHF_MIN_MHZ = 136;
export const MMDVM_DUPLEX_VHF_MAX_MHZ = 174;
export const MMDVM_DUPLEX_UHF_MIN_MHZ = 400;
export const MMDVM_DUPLEX_UHF_MAX_MHZ = 480;
export const MMDVM_DUPLEX_RANGE_DESCRIPTION =
  `${MMDVM_DUPLEX_VHF_MIN_MHZ}-${MMDVM_DUPLEX_VHF_MAX_MHZ} MHz (2m) or ${MMDVM_DUPLEX_UHF_MIN_MHZ}-${MMDVM_DUPLEX_UHF_MAX_MHZ} MHz (70cm)`;

export interface MMDVMChannelEntry {
  channelName: string;
  /** Index into the Talk Groups (QuickContact) list — what the channel actually references
   *  for TX. Resolve this against an existing talk group or a newly-created one before
   *  calling generateMMDVMChannels(); 0 = None. */
  contactId: number;
  /** Per-entry timeslot override (1 = TS1, 2 = TS2). Falls back to the top-level timeslot
   *  option when unset — a real repeater commonly runs different static talk groups on
   *  each slot, which a single hotspot-wide timeslot can't represent. */
  timeslot?: 1 | 2;
}

export interface MMDVMGenerateOptions {
  frequencyMhz: number; // RX frequency
  /** TX frequency for a duplex hotspot; omit (or equal to frequencyMhz) for simplex. */
  txFrequencyMhz?: number;
  entries: MMDVMChannelEntry[];
  firstChannelNumber: number;
  dmrRadioIdIndex: number | undefined; // 0-based index into DMR Radio IDs; undefined = None
  /** 1 = TS1, 2 = TS2. Default for entries that don't specify their own timeslot. */
  timeslot?: 1 | 2;
  /** DMR color code. Defaults to 1 (the usual MMDVM hotspot convention) — a real repeater
   *  can use any value 0-15. */
  colorCode?: number;
}

export interface MMDVMGenerateResult {
  channels: Channel[];
}

/**
 * Validate frequency is in the 431–435 MHz range for MMDVM simplex.
 */
export function isValidMMDVMFrequency(mhz: number): boolean {
  return mhz >= MMDVM_FREQ_MIN_MHZ && mhz <= MMDVM_FREQ_MAX_MHZ && !isNaN(mhz);
}

/**
 * Validate a duplex hotspot's RX or TX frequency — the broader 2m or 70cm ham band, since
 * it pairs with a real repeater rather than another hotspot. Applies to both sides of the pair.
 */
export function isValidMMDVMDuplexFrequency(mhz: number): boolean {
  if (isNaN(mhz)) return false;
  const inVhf = mhz >= MMDVM_DUPLEX_VHF_MIN_MHZ && mhz <= MMDVM_DUPLEX_VHF_MAX_MHZ;
  const inUhf = mhz >= MMDVM_DUPLEX_UHF_MIN_MHZ && mhz <= MMDVM_DUPLEX_UHF_MAX_MHZ;
  return inVhf || inUhf;
}

/**
 * Generate MMDVM channels, simplex or duplex. Same RX/TX pair for all channels, Color Code 1.
 */
export function generateMMDVMChannels(options: MMDVMGenerateOptions): MMDVMGenerateResult {
  const { frequencyMhz, txFrequencyMhz, entries, firstChannelNumber, dmrRadioIdIndex, timeslot, colorCode } = options;

  // The narrow 431-435 MHz range is a simplex-hotspot calling-frequency convention — it
  // doesn't apply to duplex, where RX mirrors the hotspot's own transmit-to-repeater
  // frequency and can be anywhere in the 2m/70cm band, same as TX.
  const isDuplex = txFrequencyMhz !== undefined && txFrequencyMhz !== frequencyMhz;
  if (isDuplex) {
    if (!isValidMMDVMDuplexFrequency(frequencyMhz)) {
      throw new Error(`RX frequency must be in ${MMDVM_DUPLEX_RANGE_DESCRIPTION}`);
    }
    if (!isValidMMDVMDuplexFrequency(txFrequencyMhz)) {
      throw new Error(`TX frequency must be in ${MMDVM_DUPLEX_RANGE_DESCRIPTION}`);
    }
  } else if (!isValidMMDVMFrequency(frequencyMhz)) {
    throw new Error(`Frequency must be between ${MMDVM_FREQ_MIN_MHZ} and ${MMDVM_FREQ_MAX_MHZ} MHz`);
  }
  const txFreq = txFrequencyMhz ?? frequencyMhz;
  const defaultSlotOperation = timeslot === 1 ? 0 : 1; // Storage: 0 = TS1, 1 = TS2
  if (!entries.length) {
    throw new Error('At least one channel entry is required');
  }

  const channels: Channel[] = entries.map((entry, i) => createDefaultChannel({
    number: firstChannelNumber + i,
    name: (entry.channelName || `MMDVM ${i + 1}`).substring(0, 16),
    rxFrequency: frequencyMhz,
    txFrequency: txFreq,
    mode: 'Digital',
    bandwidth: '12.5kHz',
    power: 'Low',
    scanAdd: true,
    colorCode: colorCode ?? 1,
    contactId: entry.contactId,
    slotOperation: entry.timeslot !== undefined ? (entry.timeslot === 1 ? 0 : 1) : defaultSlotOperation,
    dmrRadioIdIndex,
  }));

  return { channels };
}
