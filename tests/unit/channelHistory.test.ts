import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  channelsLabel,
  clearChannelHistory,
  HISTORY_LIMIT,
  MERGE_WINDOW_MS,
  recordChannelEdit,
  redoChannelEdit,
  undoChannelEdit,
  useChannelHistoryStore,
  watchChannelHistory,
} from '../../src/services/channelHistory';
import { useChannelsStore } from '../../src/store/channelsStore';
import { useZonesStore } from '../../src/store/zonesStore';
import { useScanListsStore } from '../../src/store/scanListsStore';
import { useRadioSettingsStore } from '../../src/store/radioSettingsStore';
import type { RadioSettings } from '../../src/models/RadioSettings';
import type { ScanList } from '../../src/models/ScanList';
import type { Zone } from '../../src/models/Zone';
import { createDefaultChannel } from '../../src/utils/channelHelpers';

const store = () => useChannelsStore.getState();
const names = () => store().channels.map((ch) => ch.name);
const steps = () => useChannelHistoryStore.getState().past.map((entry) => entry.label);
/** Lets the task end, so the next change is a step of its own. */
const nextTask = () => Promise.resolve();

describe('channel undo', () => {
  let stop: () => void;

  beforeEach(async () => {
    useChannelsStore.setState({
      channels: ['A', 'B', 'C', 'D'].map((name, i) => createDefaultChannel({ number: i + 1, name })),
      rawChannelData: new Map(),
    });
    useZonesStore.setState({ zones: [{ id: 'z1', name: 'Zone', channels: [2, 3, 4] }] as unknown as Zone[] });
    useScanListsStore.setState({ scanLists: [{ name: 'Scan', channels: [3, 4] }] as unknown as ScanList[] });
    useRadioSettingsStore.getState().setSettings(null);
    clearChannelHistory();
    await nextTask();
    stop = watchChannelHistory();
  });

  afterEach(() => {
    stop();
    vi.restoreAllMocks();
  });

  it('puts a delete back, with the zones and scan lists it renumbered', () => {
    recordChannelEdit('delete channel 2', () => store().deleteChannel(2));
    expect(names()).toEqual(['A', 'C', 'D']);
    expect(useZonesStore.getState().zones[0].channels).toEqual([2, 3]);
    expect(useScanListsStore.getState().scanLists[0].channels).toEqual([2, 3]);

    expect(undoChannelEdit()).toBe('delete channel 2');
    expect(names()).toEqual(['A', 'B', 'C', 'D']);
    expect(useZonesStore.getState().zones[0].channels).toEqual([2, 3, 4]);
    expect(useScanListsStore.getState().scanLists[0].channels).toEqual([3, 4]);
  });

  it('redoes what was undone, until a new change is made', () => {
    recordChannelEdit('delete channel 1', () => store().deleteChannel(1));
    undoChannelEdit();
    expect(redoChannelEdit()).toBe('delete channel 1');
    expect(names()).toEqual(['B', 'C', 'D']);

    undoChannelEdit();
    recordChannelEdit('edit channel 1', () => store().updateChannel(1, { name: 'Alpha' }));
    expect(redoChannelEdit()).toBeNull();
    expect(names()).toEqual(['Alpha', 'B', 'C', 'D']);
  });

  it('makes typing into one cell one step', async () => {
    for (const name of ['Al', 'Alp', 'Alpha']) {
      recordChannelEdit('edit channel 1', () => store().updateChannel(1, { name }), { mergeKey: '1:name' });
      await nextTask();
    }
    expect(steps()).toEqual(['edit channel 1']);
    undoChannelEdit();
    expect(names()[0]).toBe('A');
  });

  it('starts a new step after a pause as long as the merge window', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000);
    recordChannelEdit('edit channel 1', () => store().updateChannel(1, { name: 'Al' }), { mergeKey: '1:name' });
    await nextTask();
    now.mockReturnValue(1_000 + MERGE_WINDOW_MS);
    recordChannelEdit('edit channel 1', () => store().updateChannel(1, { name: 'Alpha' }), { mergeKey: '1:name' });
    expect(steps()).toHaveLength(2);
    undoChannelEdit();
    expect(names()[0]).toBe('Al');
  });

  it('makes the changes one click makes a single step', () => {
    const before = store().channels[0];
    recordChannelEdit('edit channel 1', () => store().updateChannel(1, { bandwidth: '12.5kHz' }), {
      mergeKey: '1:bandwidth',
    });
    recordChannelEdit('edit channel 1', () => store().updateChannel(1, { mode: 'Digital' }), { mergeKey: '1:mode' });
    expect(steps()).toHaveLength(1);
    undoChannelEdit();
    expect(store().channels[0]).toBe(before);
  });

  it('clears the history when a read or an import replaces the channels', () => {
    recordChannelEdit('delete channel 2', () => store().deleteChannel(2));
    store().setChannels([createDefaultChannel({ number: 1, name: 'Read' })]);
    expect(steps()).toEqual([]);
    expect(undoChannelEdit()).toBeNull();
    expect(names()).toEqual(['Read']);
  });

  it('clears it when the zones change elsewhere, so an undo cannot throw that change away', () => {
    recordChannelEdit('delete channel 2', () => store().deleteChannel(2));
    useZonesStore.getState().renameZone('z1', 'Renamed');
    expect(undoChannelEdit()).toBeNull();
    expect(useZonesStore.getState().zones[0].name).toBe('Renamed');
  });

  it('puts the VFO rows back too, which live in the settings', () => {
    const vfoA = createDefaultChannel({ number: 4001, name: '' });
    useRadioSettingsStore.getState().setSettings({ vfoA, vfoB: vfoA } as unknown as RadioSettings);
    recordChannelEdit('edit VFO A', () =>
      useRadioSettingsStore.getState().updateSettings({ vfoA: { ...vfoA, rxFrequency: 145.5 } })
    );
    expect(steps()).toEqual(['edit VFO A']);
    undoChannelEdit();
    expect(useRadioSettingsStore.getState().settings?.vfoA).toBe(vfoA);
  });

  it(`keeps the last ${HISTORY_LIMIT} steps`, async () => {
    for (let i = 0; i <= HISTORY_LIMIT; i++) {
      recordChannelEdit(`edit ${i}`, () => store().updateChannel(1, { name: `N${i}` }));
      await nextTask();
    }
    expect(steps()).toHaveLength(HISTORY_LIMIT);
    expect(steps()[0]).toBe('edit 1');
  });

  it('offers Undo after a delete, and withdraws the offer at the next change', async () => {
    recordChannelEdit('delete channel 2', () => store().deleteChannel(2), { announce: 'Deleted channel 2.' });
    expect(useChannelHistoryStore.getState().notice?.text).toBe('Deleted channel 2.');
    await nextTask();
    recordChannelEdit('edit channel 1', () => store().updateChannel(1, { name: 'Alpha' }));
    expect(useChannelHistoryStore.getState().notice).toBeNull();
  });

  it('records nothing for a change that changes nothing', () => {
    recordChannelEdit('nothing', () => {});
    expect(steps()).toEqual([]);
  });

  it('names one channel, a VFO, or how many', () => {
    expect(channelsLabel([5])).toBe('channel 5');
    expect(channelsLabel([4001])).toBe('VFO A');
    expect(channelsLabel([1, 2, 3])).toBe('3 channels');
  });
});
