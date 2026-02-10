/**
 * Codeplug migration: convert codeplug data for a target radio (e.g. UV5R-Mini).
 * Drops or truncates data that the target doesn't support.
 * Settings are always cleared (they do not map between radios).
 */

import type { CodeplugData } from './codeplugExport';
import { getCapabilitiesForModel } from '../radios/capabilities';

/** Placeholder when device version info is unknown (e.g. after convert from another radio). */
const UNKNOWN_VERSION = '-';

/** Counts of what was removed or cleared during migration (for user warning). */
export interface MigrationLoss {
  channelsDropped: number;
  zonesLost: number;
  scanListsLost: number;
  contactsLost: number;
  radioIdsLost: number;
  digitalEmergenciesLost: number;
  messagesLost: number;
  quickContactsLost: number;
  rxGroupsLost: number;
  encryptionKeysLost: number;
  settingsCleared: boolean;
}

export interface MigrationResult {
  migrated: CodeplugData;
  loss: MigrationLoss;
}

/**
 * Migrate codeplug to be valid for the given target radio model.
 * Returns migrated data and a loss summary; does not mutate source.
 * Radio settings are always cleared (they do not map between radios).
 */
export function migrateCodeplug(source: CodeplugData, targetModel: string): MigrationResult {
  const caps = getCapabilitiesForModel(targetModel);
  const maxChannels = caps?.maxChannels ?? 4000;
  const supportsZones = caps?.supportsZones ?? true;
  const supportsScanLists = caps?.supportsScanLists ?? true;
  const analogOnly = caps?.analogOnly ?? false;

  // 1) Channels: drop digital if analogOnly, then truncate to maxChannels (keep by number, no renumbering)
  let channels = source.channels;
  if (analogOnly) {
    channels = channels.filter(
      (ch) => ch.mode !== 'Digital' && ch.mode !== 'Fixed Digital'
    );
  }
  const validChannelNumbers = new Set(
    channels
      .filter((ch) => ch.number >= 1 && ch.number <= maxChannels)
      .map((ch) => ch.number)
  );
  channels = channels.filter((ch) => validChannelNumbers.has(ch.number));

  // 2) Zones
  let zones = source.zones;
  if (!supportsZones) {
    zones = [];
  } else {
    zones = zones
      .map((z) => ({
        ...z,
        channels: z.channels.filter((n) => validChannelNumbers.has(n)),
      }))
      .filter((z) => z.channels.length > 0);
  }

  // 3) Scan lists
  let scanLists = source.scanLists;
  if (!supportsScanLists) {
    scanLists = [];
  } else {
    scanLists = source.scanLists
      .map((s) => ({
        ...s,
        channels: s.channels.filter((n) => validChannelNumbers.has(n)),
      }))
      .filter((s) => s.channels.length > 0);
  }

  // 4) Contacts, DMR IDs, digital, quick messages, RX groups, encryption: empty if analogOnly
  const contacts = analogOnly ? [] : source.contacts;
  const radioIds = analogOnly ? [] : source.radioIds;
  const digitalEmergencies = analogOnly ? [] : source.digitalEmergencies;
  const digitalEmergencyConfig = analogOnly ? null : source.digitalEmergencyConfig;
  const messages = analogOnly ? [] : source.messages;
  const quickContacts = analogOnly ? [] : source.quickContacts;
  const rxGroups = analogOnly ? [] : source.rxGroups;
  const encryptionKeys = analogOnly ? [] : source.encryptionKeys;
  const analogEmergencies = source.analogEmergencies;

  // Loss summary (counts removed/cleared)
  const loss: MigrationLoss = {
    channelsDropped: source.channels.length - channels.length,
    zonesLost: source.zones.length - zones.length,
    scanListsLost: source.scanLists.length - scanLists.length,
    contactsLost: analogOnly ? source.contacts.length : Math.max(0, source.contacts.length - contacts.length),
    radioIdsLost: analogOnly ? (source.radioIds?.length ?? 0) : 0,
    digitalEmergenciesLost: analogOnly ? (source.digitalEmergencies?.length ?? 0) : 0,
    messagesLost: analogOnly ? (source.messages?.length ?? 0) : 0,
    quickContactsLost: analogOnly ? (source.quickContacts?.length ?? 0) : 0,
    rxGroupsLost: analogOnly ? (source.rxGroups?.length ?? 0) : 0,
    encryptionKeysLost: analogOnly ? (source.encryptionKeys?.length ?? 0) : 0,
    settingsCleared: !!source.radioSettings,
  };

  const migrated: CodeplugData = {
    ...source,
    channels,
    zones,
    scanLists,
    contacts,
    radioIds,
    digitalEmergencies,
    digitalEmergencyConfig,
    messages,
    quickContacts,
    rxGroups,
    encryptionKeys,
    analogEmergencies,
    radioSettings: null, // Settings do not map between radios; always cleared on convert
    radioInfo: {
      model: targetModel,
      firmware: UNKNOWN_VERSION,
      buildDate: UNKNOWN_VERSION,
      dspVersion: UNKNOWN_VERSION,
      radioVersion: UNKNOWN_VERSION,
      codeplugVersion: UNKNOWN_VERSION,
      // Do not carry over memoryLayout/vframes/maxContacts from source; they are device-specific.
    },
    exportDate: new Date().toISOString(),
    version: source.version,
  };

  return { migrated, loss };
}
