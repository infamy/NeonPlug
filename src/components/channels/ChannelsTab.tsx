import React, { useState, useMemo, useCallback, useRef } from 'react';
import { formatPlural } from '../../utils/formatPlural';
import { useChannelsStore } from '../../store/channelsStore';
import { useRadioSettingsStore } from '../../store/radioSettingsStore';
import { useRadioCapabilities } from '../../hooks/useRadioCapabilities';
import { ChannelsTable } from './ChannelsTable';
import { createDefaultChannel } from '../../utils/channelHelpers';
import { ConfirmModal } from '../ui/ConfirmModal';
import type { Channel } from '../../models/Channel';

import { isVFOChannel } from '../../utils/vfoChannels';
import { useRadioStore } from '../../store/radioStore';
import { BroadcastChannelsTable } from './BroadcastChannelsTable';

/** Which channel table the tab is showing. */
type ChannelView = 'main' | 'am' | 'fm';

export const ChannelsTab: React.FC = () => {
  const { channels, addChannel, deleteChannels } = useChannelsStore();
  const { settings: radioSettings } = useRadioSettingsStore();
  const { caps } = useRadioCapabilities();
  const supportsVfoChannels = caps?.supportsVfoChannels === true;
  const [searchQuery, setSearchQuery] = useState('');
  const [scrollToChannel, setScrollToChannel] = useState<number | null>(null);
  const [selectedChannelNumbers, setSelectedChannelNumbers] = useState<Set<number>>(new Set());
  const [view, setView] = useState<ChannelView>('main');

  // AM airband and FM broadcast are separate tables on the radio, not rows in
  // the main list — shown as sibling views so they keep channel-list room
  // without pretending to be channel numbers.
  const { d890Broadcast, d890AmZones } = useRadioStore();
  // The FM VFO is the 101st memory — outside the numbered table, so it is
  // appended rather than sorted in, and only for the FM view.
  const broadcast =
    view === 'am'
      ? d890Broadcast?.am
      : view === 'fm'
        ? [...(d890Broadcast?.fm ?? []), ...(d890Broadcast?.fmVfo ? [d890Broadcast.fmVfo] : [])]
        : undefined;
  const isBroadcast = view !== 'main';

  const filteredBroadcast = useMemo(() => {
    if (!broadcast) return [];
    const query = searchQuery.toLowerCase().trim();
    if (!query) return broadcast;
    return broadcast.filter(
      (ch) =>
        ch.name.toLowerCase().includes(query) ||
        (ch.frequency !== null && ch.frequency.toFixed(4).includes(query)) ||
        String(ch.index + 1).includes(query)
    );
  }, [broadcast, searchQuery]);

  const handleAddChannel = () => {
    // Find the next available channel number
    const existingNumbers = new Set(channels.map(ch => ch.number));
    let nextNumber = 1;
    while (existingNumbers.has(nextNumber)) {
      nextNumber++;
    }
    
    // Create a new channel with defaults
    const newChannel = createDefaultChannel({
      number: nextNumber,
      name: `Channel ${nextNumber}`,
    });
    
    addChannel(newChannel);
    
    // Scroll to the new channel after adding
    setScrollToChannel(nextNumber);
  };

  const handleScrollComplete = useCallback(() => {
    setScrollToChannel(null);
  }, []);

  const selectedCount = selectedChannelNumbers.size;
  const [deleteSelectedOpen, setDeleteSelectedOpen] = useState(false);
  const [pendingDeleteCount, setPendingDeleteCount] = useState(0);
  const pendingDeleteNumbers = useRef<number[]>([]);
  const handleDeleteSelectedClick = useCallback(() => {
    const toDelete = Array.from(selectedChannelNumbers).filter(n => !isVFOChannel(n));
    if (toDelete.length === 0) {
      setSelectedChannelNumbers(new Set());
      return;
    }
    pendingDeleteNumbers.current = toDelete;
    setPendingDeleteCount(toDelete.length);
    setDeleteSelectedOpen(true);
  }, [selectedChannelNumbers]);
  const handleDeleteSelectedConfirm = useCallback(() => {
    const toDelete = pendingDeleteNumbers.current;
    if (toDelete.length > 0) {
      deleteChannels(toDelete);
      setSelectedChannelNumbers(new Set());
    }
    setDeleteSelectedOpen(false);
  }, [deleteChannels]);

  const handleClearSelection = useCallback(() => setSelectedChannelNumbers(new Set()), []);

  // VFO A/B as channels 4001/4002 — DM-32 only; UV5R-Mini and other radios do not have these in the channel list
  const vfoChannels = useMemo(() => {
    if (!supportsVfoChannels) return [];
    const vfos: Channel[] = [];
    if (radioSettings?.vfoA) {
      vfos.push({ ...radioSettings.vfoA, number: 4001 }); // VFO A is channel 4001
    }
    if (radioSettings?.vfoB) {
      vfos.push({ ...radioSettings.vfoB, number: 4002 }); // VFO B is channel 4002
    }
    return vfos;
  }, [supportsVfoChannels, radioSettings?.vfoA, radioSettings?.vfoB]);

  const filteredChannels = useMemo(() => {
    // Exclude empty channels (rxFrequency 0 = unprogrammed slot)
    const nonEmptyChannels = channels.filter(ch => ch.rxFrequency > 0);
    const allChannels = [...vfoChannels, ...nonEmptyChannels];

    if (!searchQuery.trim()) {
      return allChannels;
    }

    const query = searchQuery.toLowerCase().trim();
    return allChannels.filter(channel => {
      // Search in name
      if (channel.name.toLowerCase().includes(query)) return true;
      
      // Search in frequencies
      const rxFreq = channel.rxFrequency.toFixed(4);
      const txFreq = channel.txFrequency.toFixed(4);
      if (rxFreq.includes(query) || txFreq.includes(query)) return true;
      
      // Search in mode
      if (channel.mode.toLowerCase().includes(query)) return true;
      
      // Search in channel number
      if (channel.number.toString().includes(query)) return true;
      
      // Search in bandwidth
      if (channel.bandwidth.toLowerCase().includes(query)) return true;
      
      // Search in power
      if (channel.power.toLowerCase().includes(query)) return true;
      
      // Search in CTCSS/DCS
      if (channel.rxCtcssDcs.type.toLowerCase().includes(query)) return true;
      if (channel.txCtcssDcs.type.toLowerCase().includes(query)) return true;
      if (channel.rxCtcssDcs.value?.toString().includes(query)) return true;
      if (channel.txCtcssDcs.value?.toString().includes(query)) return true;
      
      return false;
    });
  }, [channels, vfoChannels, searchQuery]);

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="mb-4 flex items-center justify-between shrink-0">
        <h2 className="text-2xl font-bold text-neon-cyan">Channels</h2>
        <div className="flex items-center gap-4">
          {d890Broadcast && (
            <div className="flex items-center gap-1">
              {([
                ['main', 'Main', channels.length],
                ['am', 'AM Airband', d890Broadcast.am.length],
                ['fm', 'FM Broadcast', d890Broadcast.fm.length],
              ] as const).map(([key, title, count]) => (
                <button
                  key={key}
                  onClick={() => setView(key)}
                  className={`px-3 py-1 text-xs rounded border transition-colors ${
                    view === key
                      ? 'bg-neon-cyan bg-opacity-20 border-neon-cyan text-neon-cyan'
                      : 'border-neon-cyan border-opacity-20 text-cool-gray hover:text-neon-cyan hover:border-opacity-50'
                  }`}
                >
                  {title} <span className="opacity-70">{count}</span>
                </button>
              ))}
            </div>
          )}
          <div className="text-cool-gray">
            {isBroadcast
              ? `${filteredBroadcast.length} ${formatPlural(filteredBroadcast.length, 'channel')}`
              : `${filteredChannels.length - vfoChannels.length} ${formatPlural(filteredChannels.length - vfoChannels.length, 'channel')}${vfoChannels.length > 0 ? ` (${vfoChannels.length} ${formatPlural(vfoChannels.length, 'VFO')})` : ''}`}
          </div>
          {/* Add applies to the main list only: broadcast slots are fixed
              hardware positions, and nothing writes them back yet. */}
          {!isBroadcast && (
            <button
              onClick={handleAddChannel}
              className="px-2 py-1 text-xs text-cool-gray hover:text-neon-cyan border border-neon-cyan border-opacity-20 hover:border-opacity-50 rounded transition-colors focus:outline-none"
              title="Add new channel"
            >
              + Add
            </button>
          )}
        </div>
      </div>
      <div className="mb-3 flex items-center gap-3 shrink-0">
        <div className="relative flex-1 min-w-0">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={isBroadcast ? 'Search by name, frequency, number...' : 'Search channels by name, frequency, mode, number...'}
            className="w-full bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-4 py-2 pl-10 text-white text-sm focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan"
          />
          <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-cool-gray text-sm">
            🔍
          </span>
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-cool-gray hover:text-white text-sm"
              title="Clear search"
            >
              ×
            </button>
          )}
        </div>
        {selectedCount > 0 && !isBroadcast ? (
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-cool-gray text-sm whitespace-nowrap">{selectedCount} selected</span>
            <button
              onClick={handleDeleteSelectedClick}
              className="px-2 py-1.5 text-xs text-red-400 hover:text-red-300 border border-red-600 border-opacity-30 hover:border-opacity-60 rounded transition-colors whitespace-nowrap"
              title="Delete selected channels"
            >
              Delete ({selectedCount})
            </button>
            <button
              onClick={handleClearSelection}
              className="px-2 py-1.5 text-xs text-cool-gray hover:text-neon-cyan border border-neon-cyan border-opacity-20 hover:border-opacity-50 rounded transition-colors whitespace-nowrap"
              title="Clear selection"
            >
              Clear
            </button>
          </div>
        ) : (
          !isBroadcast && (
            <p className="text-cool-gray text-xs shrink-0 whitespace-nowrap" title="Channel selection shortcuts">
              Click row = one · Shift+click = range · Alt+click = add/remove
            </p>
          )
        )}
      </div>
      <div className="flex-1 min-h-0">
        {isBroadcast ? (
          <BroadcastChannelsTable
            entries={filteredBroadcast}
            decimals={view === 'am' ? 4 : 2}
            vfoIndex={view === 'fm' ? d890Broadcast?.fmVfo?.index : undefined}
            zones={view === 'am' ? d890AmZones ?? undefined : undefined}
            emptyMessage={
              view === 'am' ? 'No AM airband memories stored' : 'No FM broadcast memories stored'
            }
          />
        ) : (
        <ChannelsTable
          channels={filteredChannels}
          scrollToChannel={scrollToChannel}
          onScrollComplete={handleScrollComplete}
          selectedChannelNumbers={selectedChannelNumbers}
          onSelectionChange={setSelectedChannelNumbers}
        />
        )}
      </div>
      <ConfirmModal
        isOpen={deleteSelectedOpen}
        onClose={() => setDeleteSelectedOpen(false)}
        onConfirm={handleDeleteSelectedConfirm}
        title="Delete channels"
        message={`Delete ${pendingDeleteCount} selected ${formatPlural(pendingDeleteCount, 'channel')}?`}
        confirmLabel="Delete"
        variant="danger"
      />
    </div>
  );
};

