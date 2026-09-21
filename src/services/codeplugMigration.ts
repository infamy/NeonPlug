/**
 * Codeplug migration: convert codeplug data for a target radio (e.g. UV5R-Mini).
 * Drops or truncates data that the target doesn't support.
 * Settings are always cleared (they do not map between radios).
 */

import type { CodeplugData } from './codeplugExport';
import { getCapabilitiesForModel } from '../radios/capabilities';
import { clampPowerLevel, powerLevelsFor } from '../utils/powerLevels';

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
  /** Members trimmed from zones that held more than the target can. */
  zoneChannelsTrimmed: number;
  /** Members trimmed from scan lists, and from RX groups. */
  scanListChannelsTrimmed: number;
  rxGroupMembersTrimmed: number;
  /**
   * Channels whose scan-list reference pointed past the lists that survived.
   *
   * Truncating the LISTS without clearing the REFERENCES leaves channels
   * pointing at a list the target does not have — which the DA-7X2 write gate
   * refuses outright, and which the DM-32 encoder truncates silently.
   */
  scanListRefsCleared: number;
  /**
   * Channels whose transmit power the target radio cannot reach, and which were
   * stepped down to its strongest supported level. Turbo is DA-7X2 only, so a
   * codeplug moved off that radio hits this; the count is surfaced rather than
   * changed quietly.
   */
  powerLevelsDowngraded: number;
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
  const powerLevels = powerLevelsFor(caps);

  // Same radio family? Capability objects are one per descriptor, so the two
  // names of the D890UV compare equal while a DM-32 does not.
  const sourceCaps = getCapabilitiesForModel(source.radioInfo?.model);
  const sameRadio = !!sourceCaps && !!caps && sourceCaps === caps;

  /** Trim a member list to the target's limit, counting what went. */
  let zoneChannelsTrimmed = 0;
  let scanListChannelsTrimmed = 0;
  let rxGroupMembersTrimmed = 0;
  const trim = <T>(items: readonly T[], limit: number | undefined, onTrim: (n: number) => void): T[] => {
    if (limit == null || limit < 0 || items.length <= limit) return [...items];
    onTrim(items.length - limit);
    return items.slice(0, limit);
  };

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

  // Step any unreachable power level down to the strongest the target supports.
  let powerLevelsDowngraded = 0;
  channels = channels.map((ch) => {
    const clamped = clampPowerLevel(ch.power, powerLevels);
    if (!clamped) return ch;
    powerLevelsDowngraded += 1;
    return { ...ch, power: clamped };
  });

  const maxZones = caps?.maxZones;
  const maxScanLists = caps?.maxScanLists;

  // 2) Zones
  let zones = source.zones;
  if (!supportsZones) {
    zones = [];
  } else {
    zones = zones
      .map((z) => ({
        ...z,
        // Filtered for validity AND capped: a 160-member DA-7X2 zone does not
        // fit a DM-32's 64, and truncating only the NUMBER of zones left the
        // overflow to the encoder.
        channels: trim(
          z.channels.filter((n) => validChannelNumbers.has(n)),
          caps?.maxZoneChannels,
          (n) => { zoneChannelsTrimmed += n; }
        ),
      }))
      .filter((z) => z.channels.length > 0);
    if (maxZones != null && maxZones >= 0) {
      zones = zones.slice(0, maxZones);
    }
  }

  // 3) Scan lists
  let scanLists = source.scanLists;
  if (!supportsScanLists) {
    scanLists = [];
  } else {
    scanLists = source.scanLists
      .map((s) => ({
        ...s,
        // A DA-7X2 scan list holds 50, a DM-32 holds 15.
        channels: trim(
          s.channels.filter((n) => validChannelNumbers.has(n)),
          caps?.maxScanListChannels,
          (n) => { scanListChannelsTrimmed += n; }
        ),
      }))
      .filter((s) => s.channels.length > 0);
    if (maxScanLists != null && maxScanLists >= 0) {
      scanLists = scanLists.slice(0, maxScanLists);
    }
  }

  // 3b) Channels pointing at a scan list that did not survive.
  //
  // Truncating the lists without clearing the references leaves a channel
  // aimed at a list the target does not have. The DA-7X2 write gate refuses the
  // whole write for that; the DM-32 encoder masks the value and writes a
  // different list. Neither is what the user asked for, so the reference is
  // cleared to None and counted.
  let scanListRefsCleared = 0;
  if (supportsScanLists) {
    channels = channels.map((ch) => {
      const ref = ch.scanListId ?? 0;
      if (ref <= scanLists.length) return ch;
      scanListRefsCleared += 1;
      return { ...ch, scanListId: 0 };
    });
  } else if (channels.some((ch) => (ch.scanListId ?? 0) > 0)) {
    channels = channels.map((ch) => {
      if ((ch.scanListId ?? 0) === 0) return ch;
      scanListRefsCleared += 1;
      return { ...ch, scanListId: 0 };
    });
  }

  // 4) Contacts, DMR IDs, digital, quick messages, RX groups, encryption: empty
  // if analogOnly, and capped to the target's limits otherwise. Counts were
  // truncated for zones and scan lists but not for these, so a 250-ID DM-32
  // codeplug went to a radio holding 64 and a 10,000-talkgroup DA-7X2 codeplug
  // went to one holding 800.
  const contacts = analogOnly ? [] : source.contacts;
  const radioIds = analogOnly
    ? []
    : trim(source.radioIds ?? [], caps?.maxRadioIds, () => {});
  const digitalEmergencies = analogOnly ? [] : source.digitalEmergencies;
  const digitalEmergencyConfig = analogOnly ? null : source.digitalEmergencyConfig;
  const messages = analogOnly ? [] : source.messages;
  const quickContacts = analogOnly
    ? []
    : trim(source.quickContacts ?? [], caps?.maxTalkGroups, () => {});
  const rxGroups = analogOnly
    ? []
    : (source.rxGroups ?? []).map((g) => ({
        ...g,
        talkGroupIndices: trim(
          g.talkGroupIndices ?? [],
          caps?.maxRxGroupMembers,
          (n) => { rxGroupMembersTrimmed += n; }
        ),
      }));
  // Encryption keys are radio-specific: the slot, the type and what a type
  // MEANS all differ between families. Carrying them across would be
  // reinterpreting a key rather than moving it, so they are dropped unless the
  // target is the same radio the codeplug came from. An unknown source model
  // counts as different — better to drop and say so than to guess.
  const keysTravel = !analogOnly && sameRadio;
  const encryptionKeys = keysTravel ? source.encryptionKeys : [];
  const analogEmergencies = source.analogEmergencies;

  // Loss summary (counts removed/cleared)
  const loss: MigrationLoss = {
    channelsDropped: source.channels.length - channels.length,
    zonesLost: source.zones.length - zones.length,
    scanListsLost: source.scanLists.length - scanLists.length,
    contactsLost: analogOnly ? source.contacts.length : Math.max(0, source.contacts.length - contacts.length),
    radioIdsLost: (source.radioIds?.length ?? 0) - radioIds.length,
    digitalEmergenciesLost: analogOnly ? (source.digitalEmergencies?.length ?? 0) : 0,
    messagesLost: analogOnly ? (source.messages?.length ?? 0) : 0,
    quickContactsLost: (source.quickContacts?.length ?? 0) - quickContacts.length,
    rxGroupsLost: analogOnly ? (source.rxGroups?.length ?? 0) : 0,
    encryptionKeysLost: (source.encryptionKeys?.length ?? 0) - encryptionKeys.length,
    settingsCleared: !!source.radioSettings,
    powerLevelsDowngraded,
    zoneChannelsTrimmed,
    scanListChannelsTrimmed,
    rxGroupMembersTrimmed,
    scanListRefsCleared,
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
