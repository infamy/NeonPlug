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
  const isVHF = frequency >= resolved.vhfMin && frequency <= resolved.vhfMax;
  // VHF-only radios (e.g. FT-25R, FT-4VR) have no UHF band at all.
  const isUHF = resolved.uhfMin != null && resolved.uhfMax != null &&
    frequency >= resolved.uhfMin && frequency <= resolved.uhfMax;
  return isVHF || isUHF;
}

/**
 * True if the channel's TX is blank (NO_TX_FREQUENCY) where the radio can hold one: in
 * 87–136 MHz on any radio, and in any band on a radio with `blankTxAnyBand`.
 */
export function hasBlankTx(channel: Pick<Channel, 'rxFrequency' | 'txFrequency'>, blankTxAnyBand?: boolean): boolean {
  return isNoTxFrequency(channel.txFrequency) && (blankTxAnyBand === true || isRxInNoTxBand(channel.rxFrequency));
}

/**
 * Check if a channel's frequencies are within supported ranges.
 * When limits is provided (e.g. from getCapabilitiesForModel(radioInfo?.model)?.bandLimits), uses those.
 * A channel with a blank TX only has its RX checked: in 87–136 MHz with Forbid TX on any radio,
 * and in any band, Forbid TX or not, on a radio with `blankTxAnyBand`.
 */
export function isValidChannelFrequency(
  channel: Channel,
  limits?: RadioBandLimits | null,
  options?: { blankTxAnyBand?: boolean }
): boolean {
  if (channel.rxFrequency <= 0) return false;
  const blankTx = options?.blankTxAnyBand
    ? isNoTxFrequency(channel.txFrequency)
    : isRxInNoTxBand(channel.rxFrequency) && channel.forbidTx && isNoTxFrequency(channel.txFrequency);
  if (blankTx) {
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
  if (bandLimits.uhfMin != null && bandLimits.uhfMax != null &&
      frequency >= bandLimits.uhfMin && frequency <= bandLimits.uhfMax) return 'UHF';
  return 'Unknown';
}

