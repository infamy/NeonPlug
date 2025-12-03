import { create } from 'zustand';
import type { Channel } from '../models/Channel';

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
  deleteChannel: (number) => set((state) => ({
    channels: state.channels.filter(ch => ch.number !== number)
  })),
  setSelectedChannel: (number) => set({ selectedChannel: number }),
}));

