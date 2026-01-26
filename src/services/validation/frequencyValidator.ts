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
// Repeater channels: 136-172 MHz (VHF) and 400-470 MHz (UHF)
// Airport channels: 108-136 MHz (Aviation VHF band)
const REPEATER_VHF_MIN = 136;
const REPEATER_VHF_MAX = 172;
const REPEATER_UHF_MIN = 400;
const REPEATER_UHF_MAX = 470;
const AIRPORT_MIN = 108;
const AIRPORT_MAX = 136;

/**
 * Check if a channel appears to be an airport channel based on its frequency
 * Airport channels are in the 108-136 MHz range (Aviation VHF band)
 */
export function isAirportChannel(channel: Channel): boolean {
  return channel.rxFrequency >= AIRPORT_MIN && channel.rxFrequency <= AIRPORT_MAX;
}

/**
 * Check if a frequency is in the supported repeater ranges (136-172 MHz or 400-470 MHz)
 */
export function isValidRepeaterFrequency(frequency: number): boolean {
  const isVHF = frequency >= REPEATER_VHF_MIN && frequency <= REPEATER_VHF_MAX;
  const isUHF = frequency >= REPEATER_UHF_MIN && frequency <= REPEATER_UHF_MAX;
  return isVHF || isUHF;
}

/**
 * Check if a frequency is in the supported airport range (108-136 MHz)
 */
export function isValidAirportFrequency(frequency: number): boolean {
  return frequency >= AIRPORT_MIN && frequency <= AIRPORT_MAX;
}

/**
 * Check if a channel's frequencies are within supported ranges
 * Airport channels: 108-136 MHz
 * Repeater channels: 136-172 MHz or 400-470 MHz
 */
export function isValidChannelFrequency(channel: Channel): boolean {
  if (channel.rxFrequency <= 0 || channel.txFrequency <= 0) return false;
  
  // Check if it's an airport channel
  if (isAirportChannel(channel)) {
    return isValidAirportFrequency(channel.rxFrequency) && 
           isValidAirportFrequency(channel.txFrequency);
  }
  
  // Otherwise, check repeater ranges
  return isValidRepeaterFrequency(channel.rxFrequency) && 
         isValidRepeaterFrequency(channel.txFrequency);
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

