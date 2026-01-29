import type { RadioSettings } from '../../models/RadioSettings';
import type { Channel } from '../../models/Channel';

interface SettingsWithBandLimits {
  bandLimits: {
    vhfMin: number;
    vhfMax: number;
    uhfMin: number;
    uhfMax: number;
  };
}

// DM-32UV supported frequency ranges
// VHF: 87-174 MHz
// UHF: 400-470 MHz
const VHF_MIN = 87;
const VHF_MAX = 174;
const UHF_MIN = 400;
const UHF_MAX = 470;

/**
 * Check if a frequency is in the supported ranges (87-174 MHz or 400-470 MHz)
 */
export function isValidFrequencyRange(frequency: number): boolean {
  const isVHF = frequency >= VHF_MIN && frequency <= VHF_MAX;
  const isUHF = frequency >= UHF_MIN && frequency <= UHF_MAX;
  return isVHF || isUHF;
}

/**
 * Check if a channel's frequencies are within supported ranges
 * VHF: 87-174 MHz
 * UHF: 400-470 MHz
 */
export function isValidChannelFrequency(channel: Channel): boolean {
  if (channel.rxFrequency <= 0 || channel.txFrequency <= 0) return false;
  
  return isValidFrequencyRange(channel.rxFrequency) && 
         isValidFrequencyRange(channel.txFrequency);
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

