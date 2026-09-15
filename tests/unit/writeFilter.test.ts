import { describe, it, expect } from 'vitest';
import { planWritableCodeplug } from '../../src/services/validation/writeFilter';
import { createDefaultChannel } from '../../src/utils/channelHelpers';
import type { Zone } from '../../src/models/Zone';
import type { ScanList } from '../../src/models/ScanList';

const channel = (number: number, mhz: number) =>
  createDefaultChannel({ number, name: `Ch ${number}`, rxFrequency: mhz, txFrequency: mhz });
const zone = (name: string, channels: number[]) => ({ id: name, name, channels }) as Zone;
const scanList = (name: string, channels: number[]) => ({ name, channels }) as ScanList;
const limits = { vhfMin: 136, vhfMax: 174, uhfMin: 400, uhfMax: 480 };

// Channel 2 is airband, outside these limits.
const channels = [channel(1, 146.52), channel(2, 118.1), channel(3, 446.1)];

describe('planWritableCodeplug', () => {
  it('leaves out channels outside the bands, and the zones and scan lists left empty', () => {
    const plan = planWritableCodeplug(
      channels,
      [zone('Air', [2]), zone('Mixed', [1, 2, 3])],
      [scanList('Air scan', [2]), scanList('All', [1, 2])],
      { filterBand: true, bandLimits: limits }
    );
    expect(plan.channels.map((c) => c.number)).toEqual([1, 3]);
    expect(plan.droppedChannels.map((c) => c.number)).toEqual([2]);
    expect(plan.zones.map((z) => [z.name, z.channels])).toEqual([['Mixed', [1, 3]]]);
    expect(plan.droppedZones).toEqual(['Air']);
    expect(plan.scanLists.map((s) => [s.name, s.channels])).toEqual([['All', [1]]]);
    expect(plan.droppedScanLists).toEqual(['Air scan']);
  });

  it('keeps every channel on a radio that checks frequencies itself, but drops references to channels that do not exist', () => {
    const plan = planWritableCodeplug(channels, [zone('Ghost', [9]), zone('Air', [2])], [], {
      filterBand: false,
      bandLimits: limits,
    });
    expect(plan.channels).toBe(channels);
    expect(plan.droppedChannels).toEqual([]);
    expect(plan.zones.map((z) => z.name)).toEqual(['Air']);
    expect(plan.droppedZones).toEqual(['Ghost']);
  });
});
