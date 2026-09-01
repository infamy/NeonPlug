import { describe, it, expect } from 'vitest';
import { splitAirbandChannels, isAirbandFrequency } from '../../src/services/airportChannels';
import { createDefaultChannel } from '../../src/utils/channelHelpers';
import type { Zone } from '../../src/models/Zone';

const ch = (number: number, rxFrequency: number, name = `CH${number}`) =>
  createDefaultChannel({ number, name, rxFrequency, txFrequency: rxFrequency });

const zone = (name: string, channels: number[]): Zone => ({ id: name, name, channels });

describe('airband routing', () => {
  it('recognises the civil air band and nothing either side of it', () => {
    expect(isAirbandFrequency(118.1)).toBe(true);
    expect(isAirbandFrequency(108)).toBe(true);
    // 137.0 is the top edge and belongs to the band above.
    expect(isAirbandFrequency(137)).toBe(false);
    expect(isAirbandFrequency(107.9)).toBe(false);
    expect(isAirbandFrequency(145.5)).toBe(false);
  });

  it('diverts airband channels and leaves the rest alone', () => {
    const { channels, airband } = splitAirbandChannels(
      [ch(1, 118.1), ch(2, 145.5), ch(3, 121.5)],
      []
    );
    expect(airband.map((c) => c.number)).toEqual([1, 3]);
    expect(channels.map((c) => c.number)).toEqual([2]);
  });

  it('strips diverted channels out of zones rather than leaving them dangling', () => {
    // A zone member pointing at a channel that moved to another table is a
    // reference to nothing — exactly what must never reach the radio.
    const { zones } = splitAirbandChannels(
      [ch(1, 118.1), ch(2, 145.5)],
      [zone('Mixed', [1, 2])]
    );
    expect(zones[0].channels).toEqual([2]);
  });

  it('drops a zone whose members were all airband', () => {
    const { zones } = splitAirbandChannels(
      [ch(1, 118.1), ch(2, 121.5)],
      [zone('Airports', [1, 2])]
    );
    expect(zones).toEqual([]);
  });

  it('is a no-op when nothing is airband', () => {
    const input = [ch(1, 145.5), ch(2, 435.0)];
    const zones = [zone('Local', [1, 2])];
    const out = splitAirbandChannels(input, zones);
    expect(out.channels).toBe(input);
    expect(out.zones).toBe(zones);
    expect(out.airband).toEqual([]);
  });
});
