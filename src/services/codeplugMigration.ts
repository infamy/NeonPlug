/**
 * Codeplug migration: convert codeplug data for a target radio (e.g. UV5R-Mini).
 * Drops or truncates data that the target doesn't support.
 */

import type { CodeplugData } from './codeplugExport';
import { getCapabilitiesForModel } from '../radios/capabilities';

/**
 * Migrate codeplug to be valid for the given target radio model.
 * Returns a new CodeplugData; does not mutate source.
 */
export function migrateCodeplug(source: CodeplugData, targetModel: string): CodeplugData {
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

  return {
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
    radioInfo: source.radioInfo
      ? { ...source.radioInfo, model: targetModel }
      : { model: targetModel, firmware: '', buildDate: '' },
    exportDate: new Date().toISOString(),
    version: source.version,
  };
}
