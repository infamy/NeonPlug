import type { Channel } from '../../models/Channel';
import type { RadioBandLimits } from '../../types/radioCapabilities';
import { DEFAULT_BAND_LIMITS } from '../../types/radioCapabilities';

/** RX range where TX is not used (aviation/FM receive-only). TX bytes stored as 0xFF on radio. */
export const NO_TX_BAND_RX_MIN_MHZ = 87;
export const NO_TX_BAND_RX_MAX_MHZ = 136;

/** Display value for "no TX" (0xFF on radio). Shown when RX is in 87–136 MHz and Forbid TX. */
export const NO_TX_FREQUENCY = 1666.666;

/** True if txFrequency is the sentinel for "no TX" (receive-only in 87–136 band). */
export function isNoTxFrequency(txFrequency: number): boolean {
  return txFrequency >= 1666 && txFrequency < 1667;
}

/** True if RX is in the band where we use 0xFF for TX (87–136 MHz, aviation/FM receive-only). */
export function isRxInNoTxBand(rxFrequency: number): boolean {
  return rxFrequency >= NO_TX_BAND_RX_MIN_MHZ && rxFrequency < NO_TX_BAND_RX_MAX_MHZ;
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
 * Channels with RX in 87–136 MHz and Forbid TX use 0xFF for TX (sentinel); only RX is validated for those.
 */
export function isValidChannelFrequency(channel: Channel, limits?: RadioBandLimits | null): boolean {
  if (channel.rxFrequency <= 0) return false;
  if (isRxInNoTxBand(channel.rxFrequency) && channel.forbidTx && isNoTxFrequency(channel.txFrequency)) {
    return isValidFrequencyRange(channel.rxFrequency, limits);
  }
  if (channel.txFrequency <= 0) return false;
  return isValidFrequencyRange(channel.rxFrequency, limits) &&
         isValidFrequencyRange(channel.txFrequency, limits);
}

/** Band limits from radio capabilities (e.g. getCapabilitiesForModel(radioInfo?.model)?.bandLimits). */
export function isValidFrequency(frequency: number, bandLimits?: RadioBandLimits | null): boolean {
  if (frequency <= 0) return false;
  if (!bandLimits) return true;
  return isValidFrequencyRange(frequency, bandLimits);
}

/** Band limits from radio capabilities. */
export function getFrequencyBand(frequency: number, bandLimits?: RadioBandLimits | null): 'VHF' | 'UHF' | 'Unknown' {
  if (!bandLimits) return 'Unknown';
  if (frequency >= bandLimits.vhfMin && frequency <= bandLimits.vhfMax) return 'VHF';
  if (frequency >= bandLimits.uhfMin && frequency <= bandLimits.uhfMax) return 'UHF';
  return 'Unknown';
}

