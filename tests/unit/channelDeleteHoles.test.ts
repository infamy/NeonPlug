import { describe, it, expect, beforeEach } from 'vitest';
import { useChannelsStore } from '../../src/store/channelsStore';
import { useZonesStore } from '../../src/store/zonesStore';
import { useScanListsStore } from '../../src/store/scanListsStore';
import { useRadioStore } from '../../src/store/radioStore';
import { getCapabilitiesForModel } from '../../src/radios/capabilities';
import type { ScanList } from '../../src/models/ScanList';
import type { Zone } from '../../src/models/Zone';
import { createDefaultChannel } from '../../src/utils/channelHelpers';

const numbers = () => useChannelsStore.getState().channels.map((ch) => ch.number);

describe('deleting a channel on a radio whose channel number is its slot', () => {
  beforeEach(() => {
    useChannelsStore.setState({
      channels: [1, 2, 3, 4, 5, 4001, 4002].map((number) => createDefaultChannel({ number, name: `CH${number}` })),
      rawChannelData: new Map(),
    });
    useZonesStore.setState({ zones: [{ id: 'z1', name: 'Zone', channels: [2, 3, 5] }] as unknown as Zone[] });
    useScanListsStore.setState({
      scanLists: [
        { name: 'Scan', channels: [3, 4], priority1Type: 2, priorityChannel1: 3, priority2Type: 2, priorityChannel2: 4 },
      ] as unknown as ScanList[],
    });
    useRadioStore.getState().setTable('zoneCurrentChannels', { a: [2], b: [1] });
    useRadioStore.getState().setTable('zoneCurrentEdits', {});
  });

  it('leaves the other channels, VFO A and B included, on their numbers', () => {
    useChannelsStore.getState().deleteChannels([3], { keepNumbers: true });
    expect(numbers()).toEqual([1, 2, 4, 5, 4001, 4002]);
  });

  it('takes the channel out of zones and scan lists, and turns off a priority that named it', () => {
    useChannelsStore.getState().deleteChannels([3], { keepNumbers: true });
    expect(useZonesStore.getState().zones[0].channels).toEqual([2, 5]);
    const [list] = useScanListsStore.getState().scanLists;
    expect(list.channels).toEqual([4]);
    expect(list.priority1Type).toBe(0);
    expect(list.priorityChannel1).toBeUndefined();
    expect(list.priorityChannel2).toBe(4);
  });

  it("puts a zone's current A on the first channel left and B on the first that differs", () => {
    useChannelsStore.getState().deleteChannels([3], { keepNumbers: true });
    const tables = useRadioStore.getState().tables;
    expect(tables.zoneCurrentChannels).toEqual({ a: [0], b: [1] });
    expect(tables.zoneCurrentEdits).toEqual({ z1: { a: 0, b: 1 } });
  });

  it('still packs the table where the radio needs it packed', () => {
    useChannelsStore.getState().deleteChannels([3]);
    expect(numbers()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('is how the DA-7X2, FT-65 family and UV5R-Mini delete, and not the DM-32', () => {
    for (const model of ['DA-7X2', 'AT-D890UV', 'FT-65', 'FT-4', 'FT-25R', 'UV5R-Mini']) {
      expect(getCapabilitiesForModel(model)?.channelDeleteKeepsNumbers, model).toBe(true);
    }
    expect(getCapabilitiesForModel('DM-32UV')?.channelDeleteKeepsNumbers).toBeFalsy();
  });
});
