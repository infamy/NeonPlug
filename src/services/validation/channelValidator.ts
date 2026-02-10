import type { Channel } from '../../models/Channel';
import type { RadioBandLimits } from '../../types/radioCapabilities';
import { isNoTxFrequency, isRxInNoTxBand } from './frequencyValidator';
import { isValidColorCode, isValidTimeSlot } from './dmrValidator';

export interface ValidationError {
  field: string;
  message: string;
}

/** Default max channel number when capabilities don't specify (e.g. DM-32UV). */
const DEFAULT_MAX_CHANNELS = 4000;

/**
 * Validate a channel. Band limits and maxChannels come from radio capabilities
 * (getCapabilitiesForModel(radioInfo?.model)).
 */
export function validateChannel(
  channel: Channel,
  bandLimits?: RadioBandLimits | null,
  maxChannels: number = DEFAULT_MAX_CHANNELS
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
  const isNoTxChannel = isRxInNoTxBand(channel.rxFrequency) && channel.forbidTx && isNoTxFrequency(channel.txFrequency);
  if (!isNoTxChannel && channel.txFrequency <= 0) {
    errors.push({ field: 'txFrequency', message: 'TX frequency must be greater than 0' });
  }

  // Band limits validation (from radio capabilities)
  if (bandLimits) {
    const isVHF = channel.rxFrequency >= bandLimits.vhfMin && channel.rxFrequency <= bandLimits.vhfMax;
    const isUHF = channel.rxFrequency >= bandLimits.uhfMin && channel.rxFrequency <= bandLimits.uhfMax;
    if (!isVHF && !isUHF) {
      errors.push({
        field: 'rxFrequency',
        message: `RX frequency must be within radio band limits (VHF: ${bandLimits.vhfMin}-${bandLimits.vhfMax} MHz, UHF: ${bandLimits.uhfMin}-${bandLimits.uhfMax} MHz)`,
      });
    }
  }

  // Channel number validation (uses maxChannels from capabilities, e.g. 999 for UV5R-Mini)
  if (channel.number < 1 || channel.number > maxChannels) {
    errors.push({ field: 'number', message: `Channel number must be between 1 and ${maxChannels}` });
  }

  // DMR-specific validation (digital only)
  const isDigital = channel.mode === 'Digital' || channel.mode === 'Fixed Digital';
  if (isDigital) {
    if (!isValidColorCode(channel.colorCode)) {
      errors.push({ field: 'colorCode', message: 'Color code must be between 0 and 15' });
    }
    const slotForValidation = (channel.slotOperation ?? 0) === 0 ? 1 : 2;
    if (!isValidTimeSlot(slotForValidation)) {
      errors.push({ field: 'slotOperation', message: 'Slot must be 1 (TS1) or 2 (TS2)' });
    }
  }

  // Contact ID validation (digital only; analog does not use talk group)
  if (isDigital && (channel.contactId < 0 || channel.contactId > 250)) {
    errors.push({ field: 'contactId', message: 'Contact ID must be between 0 and 250' });
  }

  return errors;
}

export function validateChannels(
  channels: Channel[],
  bandLimits?: RadioBandLimits | null,
  maxChannels: number = DEFAULT_MAX_CHANNELS
): Map<number, ValidationError[]> {
  const errors = new Map<number, ValidationError[]>();
  channels.forEach((channel) => {
    const channelErrors = validateChannel(channel, bandLimits, maxChannels);
    if (channelErrors.length > 0) {
      errors.set(channel.number, channelErrors);
    }
  });
  return errors;
}

