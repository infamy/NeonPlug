/**
 * Codeplug validation before writing to radio.
 * Used with radio-specific capabilities (writeValidations) so only applicable rules run.
 */
import type { Channel } from '../../models/Channel';
import type { Zone } from '../../models/Zone';
import type { WriteValidations } from '../../types/radioCapabilities';

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

export interface CodeplugWriteWarning {
  id: 'channels_not_in_zones';
  message: string;
  /** Channels not in any zone (for display in UI). */
  channels: Channel[];
}

export interface CodeplugWriteValidationResult {
  warnings: CodeplugWriteWarning[];
}

/**
 * Runs radio-specific write validations and returns warnings.
 * Only runs checks that are enabled in writeValidations; when writeValidations is null/undefined, returns no warnings.
 */
export function validateCodeplugForWrite(
  channels: Channel[],
  zones: Zone[],
  writeValidations: WriteValidations | null | undefined
): CodeplugWriteValidationResult {
  const warnings: CodeplugWriteWarning[] = [];

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
