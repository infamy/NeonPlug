import { describe, it, expect } from 'vitest';
import {
  isValidFrequencyRange,
  isValidChannelFrequency,
  getFrequencyBand,
} from '../../src/services/validation/frequencyValidator';
import { FT_CAPS_VHF, FT65_CAPS_DUAL } from '../../src/radios/ft65/capabilities';
import type { Channel } from '../../src/models';

// Regression for the FT-25R / FT-4VR band-limits bug: FT_CAPS_VHF used to carry
// the full dual-band limits, so UHF channels passed the pre-write filter for a
// VHF-only radio. VHF-only is expressed by omitting uhfMin/uhfMax entirely.
describe('VHF-only band limits (FT-25R / FT-4VR)', () => {
  const vhfOnly = { vhfMin: 136, vhfMax: 174 };

  it('accepts VHF frequencies', () => {
    expect(isValidFrequencyRange(136, vhfOnly)).toBe(true);
    expect(isValidFrequencyRange(146.52, vhfOnly)).toBe(true);
    expect(isValidFrequencyRange(174, vhfOnly)).toBe(true);
  });

  it('rejects UHF frequencies when the radio has no UHF band', () => {
    expect(isValidFrequencyRange(400, vhfOnly)).toBe(false);
    expect(isValidFrequencyRange(446.0, vhfOnly)).toBe(false);
    expect(isValidFrequencyRange(480, vhfOnly)).toBe(false);
  });

  it('reports Unknown band for UHF frequencies on a VHF-only radio', () => {
    expect(getFrequencyBand(446.0, vhfOnly)).toBe('Unknown');
    expect(getFrequencyBand(146.52, vhfOnly)).toBe('VHF');
  });

  it('FT_CAPS_VHF defines no UHF band', () => {
    expect(FT_CAPS_VHF.bandLimits?.uhfMin).toBeUndefined();
    expect(FT_CAPS_VHF.bandLimits?.uhfMax).toBeUndefined();
  });

  it('FT65_CAPS_DUAL still accepts both bands', () => {
    expect(isValidFrequencyRange(146.52, FT65_CAPS_DUAL.bandLimits)).toBe(true);
    expect(isValidFrequencyRange(446.0, FT65_CAPS_DUAL.bandLimits)).toBe(true);
  });

  it('filters a UHF channel for a VHF-only radio via isValidChannelFrequency', () => {
    const uhfChannel = { rxFrequency: 446.0, txFrequency: 446.0, forbidTx: false } as Channel;
    expect(isValidChannelFrequency(uhfChannel, FT_CAPS_VHF.bandLimits)).toBe(false);
    expect(isValidChannelFrequency(uhfChannel, FT65_CAPS_DUAL.bandLimits)).toBe(true);
  });
});
