import { describe, it, expect } from 'vitest';
import { isWritableChannelFrequency, NO_TX_FREQUENCY } from '../../src/services/validation/frequencyValidator';
import { getCapabilitiesForModel } from '../../src/radios/capabilities';
import { DEFAULT_BAND_LIMITS } from '../../src/types/radioCapabilities';
import type { Channel } from '../../src/models';

const ch = (rx: number, tx: number) => ({ rxFrequency: rx, txFrequency: tx, forbidTx: false }) as unknown as Channel;

describe('out-of-band frequencies on write', () => {
  it('drops an out-of-band channel while the switch is off', () => {
    expect(isWritableChannelFrequency(ch(222.1, 222.1), DEFAULT_BAND_LIMITS, { outOfBand: false })).toBe(false);
  });

  it('keeps it while the switch is on, blank TX included', () => {
    expect(isWritableChannelFrequency(ch(222.1, 223.7), DEFAULT_BAND_LIMITS, { outOfBand: true })).toBe(true);
    expect(isWritableChannelFrequency(ch(50.1, NO_TX_FREQUENCY), DEFAULT_BAND_LIMITS, { outOfBand: true })).toBe(true);
  });

  it('still drops what the channel encoding cannot hold', () => {
    expect(isWritableChannelFrequency(ch(1296.0, 1296.0), DEFAULT_BAND_LIMITS, { outOfBand: true })).toBe(false);
    expect(isWritableChannelFrequency(ch(0, 146.52), DEFAULT_BAND_LIMITS, { outOfBand: true })).toBe(false);
    expect(isWritableChannelFrequency(ch(146.52, 0), DEFAULT_BAND_LIMITS, { outOfBand: true })).toBe(false);
  });

  it('is offered on the DM-32 only', () => {
    expect(getCapabilitiesForModel('DM-32UV')?.supportsOutOfBandFrequencies).toBe(true);
    expect(getCapabilitiesForModel('DP570UV')?.supportsOutOfBandFrequencies).toBe(true);
    for (const model of ['UV5R-Mini', 'FT-65', 'FT-4', 'FT-25R', 'DA-7X2', 'AT-D890UV']) {
      expect(getCapabilitiesForModel(model)?.supportsOutOfBandFrequencies).toBeFalsy();
    }
  });
});
