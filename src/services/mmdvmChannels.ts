/**
 * MMDVM Simplex Channel Generator
 * Creates digital channels and talk groups for a simplex MMDVM hotspot
 * (single frequency, Slot 2, Color Code 1, user-defined talk groups).
 */

import type { Channel, Contact, Zone } from '../models';
import { createDefaultChannel } from '../utils/channelHelpers';
import { generateZoneId } from '../utils/zoneHelpers';

export const MMDVM_FREQ_MIN_MHZ = 431;
export const MMDVM_FREQ_MAX_MHZ = 435;

export interface MMDVMChannelEntry {
  channelName: string;
  talkGroupName: string;
  talkGroupId: number; // DMR talk group number (e.g. 9 for local, 3100 for BM Canada)
}

export interface MMDVMGenerateOptions {
  frequencyMhz: number;
  entries: MMDVMChannelEntry[];
  firstChannelNumber: number;
  firstContactId: number; // Next available contact id (e.g. max(existing contact ids) + 1)
  dmrRadioIdIndex: number | undefined; // 0-based index into DMR Radio IDs; undefined = None
  zoneName?: string;
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
 * Generate MMDVM simplex channels and talk group contacts.
 * Same frequency for all channels; Slot 2, Color Code 1; each channel gets its own talk group.
 */
export function generateMMDVMChannels(options: MMDVMGenerateOptions): MMDVMGenerateResult {
  const { frequencyMhz, entries, firstChannelNumber, firstContactId, dmrRadioIdIndex, zoneName } = options;

  if (!isValidMMDVMFrequency(frequencyMhz)) {
    throw new Error(`Frequency must be between ${MMDVM_FREQ_MIN_MHZ} and ${MMDVM_FREQ_MAX_MHZ} MHz`);
  }
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
      txFrequency: frequencyMhz, // Simplex: same as RX
      mode: 'Digital',
      bandwidth: '12.5kHz',
      power: 'Low',
      scanAdd: true,
      colorCode: 1,
      contactId,
      slotOperation: 1, // Slot 2 (TS2)
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
