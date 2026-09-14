import { describe, it, expect } from 'vitest';
import { encodeChannel, parseChannel } from '../../src/radios/dm32uv/structures';
import { createDefaultChannel } from '../../src/utils/channelHelpers';
import { NO_TX_FREQUENCY, hasBlankTx } from '../../src/services/validation/frequencyValidator';

/**
 * A DM-32 channel can have a blank TX frequency (0xFF) in any band, Forbid TX or
 * not: the Baofeng CPS writes one wherever TX is left empty. NeonPlug used to
 * accept a blank TX only for 87-136 MHz with Forbid TX, and a write dropped every
 * other channel that had one (reported by Will-83 in #168).
 */
describe('DM-32 blank TX', () => {
  it('writes a blank TX as 0xFF in any band, and reads it back blank', () => {
    for (const forbidTx of [false, true]) {
      const channel = createDefaultChannel({
        number: 1,
        name: 'Pager',
        rxFrequency: 152.48,
        txFrequency: NO_TX_FREQUENCY,
        forbidTx,
      });
      const data = encodeChannel(channel);
      expect(Array.from(data.slice(0x14, 0x18))).toEqual([0xff, 0xff, 0xff, 0xff]);

      const back = parseChannel(data, 1);
      expect(back.txFrequency).toBe(NO_TX_FREQUENCY);
      expect(back.rxFrequency).toBeCloseTo(152.48, 5);
      expect(back.forbidTx).toBe(forbidTx);
    }
  });

  it('still writes a real TX frequency', () => {
    const data = encodeChannel(createDefaultChannel({ number: 1, name: 'Simplex', rxFrequency: 146.52, txFrequency: 146.52 }));
    expect(parseChannel(data, 1).txFrequency).toBeCloseTo(146.52, 5);
  });

  it('shows a blank TX outside airband only on a radio that can hold one', () => {
    const pager = { rxFrequency: 152.48, txFrequency: NO_TX_FREQUENCY };
    expect(hasBlankTx(pager, true)).toBe(true);
    expect(hasBlankTx(pager, undefined)).toBe(false);
    expect(hasBlankTx({ rxFrequency: 120.0, txFrequency: NO_TX_FREQUENCY }, undefined)).toBe(true);
    expect(hasBlankTx({ rxFrequency: 146.52, txFrequency: 146.52 }, true)).toBe(false);
  });
});
