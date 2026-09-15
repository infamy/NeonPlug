import { create } from 'zustand';
import type { Channel } from '../models/Channel';
import { useZonesStore } from './zonesStore';
import { useScanListsStore } from './scanListsStore';
import { useRadioStore } from './radioStore';

export interface RawChannelData {
  data: Uint8Array;
  blockAddr: number;
  offset: number;
}

export interface DeleteChannelsOptions {
  /**
   * Leave each deleted channel's slot empty, every other channel keeping its
   * number (`caps.channelDeleteKeepsNumbers`). Without it the table is packed.
   */
  keepNumbers?: boolean;
}

interface ChannelsState {
  channels: Channel[];
  selectedChannel: number | null;
  rawChannelData: Map<number, RawChannelData>; // Store raw data for debug export
  setChannels: (channels: Channel[]) => void;
  setRawChannelData: (rawData: Map<number, RawChannelData>) => void;
  addChannel: (channel: Channel) => void;
  updateChannel: (number: number, channel: Partial<Channel>) => void;
  deleteChannel: (number: number, options?: DeleteChannelsOptions) => void;
  /** Remove multiple channels at once; use for bulk delete so renumbering doesn't invalidate later numbers */
  deleteChannels: (numbers: number[], options?: DeleteChannelsOptions) => void;
  setSelectedChannel: (number: number | null) => void;
}

/**
 * Delete without renumbering, for radios whose channel number is its memory slot.
 *
 * The DA-7X2's vendor CPS clears the channel's record and, in the same routine,
 * takes it out of every zone and scan list, turns off a scan priority channel
 * that pointed at it, and puts each affected zone's current channel A on the
 * first channel left and B on the first that differs from A. CHIRP and the
 * radios' own menus delete an FT-65 or UV5R-Mini memory the same way, without
 * the lists those radios don't have.
 */
function deleteLeavingHoles(state: ChannelsState, doomed: ReadonlySet<number>): Partial<ChannelsState> {
  const zonesStore = useZonesStore.getState();
  const touchedZones = new Set<string>();
  const zones = zonesStore.zones.map((zone) => {
    if (!zone.channels.some((n) => doomed.has(n))) return zone;
    touchedZones.add(zone.id);
    return { ...zone, channels: zone.channels.filter((n) => !doomed.has(n)) };
  });
  if (touchedZones.size > 0) zonesStore.setZones(zones);

  const scanListsStore = useScanListsStore.getState();
  const gone = (n: number | undefined) => n !== undefined && doomed.has(n);
  let scanListsChanged = false;
  const scanLists = scanListsStore.scanLists.map((list) => {
    const channels = list.channels.filter((n) => !doomed.has(n));
    const priority1Gone = gone(list.priorityChannel1);
    const priority2Gone = gone(list.priorityChannel2);
    const designatedGone = gone(list.designatedTxChannel);
    if (channels.length === list.channels.length && !priority1Gone && !priority2Gone && !designatedGone) {
      return list;
    }
    scanListsChanged = true;
    return {
      ...list,
      channels,
      ...(priority1Gone ? { priority1Type: 0, priorityChannel1: undefined } : {}),
      ...(priority2Gone ? { priority2Type: 0, priorityChannel2: undefined } : {}),
      ...(designatedGone ? { designatedTxChannel: undefined } : {}),
    };
  });
  if (scanListsChanged) scanListsStore.setScanLists(scanLists);

  // Zone current A/B are positions in a zone's member list (DA-7X2 tables).
  const radio = useRadioStore.getState();
  const current = radio.tables.zoneCurrentChannels;
  if (current && touchedZones.size > 0) {
    const a = [...current.a];
    const b = [...current.b];
    const edits = { ...radio.tables.zoneCurrentEdits };
    zones.forEach((zone, index) => {
      if (!touchedZones.has(zone.id)) return;
      const differs = zone.channels.findIndex((n) => n !== zone.channels[0]);
      const bPosition = differs >= 0 ? differs : 0;
      a[index] = 0;
      b[index] = bPosition;
      edits[zone.id] = { a: 0, b: bPosition };
    });
    radio.setTable('zoneCurrentChannels', { a, b });
    radio.setTable('zoneCurrentEdits', edits);
  }

  const rawChannelData = new Map(state.rawChannelData);
  for (const n of doomed) rawChannelData.delete(n);
  return { channels: state.channels.filter((ch) => !doomed.has(ch.number)), rawChannelData };
}

