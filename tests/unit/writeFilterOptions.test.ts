/**
 * Which radios a write may drop out-of-band channels for. On a radio where a
 * channel is its slot, dropping one deletes it from the radio.
 */
import { describe, it, expect } from 'vitest';
import { writeFilterOptionsFor } from '../../src/services/writeFilterOptions';
import { getCapabilitiesForModel } from '../../src/radios/capabilities';

const filtersBand = (model: string) => writeFilterOptionsFor(model, getCapabilitiesForModel(model), false).filterBand;

describe('the band filter on a write', () => {
  it('is off for radios that keep every band', () => {
    expect(filtersBand('RT-950 Pro')).toBe(false);
    expect(filtersBand('DA-7X2')).toBe(false);
  });

  it('stays on for the others', () => {
    expect(filtersBand('UV5R-Mini')).toBe(true);
    expect(filtersBand('DM-32UV')).toBe(true);
  });
});
