import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useChannelsStore } from '../../store/channelsStore';
import { useRadioCapabilities } from '../../hooks/useRadioCapabilities';
import { useRadioSettingsStore } from '../../store/radioSettingsStore';
import { useScanListsStore } from '../../store/scanListsStore';
import { useRXGroupsStore } from '../../store/rxGroupsStore';
import { useEncryptionKeysStore } from '../../store/encryptionKeysStore';
import { useQuickContactsStore } from '../../store/quickContactsStore';
import { useDMRRadioIDsStore } from '../../store/dmrRadioIdsStore';
import { useAnalogEmergencyStore } from '../../store/analogEmergencyStore';
import type { Channel } from '../../models/Channel';
import { ChannelEditModal } from './ChannelEditModal';
import { ChannelRow, isVFOChannel, type CellChangeHandler } from './ChannelRow';
import { ConfirmModal } from '../ui/ConfirmModal';
import { Card } from '../ui/Card';
import { EmptyState } from '../ui/EmptyState';

interface ChannelsTableProps {
  channels?: Channel[];
  scrollToChannel?: number | null;  // Channel number to scroll to
  onScrollComplete?: () => void;    // Callback after scroll completes
  selectedChannelNumbers?: Set<number>;
  onSelectionChange?: (set: Set<number>) => void;
}

