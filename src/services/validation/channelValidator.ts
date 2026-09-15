import type { Channel } from '../../models/Channel';
import type { RadioBandLimits } from '../../types/radioCapabilities';
import { isNoTxFrequency, isRxInNoTxBand, isValidFrequencyRange } from './frequencyValidator';
import { isValidColorCode, isValidTimeSlot } from './dmrValidator';

export interface ValidationError {
  field: string;
  message: string;
}

/** Default max channel number when capabilities don't specify (e.g. DM-32UV). */
const DEFAULT_MAX_CHANNELS = 4000;

/** Default longest name when capabilities don't specify: the DM-32's 16. */
const DEFAULT_MAX_NAME_LENGTH = 16;

export interface ChannelValidationOptions {
  /** capabilities.maxChannelNameLength */
  maxNameLength?: number;
  /** capabilities.blankTxAnyBand: a blank TX is allowed whatever the RX. */
  blankTxAnyBand?: boolean;
}

/**
 * Validate a channel. Band limits and maxChannels come from radio capabilities
 * (getCapabilitiesForModel(radioInfo?.model)).
 */
export function validateChannel(
  channel: Channel,
  bandLimits?: RadioBandLimits | null,
  maxChannels: number = DEFAULT_MAX_CHANNELS,
  options: ChannelValidationOptions = {}
): ValidationError[] {
  const errors: ValidationError[] = [];
  const maxNameLength = options.maxNameLength ?? DEFAULT_MAX_NAME_LENGTH;

  // Name validation
  if (!channel.name || channel.name.trim().length === 0) {
    errors.push({ field: 'name', message: 'Channel name is required' });
  }
  if (channel.name.length > maxNameLength) {
    errors.push({ field: 'name', message: `Channel name must be ${maxNameLength} characters or less` });
  }

  // Frequency validation
  if (channel.rxFrequency <= 0) {
    errors.push({ field: 'rxFrequency', message: 'RX frequency must be greater than 0' });
  }
  // The same blank-TX rule as isValidChannelFrequency.
  const blankTx = options.blankTxAnyBand
    ? isNoTxFrequency(channel.txFrequency)
    : isRxInNoTxBand(channel.rxFrequency) && channel.forbidTx && isNoTxFrequency(channel.txFrequency);
  if (!blankTx && channel.txFrequency <= 0) {
    errors.push({ field: 'txFrequency', message: 'TX frequency must be greater than 0' });
  }

  // Band limits validation (from radio capabilities). TX as well as RX: a write
  // leaves out a channel whose TX is out of band just as it does one whose RX is.
  if (bandLimits) {
    const ranges = bandLimits.uhfMin != null && bandLimits.uhfMax != null
      ? `VHF: ${bandLimits.vhfMin}-${bandLimits.vhfMax} MHz, UHF: ${bandLimits.uhfMin}-${bandLimits.uhfMax} MHz`
      : `VHF: ${bandLimits.vhfMin}-${bandLimits.vhfMax} MHz`;
    if (!isValidFrequencyRange(channel.rxFrequency, bandLimits)) {
      errors.push({
        field: 'rxFrequency',
        message: `RX frequency must be within radio band limits (${ranges})`,
      });
    }
    if (!blankTx && channel.txFrequency > 0 && !isValidFrequencyRange(channel.txFrequency, bandLimits)) {
      errors.push({
        field: 'txFrequency',
        message: `TX frequency must be within radio band limits (${ranges})`,
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
  maxChannels: number = DEFAULT_MAX_CHANNELS,
  options: ChannelValidationOptions = {}
): Map<number, ValidationError[]> {
  const errors = new Map<number, ValidationError[]>();
  channels.forEach((channel) => {
    const channelErrors = validateChannel(channel, bandLimits, maxChannels, options);
    if (channelErrors.length > 0) {
      errors.set(channel.number, channelErrors);
    }
  });
  return errors;
}
