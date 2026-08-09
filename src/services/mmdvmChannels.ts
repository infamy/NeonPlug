/**
 * MMDVM Channel Generator
 * Creates digital channels and talk groups for an MMDVM hotspot — either simplex
 * (single frequency, the common case) or duplex (separate RX/TX, for a hotspot
 * linked to a real UHF repeater pair). Slot 2, Color Code 1, user-defined talk groups.
 */

import type { Channel, Contact, Zone } from '../models';
import { createDefaultChannel } from '../utils/channelHelpers';
import { generateZoneId } from '../utils/zoneHelpers';

export const MMDVM_FREQ_MIN_MHZ = 431;
export const MMDVM_FREQ_MAX_MHZ = 435;

/**
 * A duplex hotspot's TX pairs with a real repeater, which can sit anywhere in the 70cm
 * ham band — not just the narrow 431-435 MHz simplex-hotspot calling range above.
 */
export const MMDVM_DUPLEX_TX_MIN_MHZ = 400;
export const MMDVM_DUPLEX_TX_MAX_MHZ = 480;

export interface MMDVMChannelEntry {
  channelName: string;
  talkGroupName: string;
  talkGroupId: number; // DMR talk group number (e.g. 9 for local, 3100 for BM Canada)
}

export interface MMDVMGenerateOptions {
  frequencyMhz: number; // RX frequency
  /** TX frequency for a duplex hotspot; omit (or equal to frequencyMhz) for simplex. */
  txFrequencyMhz?: number;
  entries: MMDVMChannelEntry[];
  firstChannelNumber: number;
  firstContactId: number; // Next available contact id (e.g. max(existing contact ids) + 1)
  dmrRadioIdIndex: number | undefined; // 0-based index into DMR Radio IDs; undefined = None
  zoneName?: string;
  /** 1 = TS1, 2 = TS2. Defaults to TS2 (the usual MMDVM hotspot convention). */
  timeslot?: 1 | 2;
}

export interface MMDVMGenerateResult {
  channels: Channel[];
  contacts: Contact[];
  zone: Zone;
}

/**
 * Validate frequency is in the 431–435 MHz range for MMDVM simplex.
 */
export function isValidMMDVMFrequency(mhz: number): boolean {
  return mhz >= MMDVM_FREQ_MIN_MHZ && mhz <= MMDVM_FREQ_MAX_MHZ && !isNaN(mhz);
}

/**
 * Validate a duplex hotspot's TX frequency — the broader 70cm band, since it pairs
 * with a real repeater rather than another hotspot.
 */
export function isValidMMDVMDuplexTxFrequency(mhz: number): boolean {
  return mhz >= MMDVM_DUPLEX_TX_MIN_MHZ && mhz <= MMDVM_DUPLEX_TX_MAX_MHZ && !isNaN(mhz);
}

/**
 * Generate MMDVM channels and talk group contacts, simplex or duplex.
 * Same RX/TX pair for all channels; Slot 2, Color Code 1; each channel gets its own talk group.
 */
export function generateMMDVMChannels(options: MMDVMGenerateOptions): MMDVMGenerateResult {
  const { frequencyMhz, txFrequencyMhz, entries, firstChannelNumber, firstContactId, dmrRadioIdIndex, zoneName, timeslot } = options;

  if (!isValidMMDVMFrequency(frequencyMhz)) {
    throw new Error(`RX frequency must be between ${MMDVM_FREQ_MIN_MHZ} and ${MMDVM_FREQ_MAX_MHZ} MHz`);
  }
  const isDuplex = txFrequencyMhz !== undefined && txFrequencyMhz !== frequencyMhz;
  if (isDuplex && !isValidMMDVMDuplexTxFrequency(txFrequencyMhz)) {
    throw new Error(`TX frequency must be between ${MMDVM_DUPLEX_TX_MIN_MHZ} and ${MMDVM_DUPLEX_TX_MAX_MHZ} MHz`);
  }
  const txFreq = txFrequencyMhz ?? frequencyMhz;
  const slotOperation = timeslot === 1 ? 0 : 1; // Storage: 0 = TS1, 1 = TS2
  if (!entries.length) {
    throw new Error('At least one channel/talk group entry is required');
  }

  const contacts: Contact[] = [];
  const channels: Channel[] = [];
  let nextContactId = firstContactId;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const contactId = nextContactId++;
    const contact: Contact = {
      id: contactId,
      name: (entry.talkGroupName || `TG ${entry.talkGroupId}`).substring(0, 16),
      dmrId: entry.talkGroupId,
    };
    contacts.push(contact);

    const channelName = (entry.channelName || entry.talkGroupName || `MMDVM ${i + 1}`).substring(0, 16);
    const ch = createDefaultChannel({
      number: firstChannelNumber + i,
      name: channelName,
      rxFrequency: frequencyMhz,
      txFrequency: txFreq,
      mode: 'Digital',
      bandwidth: '12.5kHz',
      power: 'Low',
      scanAdd: true,
      colorCode: 1,
      contactId,
      slotOperation,
      dmrRadioIdIndex,
    });
    channels.push(ch);
  }

  const zone: Zone = {
    id: generateZoneId(),
    name: (zoneName || 'MMDVM').substring(0, 16),
    channels: channels.map((c) => c.number),
  };

  return { channels, contacts, zone };
}
