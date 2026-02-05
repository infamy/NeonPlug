import { create } from 'zustand';
import type { Channel } from '../models/Channel';
import { useZonesStore } from './zonesStore';
import { useScanListsStore } from './scanListsStore';

export interface RawChannelData {
  data: Uint8Array;
  blockAddr: number;
  offset: number;
}

interface ChannelsState {
  channels: Channel[];
  selectedChannel: number | null;
  rawChannelData: Map<number, RawChannelData>; // Store raw data for debug export
  setChannels: (channels: Channel[]) => void;
  setRawChannelData: (rawData: Map<number, RawChannelData>) => void;
  addChannel: (channel: Channel) => void;
  updateChannel: (number: number, channel: Partial<Channel>) => void;
  deleteChannel: (number: number) => void;
  /** Remove multiple channels at once and renumber; use for bulk delete so renumbering doesn't invalidate later numbers */
  deleteChannels: (numbers: number[]) => void;
  setSelectedChannel: (number: number | null) => void;
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
  deleteChannel: (number) => {
    useChannelsStore.getState().deleteChannels([number]);
  },
  deleteChannels: (numbersToDelete) => set((state) => {
    const toDeleteSet = new Set(numbersToDelete);
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

