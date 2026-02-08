/**
 * Codeplug validation before writing to radio.
 * Used with radio-specific capabilities (writeValidations) so only applicable rules run.
 */
import type { Channel } from '../../models/Channel';
import type { Zone } from '../../models/Zone';
import type { DMRRadioID } from '../../models/DMRRadioID';
import type { WriteValidations } from '../../types/radioCapabilities';

/** Set of channel numbers that exist in the channel list. */
export function getExistingChannelNumbers(channels: Channel[]): Set<number> {
  return new Set(channels.map((ch) => ch.number));
}

/** Zones that reference channel numbers not in the channel list. */
export interface ZoneInvalidChannelRef {
  zoneName: string;
  zoneId: string;
  invalidChannelNumbers: number[];
}

export function getZonesWithInvalidChannelRefs(
  zones: Zone[],
  channels: Channel[]
): ZoneInvalidChannelRef[] {
  const existingNumbers = getExistingChannelNumbers(channels);
  const result: ZoneInvalidChannelRef[] = [];
  for (const zone of zones) {
    const invalid = zone.channels.filter((chNum) => !existingNumbers.has(chNum));
    if (invalid.length > 0) {
      result.push({
        zoneName: zone.name,
        zoneId: zone.id,
        invalidChannelNumbers: invalid,
      });
    }
  }
  return result;
}

/** Channels that are not referenced by any zone. */
export function getChannelsNotInZones(channels: Channel[], zones: Zone[]): Channel[] {
  const channelNumbersInZones = new Set<number>();
  for (const zone of zones) {
    for (const chNum of zone.channels) {
      channelNumbersInZones.add(chNum);
    }
  }
  return channels.filter((ch) => !channelNumbersInZones.has(ch.number));
}

/** Channels that reference a DMR Radio ID index that is not in the current radio IDs list (e.g. after a delete). Analog channels are skipped. */
export function getChannelsReferencingDeletedDmrRadioId(
  channels: Channel[],
  radioIds: DMRRadioID[]
): Channel[] {
  const validIndices = new Set(radioIds.map((r) => r.index));
  return channels.filter((ch) => {
    if (ch.mode === 'Analog' || ch.mode === 'Fixed Analog') return false;
    const idx = ch.dmrRadioIdIndex;
    if (idx === undefined || idx === 255) return false;
    return !validIndices.has(idx);
  });
}

export interface CodeplugWriteWarning {
  id: 'channels_not_in_zones' | 'zones_reference_nonexistent_channels' | 'channels_reference_deleted_dmr_radio_id';
  message: string;
  /** Channels not in any zone (for display in UI). */
  channels?: Channel[];
  /** Zones that reference non-existent channels (for display in UI). */
  zoneRefs?: ZoneInvalidChannelRef[];
}

export interface CodeplugWriteValidationResult {
  warnings: CodeplugWriteWarning[];
}

/**
 * Runs radio-specific write validations and returns warnings.
 * Only runs checks that are enabled in writeValidations; when writeValidations is null/undefined, returns no warnings.
 * @param radioIds - If provided, checks for channels referencing a deleted DMR Radio ID.
 */
export function validateCodeplugForWrite(
  channels: Channel[],
  zones: Zone[],
  writeValidations: WriteValidations | null | undefined,
  radioIds?: DMRRadioID[]
): CodeplugWriteValidationResult {
  const warnings: CodeplugWriteWarning[] = [];

  // Always check: zones must not reference non-existent channels (prevents radio issues)
  if (zones.length > 0 && channels.length >= 0) {
    const zoneRefs = getZonesWithInvalidChannelRefs(zones, channels);
    if (zoneRefs.length > 0) {
      const totalInvalid = zoneRefs.reduce((sum, z) => sum + z.invalidChannelNumbers.length, 0);
      warnings.push({
        id: 'zones_reference_nonexistent_channels',
        message: `Zone(s) reference ${totalInvalid} non-existent channel(s). They will be removed before write to prevent radio errors.`,
        zoneRefs,
      });
      for (const z of zoneRefs) {
        console.warn(
          `[Codeplug] Zone "${z.zoneName}" (${z.zoneId}) references non-existent channel(s): ${z.invalidChannelNumbers.join(', ')}. Will be stripped before write.`
        );
      }
    }
  }

  // Always check (when radio IDs provided): channels referencing a DMR Radio ID that was deleted
  if (radioIds && channels.length > 0) {
    const channelsWithDeletedRadioId = getChannelsReferencingDeletedDmrRadioId(channels, radioIds);
    if (channelsWithDeletedRadioId.length > 0) {
      warnings.push({
        id: 'channels_reference_deleted_dmr_radio_id',
        message: `${channelsWithDeletedRadioId.length} channel(s) reference a DMR Radio ID that was deleted. Update or clear the Radio ID on those channels before write.`,
        channels: channelsWithDeletedRadioId,
      });
      for (const ch of channelsWithDeletedRadioId) {
        console.warn(
          `[Codeplug] Channel ${ch.number} "${ch.name}" references deleted DMR Radio ID index ${ch.dmrRadioIdIndex}.`
        );
      }
    }
  }

  if (!writeValidations) {
    return { warnings };
  }

  if (writeValidations.channelsMustBeInZones && channels.length > 0) {
    const notInZones = getChannelsNotInZones(channels, zones);
    if (notInZones.length > 0) {
      warnings.push({
        id: 'channels_not_in_zones',
        message: `${notInZones.length} channel(s) are not in any zone. They will not be accessible on the radio.`,
        channels: notInZones,
      });
    }
  }

  return { warnings };
}
