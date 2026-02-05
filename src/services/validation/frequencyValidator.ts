import type { RadioSettings } from '../../models/RadioSettings';
import type { Channel } from '../../models/Channel';
import type { RadioBandLimits } from '../../types/radioCapabilities';

interface SettingsWithBandLimits {
  bandLimits: {
    vhfMin: number;
    vhfMax: number;
    uhfMin: number;
    uhfMax: number;
  };
}

// Default ranges (DM-32UV: VHF 87-174 MHz, UHF 400-470 MHz). Used when no limits provided.
const DEFAULT_VHF_MIN = 87;
const DEFAULT_VHF_MAX = 174;
const DEFAULT_UHF_MIN = 400;
const DEFAULT_UHF_MAX = 470;

/**
 * Check if a frequency is in the supported ranges.
 * When limits is provided (e.g. from getCapabilitiesForModel), uses those; otherwise uses default ranges.
 */
export function isValidFrequencyRange(frequency: number, limits?: RadioBandLimits | null): boolean {
  const vhfMin = limits?.vhfMin ?? DEFAULT_VHF_MIN;
  const vhfMax = limits?.vhfMax ?? DEFAULT_VHF_MAX;
  const uhfMin = limits?.uhfMin ?? DEFAULT_UHF_MIN;
  const uhfMax = limits?.uhfMax ?? DEFAULT_UHF_MAX;
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