export const useChannelsStore = create<ChannelsState>((set) => ({
  channels: [],
  selectedChannel: null,
  rawChannelData: new Map(),
  setChannels: (channels) => set({ channels }),
  setRawChannelData: (rawData) => set({ rawChannelData: rawData }),
  addChannel: (channel) => set((state) => ({
    channels: [...state.channels, channel]
  })),
  updateChannel: (number, updates) => set((state) => ({
    channels: state.channels.map(ch =>
      ch.number === number ? { ...ch, ...updates } : ch
    )
  })),
  deleteChannel: (number, options) => {
    useChannelsStore.getState().deleteChannels([number], options);
  },
  deleteChannels: (numbersToDelete, options = {}) => set((state) => {
    const toDeleteSet = new Set(numbersToDelete);
    if (options.keepNumbers) return deleteLeavingHoles(state, toDeleteSet);

    const zonesStore = useZonesStore.getState();
    const scanListsStore = useScanListsStore.getState();

    // Capture zones and scan lists once at start (before we change anything)
    const zonesSnapshot = zonesStore.zones;
    const scanListsSnapshot = scanListsStore.scanLists;

    const remaining = state.channels.filter(ch => !toDeleteSet.has(ch.number));
    if (remaining.length === 0) return { channels: [], rawChannelData: new Map() };

    // Build old channel number → new channel number (1..n). Every remaining channel shifts down.
    const sorted = [...remaining].sort((a, b) => a.number - b.number);
    const oldToNew = new Map(sorted.map((ch, i) => [ch.number, i + 1]));
    const renumberedChannels = sorted.map((ch, i) => ({ ...ch, number: i + 1 }));

    /** For any list of channel numbers: drop deleted, then map to new 1..n. */
    const toFinalChannels = (channelNumbers: number[]): number[] =>
      channelNumbers
        .filter(n => !toDeleteSet.has(n))
        .map(n => oldToNew.get(n))
        .filter((n): n is number => n !== undefined);

    /** Map a single channel ref (for priority/designated): new number or undefined if deleted */
    const mapOne = (ch: number | undefined): number | undefined =>
      ch === undefined ? undefined : toDeleteSet.has(ch) ? undefined : oldToNew.get(ch);

    // Apply new channel numbers to every zone (one atomic set so no update is lost)
    const newZones = zonesSnapshot.map((zone) => ({
      ...zone,
      channels: toFinalChannels(zone.channels),
    }));

    zonesStore.setZones(newZones);

    // Apply to every scan list (one atomic set)
    const newScanLists = scanListsSnapshot.map((scanList) => ({
      ...scanList,
      channels: toFinalChannels(scanList.channels),
      priorityChannel1: mapOne(scanList.priorityChannel1),
      priorityChannel2: mapOne(scanList.priorityChannel2),
      designatedTxChannel: mapOne(scanList.designatedTxChannel),
    }));
    scanListsStore.setScanLists(newScanLists);
    const newRawChannelData = new Map<number, RawChannelData>();
    for (let i = 0; i < sorted.length; i++) {
      const oldNum = sorted[i].number;
      const newNum = i + 1;
      const raw = state.rawChannelData.get(oldNum);
      if (raw) newRawChannelData.set(newNum, raw);
    }

    return { channels: renumberedChannels, rawChannelData: newRawChannelData };
  }),
  setSelectedChannel: (number) => set({ selectedChannel: number }),
}));
