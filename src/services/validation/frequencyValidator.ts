import type { RadioSettings } from '../../models/RadioSettings';
import type { Channel } from '../../models/Channel';
import type { RadioBandLimits } from '../../types/radioCapabilities';
import { DEFAULT_BAND_LIMITS } from '../../types/radioCapabilities';

interface SettingsWithBandLimits {
  bandLimits: {
    vhfMin: number;
    vhfMax: number;
    uhfMin: number;
    uhfMax: number;
  };
}

/**
 * Check if a frequency is in the supported ranges.
 * When limits is provided (e.g. from getCapabilitiesForModel), uses those; otherwise uses default ranges.
 */
export function isValidFrequencyRange(frequency: number, limits?: RadioBandLimits | null): boolean {
  const resolved = limits ?? DEFAULT_BAND_LIMITS;
  const vhfMin = resolved.vhfMin;
  const vhfMax = resolved.vhfMax;
  const uhfMin = resolved.uhfMin;
  const uhfMax = resolved.uhfMax;
  const isVHF = frequency >= vhfMin && frequency <= vhfMax;
  const isUHF = frequency >= uhfMin && frequency <= uhfMax;
  return isVHF || isUHF;
}

/**
 * Check if a channel's frequencies are within supported ranges.
 * When limits is provided (e.g. from getCapabilitiesForModel(radioInfo?.model)?.bandLimits), uses those.
 */
export function isValidChannelFrequency(channel: Channel, limits?: RadioBandLimits | null): boolean {
  if (channel.rxFrequency <= 0 || channel.txFrequency <= 0) return false;

  return isValidFrequencyRange(channel.rxFrequency, limits) &&
         isValidFrequencyRange(channel.txFrequency, limits);
}

export function isValidFrequency(
  frequency: number,
  settings?: RadioSettings | SettingsWithBandLimits
): boolean {
  if (frequency <= 0) return false;
  
  if (!settings || !('bandLimits' in settings) || !settings.bandLimits) {
    return true; // Skip validation if bandLimits not available
  }
  const isVHF = frequency >= settings.bandLimits.vhfMin && 
                frequency <= settings.bandLimits.vhfMax;
  const isUHF = frequency >= settings.bandLimits.uhfMin && 
                frequency <= settings.bandLimits.uhfMax;
  
  return isVHF || isUHF;
}

export function getFrequencyBand(
  frequency: number,
  settings?: RadioSettings | SettingsWithBandLimits
): 'VHF' | 'UHF' | 'Unknown' {
  if (!settings || !('bandLimits' in settings) || !settings.bandLimits) {
    return 'Unknown';
  }
  
  if (frequency >= settings.bandLimits.vhfMin && 
      frequency <= settings.bandLimits.vhfMax) {
    return 'VHF';
  }
  
  if (frequency >= settings.bandLimits.uhfMin && 
      frequency <= settings.bandLimits.uhfMax) {
    return 'UHF';
  }
  
  return 'Unknown';
}

