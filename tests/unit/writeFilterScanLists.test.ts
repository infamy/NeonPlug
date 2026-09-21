import { describe, it, expect } from 'vitest';
import { planWritableCodeplug } from '../../src/services/validation/writeFilter';
import type { ScanList } from '../../src/models/ScanList';
import { createDefaultChannel } from '../../src/utils/channelHelpers';

const channels = [createDefaultChannel({ number: 1, name: 'Simplex', rxFrequency: 146.52, txFrequency: 146.52 })];
const scanLists = [
  { name: 'Full', channels: [1] },
  { name: 'Empty', channels: [] },
] as unknown as ScanList[];

describe('scan lists in the write plan', () => {
  it('leaves out an empty scan list where the write drops it', () => {
    const plan = planWritableCodeplug(channels, [], scanLists, { filterBand: true });
    expect(plan.scanLists.map((list) => list.name)).toEqual(['Full']);
    expect(plan.droppedScanLists).toEqual(['Empty']);
  });

  it('keeps every scan list on a radio whose write sends them by slot, empty ones included', () => {
    const plan = planWritableCodeplug(channels, [], scanLists, { filterBand: false });
    expect(plan.scanLists.map((list) => list.name)).toEqual(['Full', 'Empty']);
    expect(plan.droppedScanLists).toEqual([]);
  });
});