export const ChannelsTable: React.FC<ChannelsTableProps> = ({
  channels: channelsProp,
  scrollToChannel,
  onScrollComplete,
  selectedChannelNumbers: selectedChannelNumbersProp,
  onSelectionChange,
}) => {
  const { channels: channelsFromStore, updateChannel, deleteChannel, addChannel } = useChannelsStore();
  const { caps } = useRadioCapabilities();
  const { settings: radioSettings, updateSettings } = useRadioSettingsStore();
  const bandLimits = caps?.bandLimits ?? null;
  const maxChannels = caps?.maxChannels ?? 4000;
  const analogOnly = caps?.analogOnly === true;
  const { scanLists } = useScanListsStore();
  const { groups: rxGroups } = useRXGroupsStore();
  const { keys: encryptionKeys } = useEncryptionKeysStore();
  const { contacts: talkGroups } = useQuickContactsStore();
  const { systems: analogEmergencySystems } = useAnalogEmergencyStore();
  const { radioIds: dmrRadioIds } = useDMRRadioIDsStore();
  const channels = channelsProp ?? channelsFromStore;
  const [editingChannel, setEditingChannel] = useState<Channel | null>(null);
  const [channelToDelete, setChannelToDelete] = useState<Channel | null>(null);
  const [clonedChannelNumber, setClonedChannelNumber] = useState<number | null>(null);
  const [internalSelection, setInternalSelection] = useState<Set<number>>(new Set());
  const selectedChannelNumbers = selectedChannelNumbersProp ?? internalSelection;
  const setSelectedChannelNumbers = onSelectionChange ?? setInternalSelection;
  const rowRefs = useRef<Map<number, HTMLTableRowElement>>(new Map());
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // ChannelRow is memoized, so every callback it receives must be
  // referentially stable. Mutable values the callbacks need are mirrored into
  // refs instead of appearing in dependency arrays.
  const selectionRef = useRef(selectedChannelNumbers);
  selectionRef.current = selectedChannelNumbers;
  const setSelectionRef = useRef(setSelectedChannelNumbers);
  setSelectionRef.current = setSelectedChannelNumbers;
  const radioSettingsRef = useRef(radioSettings);
  radioSettingsRef.current = radioSettings;
  const anchorRef = useRef<number | null>(null);

  const selectableChannelNumbers = channels.filter(ch => !isVFOChannel(ch.number)).map(ch => ch.number);
  const someSelectableSelected = selectableChannelNumbers.some(n => selectedChannelNumbers.has(n));
  const selectableRef = useRef(selectableChannelNumbers);
  selectableRef.current = selectableChannelNumbers;

  const rowVirtualizer = useVirtualizer({
    count: channels.length,
    getScrollElement: () => scrollContainerRef.current,
    // Base row height; rows with stacked tone selects are measured dynamically.
    estimateSize: () => 41,
    overscan: 8,
    getItemKey: (index) => channels[index]?.number ?? index,
  });

  /** Scroll to a channel's row and flash-highlight it once it exists in the DOM. */
  const scrollAndHighlight = useCallback((channelNumber: number, onDone?: () => void) => {
    const index = channels.findIndex(ch => ch.number === channelNumber);
    if (index < 0) {
      onDone?.();
      return;
    }
    rowVirtualizer.scrollToIndex(index, { align: 'center' });
    let tries = 0;
    const tryHighlight = () => {
      const row = rowRefs.current.get(channelNumber);
      if (row) {
        row.classList.add('bg-neon-cyan', 'bg-opacity-20');
        setTimeout(() => {
          row.classList.remove('bg-neon-cyan', 'bg-opacity-20');
          onDone?.();
        }, 1000);
      } else if (++tries < 30) {
        requestAnimationFrame(tryHighlight);
      } else {
        onDone?.();
      }
    };
    requestAnimationFrame(tryHighlight);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channels]);

  // Scroll to channel when scrollToChannel changes
  useEffect(() => {
    if (scrollToChannel !== null && scrollToChannel !== undefined) {
      scrollAndHighlight(scrollToChannel, onScrollComplete);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollToChannel]);

  // Scroll to a freshly cloned channel
  useEffect(() => {
    if (clonedChannelNumber !== null) {
      scrollAndHighlight(clonedChannelNumber, () => setClonedChannelNumber(null));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clonedChannelNumber]);

  const handleCellChange: CellChangeHandler = useCallback((channelNumber, field, value) => {
    const selected = selectionRef.current;
    const applyToNumbers = selected.size > 0 && selected.has(channelNumber)
      ? Array.from(selected)
      : [channelNumber];

    const settings = radioSettingsRef.current;
    for (const num of applyToNumbers) {
      if (num === 4001 && settings?.vfoA) {
        updateSettings({ vfoA: { ...settings.vfoA, [field]: value } });
        continue;
      }
      if (num === 4002 && settings?.vfoB) {
        updateSettings({ vfoB: { ...settings.vfoB, [field]: value } });
        continue;
      }
      updateChannel(num, { [field]: value });
    }
  }, [updateChannel, updateSettings]);

  /** Row click: plain = single select; Shift = range (e.g. 4,5,6,7,8); Alt = add/remove (random multi-select). Skip when clicking inputs/buttons. */
  const handleRowClick = useCallback((channelNumber: number, e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('input, button, select, [role="button"]')) return;
    if (isVFOChannel(channelNumber)) return;
    const selectable = selectableRef.current;
    const setSelection = setSelectionRef.current;
    if (e.shiftKey) {
      const anchor = anchorRef.current != null && selectable.includes(anchorRef.current)
        ? anchorRef.current
        : channelNumber;
      const fromIdx = selectable.indexOf(anchor);
      const toIdx = selectable.indexOf(channelNumber);
      if (fromIdx === -1 || toIdx === -1) {
        setSelection(new Set([channelNumber]));
        anchorRef.current = channelNumber;
        return;
      }
      const [lo, hi] = fromIdx <= toIdx ? [fromIdx, toIdx] : [toIdx, fromIdx];
      const range = new Set(selectable.slice(lo, hi + 1));
      range.add(channelNumber);
      setSelection(range);
    } else if (e.altKey) {
      const next = new Set(selectionRef.current);
      if (next.has(channelNumber)) next.delete(channelNumber);
      else next.add(channelNumber);
      setSelection(next);
      anchorRef.current = channelNumber;
    } else {
      setSelection(new Set([channelNumber]));
      anchorRef.current = channelNumber;
    }
  }, []);

  const clearSelection = () => {
    setSelectedChannelNumbers(new Set());
  };

  const handleEdit = useCallback((channel: Channel) => setEditingChannel(channel), []);
  const handleDelete = useCallback((channel: Channel) => setChannelToDelete(channel), []);

  const handleClone = useCallback((channel: Channel) => {
    // Find the next available channel number
    const existingNumbers = new Set(useChannelsStore.getState().channels.map(ch => ch.number));
    let nextNumber = 1;
    while (existingNumbers.has(nextNumber)) {
      nextNumber++;
    }

    // Clone the channel with new number and modified name
    const clonedChannel: Channel = {
      ...channel,
      number: nextNumber,
      name: channel.name.length > 12
        ? channel.name.substring(0, 12) + ' (C)'
        : channel.name + ' (C)',
    };

    addChannel(clonedChannel);
    setClonedChannelNumber(nextNumber);
  }, [addChannel]);

  const registerRowRef = useCallback((channelNumber: number, el: HTMLTableRowElement | null) => {
    if (el) rowRefs.current.set(channelNumber, el);
    else rowRefs.current.delete(channelNumber);
  }, []);

  if (channels.length === 0) {
    return (
      <Card>
        <EmptyState message="No channels loaded" secondary="Connect to a radio or import channels to get started" />
      </Card>
    );
  }

  const virtualItems = rowVirtualizer.getVirtualItems();
  const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0;
  const paddingBottom = virtualItems.length > 0
    ? rowVirtualizer.getTotalSize() - virtualItems[virtualItems.length - 1].end
    : 0;

  return (
    <Card className="h-full max-h-full flex flex-col" padding="none">
      <div className="flex-1 overflow-auto" ref={scrollContainerRef}>
        <div className="inline-block min-w-full">
          <table className="w-full border-collapse text-xs">
        <thead className="sticky top-0 z-20">
          <tr className="bg-dark-charcoal border-b border-neon-cyan">
            <th className="px-2 py-2 text-left text-neon-cyan font-bold sticky left-0 bg-dark-charcoal z-30 min-w-[28px] w-[28px]">
              <input
                type="checkbox"
                checked={someSelectableSelected}
                onChange={clearSelection}
                className="checkbox-theme"
                title="Clear selection"
              />
            </th>
            <th className="px-2 py-2 text-left text-neon-cyan font-bold sticky left-[28px] bg-dark-charcoal z-30 min-w-[40px]" title="Channel number">#</th>
            <th className="px-2 py-2 text-left text-neon-cyan font-bold sticky left-[68px] bg-dark-charcoal z-30 min-w-[120px]" title="Channel name">Name</th>
            <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[90px]" title="Receive frequency (MHz)">RX Freq</th>
            <th className="px-2 py-2 text-center text-neon-cyan font-bold w-0 min-w-0" title="Copy RX to TX"><span className="sr-only">Copy</span></th>
            <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[90px]" title="Transmit frequency (MHz)">TX Freq</th>
            {!analogOnly && (
              <th className="px-2 py-2 text-center text-neon-cyan font-bold min-w-[50px]" title="Channel mode (Analog/Digital)">Mode</th>
            )}
            <th className="px-2 py-2 text-center text-neon-cyan font-bold min-w-[40px]" title="Power level">PWR</th>
            <th className="px-2 py-2 text-center text-neon-cyan font-bold min-w-[40px]" title="Bandwidth (12.5 kHz / 25 kHz)">BW</th>
            {/* Common fields - work for both analog and digital */}
            <th className="px-2 py-2 text-center text-neon-cyan font-bold min-w-[35px]" title="Forbid transmit">Forbid TX</th>
            <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[75px]" title="Receive tone (CTCSS/DCS)">RX Tone</th>
            <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[75px]" title="Transmit tone (CTCSS/DCS)">TX Tone</th>
            <th className="px-2 py-2 text-center text-neon-cyan font-bold min-w-[30px]" title="Lone Worker">LW</th>
            <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[50px]" title="Scan list assignment">Scan List</th>
            <th className="px-2 py-2 text-center text-neon-cyan font-bold min-w-[35px]" title="Free to Air">FTA</th>
            <th className="px-2 py-2 text-center text-neon-cyan font-bold min-w-[35px]" title="Emergency">Emerg</th>
            <th className="px-2 py-2 text-center text-neon-cyan font-bold min-w-[35px]" title="Emergency acknowledge">Emerg Ack</th>
            <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[52px]" title="Emergency ID">Emerg ID</th>
            <th className="px-2 py-2 text-center text-neon-cyan font-bold min-w-[35px]" title="APRS receive">APRS RX</th>
            <th className="px-2 py-2 text-center text-neon-cyan font-bold min-w-[35px]" title="APRS transmit">APRS TX</th>
            <th className="px-2 py-2 text-center text-neon-cyan font-bold min-w-[35px]" title="Voice operated transmit">VOX</th>
            <th className="px-2 py-2 text-center text-neon-cyan font-bold min-w-[30px]" title="Scramble">SCR</th>
            <th className="px-2 py-2 text-center text-neon-cyan font-bold min-w-[30px]" title="Compander">CMP</th>
            <th className="px-2 py-2 text-center text-neon-cyan font-bold min-w-[30px]" title="Talkback">TB</th>
            <th className="px-2 py-2 text-center text-neon-cyan font-bold min-w-[30px]" title="Compander Dup">CMP DUP</th>
            <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[52px]" title="Squelch">SQL</th>
            <th className="px-2 py-2 text-center text-neon-cyan font-bold min-w-[35px]" title="PTT ID display">PTT ID Display</th>
            <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[48px]" title="PTT ID">PTT ID</th>
            <th className="px-2 py-2 text-center text-neon-cyan font-bold min-w-[35px]" title="VOX related">VOX Related</th>
            <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[100px]" title="Receive squelch mode">RX Squelch Mode</th>
            <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[70px]" title="Step frequency">Step Freq</th>
            <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[65px]" title="Signal type">Sig Type</th>
            <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[65px]" title="PTT ID type">PTT ID Type</th>
            {/* Digital-only fields - hidden for analog-only radios */}
            {!analogOnly && (
              <>
                <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[48px]" title="DMR color code">Color Code</th>
                <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[80px]" title="RX Group List">RX Group</th>
                <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[60px]" title="Slot Operation">Slot</th>
                <th className="px-2 py-2 text-center text-neon-cyan font-bold min-w-[35px]" title="Encryption">Enc</th>
                <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[60px]" title="Encryption ID">Enc ID</th>
                <th className="px-2 py-2 text-center text-neon-cyan font-bold min-w-[35px]" title="TDMA Direct Mode">TDMA</th>
                <th className="px-2 py-2 text-center text-neon-cyan font-bold min-w-[35px]" title="Short Data Confirm">SDC</th>
                <th className="px-2 py-2 text-center text-neon-cyan font-bold min-w-[35px]" title="Private Confirm">Priv</th>
                <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[100px]" title="DMR Radio ID Index for TX (0=None, 1-255=Index into DMR Radio IDs list)">TX DMR ID</th>
              </>
            )}
            {/* Common fields - work for both */}
            <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[100px]" title="TX Contact (Group/Private/All Call - index into Contacts list)">TG</th>
            <th className="px-2 py-2 text-center text-neon-cyan font-bold min-w-[60px] sticky right-0 bg-dark-charcoal z-30">Actions</th>
          </tr>
        </thead>
        <tbody>
          {paddingTop > 0 && (
            <tr aria-hidden="true">
              <td colSpan={50} style={{ height: paddingTop, padding: 0, border: 'none' }} />
            </tr>
          )}
          {virtualItems.map((virtualItem) => {
            const channel = channels[virtualItem.index];
            if (!channel) return null;
            return (
              <ChannelRow
                key={channel.number}
                channel={channel}
                isSelected={selectedChannelNumbers.has(channel.number)}
                analogOnly={analogOnly}
                scanLists={scanLists}
                rxGroups={rxGroups}
                encryptionKeys={encryptionKeys}
                talkGroups={talkGroups}
                dmrRadioIds={dmrRadioIds}
                dataIndex={virtualItem.index}
                onCellChange={handleCellChange}
                onRowClick={handleRowClick}
                onEdit={handleEdit}
                onClone={handleClone}
                onDelete={handleDelete}
                registerRef={registerRowRef}
                measureRef={rowVirtualizer.measureElement}
              />
            );
          })}
          {paddingBottom > 0 && (
            <tr aria-hidden="true">
              <td colSpan={50} style={{ height: paddingBottom, padding: 0, border: 'none' }} />
            </tr>
          )}
        </tbody>
      </table>
        </div>
      </div>
      {editingChannel && (
        <ChannelEditModal
          isOpen={!!editingChannel}
          onClose={() => setEditingChannel(null)}
          channel={editingChannel}
          onSave={(updatedChannel) => {
            updateChannel(updatedChannel.number, updatedChannel);
            setEditingChannel(null);
          }}
          bandLimits={bandLimits}
          maxChannels={maxChannels}
          analogOnly={analogOnly}
          rxGroups={rxGroups}
          encryptionKeys={encryptionKeys}
          talkGroups={talkGroups}
          analogEmergencySystems={analogEmergencySystems}
        />
      )}
      <ConfirmModal
        isOpen={!!channelToDelete}
        onClose={() => setChannelToDelete(null)}
        onConfirm={() => {
          if (channelToDelete) {
            deleteChannel(channelToDelete.number);
            setChannelToDelete(null);
          }
        }}
        title="Delete channel"
        message={channelToDelete ? `Delete channel ${channelToDelete.number}: "${channelToDelete.name}"?` : ''}
        confirmLabel="Delete"
        variant="danger"
      />
    </Card>
  );
};
