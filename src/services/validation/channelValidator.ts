import type { Channel } from '../../models/Channel';
import type { RadioSettings } from '../../models/RadioSettings';

export interface ValidationError {
  field: string;
  message: string;
}

export function validateChannel(
  channel: Channel,
  settings?: RadioSettings
): ValidationError[] {
  const errors: ValidationError[] = [];

  // Name validation
  if (!channel.name || channel.name.trim().length === 0) {
    errors.push({ field: 'name', message: 'Channel name is required' });
  }
  if (channel.name.length > 16) {
    errors.push({ field: 'name', message: 'Channel name must be 16 characters or less' });
  }

  // Frequency validation
  if (channel.rxFrequency <= 0) {
    errors.push({ field: 'rxFrequency', message: 'RX frequency must be greater than 0' });
  }
  if (channel.txFrequency <= 0) {
    errors.push({ field: 'txFrequency', message: 'TX frequency must be greater than 0' });
  }

  // Band limits validation (if settings available)
  if (settings) {
    const isVHF = channel.rxFrequency >= settings.bandLimits.vhfMin && 
                  channel.rxFrequency <= settings.bandLimits.vhfMax;
    const isUHF = channel.rxFrequency >= settings.bandLimits.uhfMin && 
                  channel.rxFrequency <= settings.bandLimits.uhfMax;
    
    if (!isVHF && !isUHF) {
      errors.push({ 
        field: 'rxFrequency', 
        message: `RX frequency must be within radio band limits (VHF: ${settings.bandLimits.vhfMin}-${settings.bandLimits.vhfMax} MHz, UHF: ${settings.bandLimits.uhfMin}-${settings.bandLimits.uhfMax} MHz)` 
      });
    }
  }

  // Channel number validation
  if (channel.number < 1 || channel.number > 4000) {
    errors.push({ field: 'number', message: 'Channel number must be between 1 and 4000' });
  }

  // DMR-specific validation
  if (channel.mode === 'Digital' || channel.mode === 'Fixed Digital') {
    if (channel.colorCode < 0 || channel.colorCode > 15) {
      errors.push({ field: 'colorCode', message: 'Color code must be between 0 and 15' });
    }
  }

  // Contact ID validation
  if (channel.contactId < 0 || channel.contactId > 250) {
    errors.push({ field: 'contactId', message: 'Contact ID must be between 0 and 250' });
  }

  return errors;
}

export function validateChannels(
  channels: Channel[],
  settings?: RadioSettings
): Map<number, ValidationError[]> {
  const errors = new Map<number, ValidationError[]>();
  
  channels.forEach(channel => {
    const channelErrors = validateChannel(channel, settings);
    if (channelErrors.length > 0) {
      errors.set(channel.number, channelErrors);
    }
  });
  
  return errors;
}

