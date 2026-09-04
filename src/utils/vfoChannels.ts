/**
 * VFO A/B channel numbering.
 *
 * The VFOs occupy the two channel slots immediately past the last storable
 * channel, so on a 4000-channel radio they are numbers 4001 and 4002. That is
 * true of the DM-32 and of the DA-7X2 — confirmed on hardware by reading VFO A
 * at channel index 4000 — and the two radios agree because both hold 4000
 * channels, not because they share a design.
 *
 * That distinction is why `maxChannels` is a parameter rather than a constant.
 * 4001/4002 was previously hardcoded in THREE separate copies across the channel
 * components; a radio with a different channel count and a VFO would have made
 * all three wrong at once, and silently — the VFO would render as an ordinary
 * channel and an ordinary channel would render as a VFO.
 */

/** Default for callers with no capability handy: the 4000-channel radios. */
export const DEFAULT_VFO_BASE = 4000;

export function vfoChannelNumbers(maxChannels: number = DEFAULT_VFO_BASE): {
  a: number;
  b: number;
} {
  return { a: maxChannels + 1, b: maxChannels + 2 };
}

export function isVFOChannel(
  channelNumber: number,
  maxChannels: number = DEFAULT_VFO_BASE
): boolean {
  const { a, b } = vfoChannelNumbers(maxChannels);
  return channelNumber === a || channelNumber === b;
}

/** 'A' or 'B' for a VFO; the plain number for anything else. */
export function getVFOIdentifier(
  channelNumber: number,
  maxChannels: number = DEFAULT_VFO_BASE
): string {
  const { a, b } = vfoChannelNumbers(maxChannels);
  if (channelNumber === a) return 'A';
  if (channelNumber === b) return 'B';
  return channelNumber.toString();
}
