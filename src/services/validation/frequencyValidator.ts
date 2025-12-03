import type { RadioSettings } from '../../models/RadioSettings';

export function isValidFrequency(
  frequency: number,
  settings?: RadioSettings
): boolean {
  if (frequency <= 0) return false;
  
  if (!settings) return true;
  
  const isVHF = frequency >= settings.bandLimits.vhfMin && 
                frequency <= settings.bandLimits.vhfMax;
  const isUHF = frequency >= settings.bandLimits.uhfMin && 
                frequency <= settings.bandLimits.uhfMax;
  
  return isVHF || isUHF;
}

export function getFrequencyBand(
  frequency: number,
  settings?: RadioSettings
): 'VHF' | 'UHF' | 'Unknown' {
  if (!settings) return 'Unknown';
  
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

