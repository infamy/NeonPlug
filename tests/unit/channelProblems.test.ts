import { describe, it, expect } from 'vitest';
import { channelProblems, type ChannelWriteRule } from '../../src/services/validation/channelProblems';
import { planWritableCodeplug } from '../../src/services/validation/writeFilter';
import { NO_TX_FREQUENCY } from '../../src/services/validation/frequencyValidator';
import { DEFAULT_BAND_LIMITS } from '../../src/types/radioCapabilities';
import type { Channel } from '../../src/models/Channel';
import { createDefaultChannel } from '../../src/utils/channelHelpers';

const rule: ChannelWriteRule = { filterBand: true, bandLimits: DEFAULT_BAND_LIMITS, maxNameLength: 16 };
const channel = (over: Partial<Channel> = {}) =>
  createDefaultChannel({ number: 1, name: 'Test', rxFrequency: 146.52, txFrequency: 146.52, ...over });
const OUTSIDE = "Outside this radio's bands, so a write leaves this channel out.";

describe('what the channel grid marks', () => {
  it('marks nothing on a channel the write keeps', () => {
    expect(channelProblems(channel(), rule)).toEqual({});
  });

  it('marks each frequency outside the bands', () => {
    expect(channelProblems(channel({ txFrequency: 300 }), rule)).toEqual({ tx: OUTSIDE });
    expect(channelProblems(channel({ rxFrequency: 300, txFrequency: 300 }), rule)).toEqual({ rx: OUTSIDE, tx: OUTSIDE });
  });

  it('leaves a blank TX alone where the radio holds one', () => {
    const airband = { vhfMin: 108, vhfMax: 174, uhfMin: 400, uhfMax: 480 };
    const receiveOnly = channel({ rxFrequency: 118.1, txFrequency: NO_TX_FREQUENCY, forbidTx: true });
    expect(channelProblems(receiveOnly, { ...rule, bandLimits: airband })).toEqual({});
  });

  it('checks only what the encoding can store while out-of-band frequencies are on', () => {
    const outOfBand = { ...rule, outOfBand: true };
    expect(channelProblems(channel({ rxFrequency: 300, txFrequency: 300 }), outOfBand)).toEqual({});
    expect(channelProblems(channel({ txFrequency: 1200 }), outOfBand)).toEqual({
      tx: 'Too high to store, so a write leaves this channel out.',
    });
  });

  it('marks no frequency where the write keeps every channel', () => {
    expect(channelProblems(channel({ rxFrequency: 98.5, txFrequency: 300 }), { ...rule, filterBand: false })).toEqual({});
  });

  it('marks a name longer than the radio keeps', () => {
    expect(channelProblems(channel({ name: 'Repeater1' }), { ...rule, maxNameLength: 8 })).toEqual({
      name: 'Longer than the 8 characters this radio keeps.',
    });
  });

  it('marks exactly the channels the write leaves out', () => {
    const channels = [
      channel(),
      channel({ rxFrequency: 300 }),
      channel({ txFrequency: 300 }),
      channel({ txFrequency: 0 }),
      channel({ rxFrequency: 118.1, txFrequency: NO_TX_FREQUENCY, forbidTx: true }),
      channel({ rxFrequency: 446, txFrequency: NO_TX_FREQUENCY }),
      channel({ rxFrequency: 446, txFrequency: 1200 }),
    ].map((ch, i) => ({ ...ch, number: i + 1 }));

    for (const r of [rule, { ...rule, outOfBand: true }, { ...rule, blankTxAnyBand: true }]) {
      const dropped = planWritableCodeplug(channels, [], [], r).droppedChannels.map((ch) => ch.number);
      const marked = channels
        .filter((ch) => {
          const p = channelProblems(ch, r);
          return p.rx !== undefined || p.tx !== undefined;
        })
        .map((ch) => ch.number);
      expect(marked).toEqual(dropped);
    }
  });
});
