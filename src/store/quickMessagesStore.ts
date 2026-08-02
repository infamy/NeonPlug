import { create } from 'zustand';
import type { QuickTextMessage } from '../models/QuickTextMessage';

export interface RawQuickMessageData {
  data: Uint8Array;
  messageIndex: number;
  offset: number;
}

interface QuickMessagesState {
  messages: QuickTextMessage[];
  rawMessageData: Map<number, RawQuickMessageData>; // Store raw data for debug export
  messagesLoaded: boolean;
  setMessages: (messages: QuickTextMessage[]) => void;
  setRawMessageData: (rawData: Map<number, RawQuickMessageData>) => void;
  addMessage: (message: QuickTextMessage) => void;
  updateMessage: (index: number, message: Partial<QuickTextMessage>) => void;
  deleteMessage: (index: number) => void;
  setMessagesLoaded: (loaded: boolean) => void;
}

export const useQuickMessagesStore = create<QuickMessagesState>((set) => ({
  messages: [],
  rawMessageData: new Map(),
  messagesLoaded: false,
  // Normalize .index to array position — the encoder (encodeQuickMessages)
  // places messages by array order, so position is the canonical identity.
  setMessages: (messages) => set({
    messages: messages.map((m, i) => ({ ...m, index: i })),
    messagesLoaded: true,
  }),
  setRawMessageData: (rawData) => set({ rawMessageData: rawData }),
  addMessage: (message) => set((state) => ({
    messages: [...state.messages, { ...message, index: state.messages.length }]
  })),
  updateMessage: (index, updates) => set((state) => ({
    messages: state.messages.map((m, i) => 
      i === index ? { ...m, ...updates } : m
    )
  })),
  deleteMessage: (index) => set((state) => {
    const filtered = state.messages.filter((_, i) => i !== index);
    // Re-index remaining messages to match their array positions
    const reindexed = filtered.map((msg, i) => ({
      ...msg,
      index: i,
    }));
    return { messages: reindexed };
  }),
  setMessagesLoaded: (loaded) => set({ messagesLoaded: loaded }),
}));

