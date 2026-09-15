import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useChannelsStore } from '../../store/channelsStore';
import type { ChannelColumnGroup } from '../../types/radioCapabilities';
import { useRadioCapabilities } from '../../hooks/useRadioCapabilities';
import { useChannelWriteRule } from '../../hooks/useChannelWriteRule';
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
import { extraColumnsFor, extraColumnTitle, extraColumnMarker } from './extraChannelColumns';
import { ConfirmModal } from '../ui/ConfirmModal';
import { Card } from '../ui/Card';
import { channelsLabel, recordChannelEdit } from '../../services/channelHistory';
import { describeChannelDelete } from '../../services/channelDelete';
import { isNoTxFrequency, isRxInNoTxBand } from '../../services/validation/frequencyValidator';
import { selectByClick, type SelectionClick } from './channelSelection';
import { sortChannelsForView, type ChannelSort, type ChannelSortKey } from './channelSearch';

type SortState = 'ascending' | 'descending' | 'none';

/** A column heading that sorts the view. */
const SortButton: React.FC<{ label: string; state: SortState; onClick: () => void; title: string }> = ({
  label,
  state,
  onClick,
  title,
}) => (
  <button
    type="button"
    onClick={onClick}
    className="font-bold text-neon-cyan hover:text-neon-cyan-bright whitespace-nowrap"
    title={title}
  >
    {label}
    <span aria-hidden="true" className="ml-0.5">
      {state === 'ascending' ? '▲' : state === 'descending' ? '▼' : ''}
    </span>
  </button>
);
import { isDialogOpen, isInteractive, isTextEntry, MOD_KEY } from '../../utils/keyboardTargets';
import { EmptyState } from '../ui/EmptyState';

interface ChannelsTableProps {
  channels?: Channel[];
  scrollToChannel?: number | null;  // Channel number to scroll to
  onScrollComplete?: () => void;    // Callback after scroll completes
  selectedChannelNumbers?: Set<number>;
  onSelectionChange?: (set: Set<number>) => void;
  /** Delete or Backspace with channels selected: ask to delete them. */
  onRequestDelete?: () => void;
}

export const ChannelsTable: React.FC<ChannelsTableProps> = ({
  channels: channelsProp,
  scrollToChannel,
  onScrollComplete,
  selectedChannelNumbers: selectedChannelNumbersProp,
  onSelectionChange,
  onRequestDelete,
}) => {
  const { channels: channelsFromStore, updateChannel, deleteChannel, addChannel } = useChannelsStore();
  const { caps } = useRadioCapabilities();
  const { settings: radioSettings, updateSettings } = useRadioSettingsStore();
  // The rule this radio's write applies to channels. The grid marks cells by it
  // and the editor checks by it: no band errors while the hidden out-of-band
  // switch is on, and no RX band errors where the write keeps every channel.
  const writeRule = useChannelWriteRule();
  const bandLimits = writeRule.outOfBand ? null : (caps?.bandLimits ?? null);
  const maxChannels = caps?.maxChannels ?? 4000;
  const analogOnly = caps?.analogOnly === true;
  // Optional column groups: a radio shows one only if it declares it.
  const declared = new Set(caps?.channelColumns ?? []);
  const hasColumn = (g: ChannelColumnGroup) => declared.has(g);
  const { scanLists } = useScanListsStore();
  const { groups: rxGroups } = useRXGroupsStore();
  const { keys: encryptionKeys } = useEncryptionKeysStore();
  const { contacts: talkGroups } = useQuickContactsStore();
  const { systems: analogEmergencySystems } = useAnalogEmergencyStore();
  const { radioIds: dmrRadioIds } = useDMRRadioIDsStore();
  // Clicking a column heading sorts by it: up, down, then back to channel order.
  // Only the view changes; no channel is renumbered, so the radio's order stays.
  const [sort, setSort] = useState<ChannelSort | null>(null);
  const listed = channelsProp ?? channelsFromStore;
  // The order is worked out when a sort is chosen or channels come and go, not on
  // every edit: sorted by name, each keystroke used to move the row being typed
  // in, often out of view, taking the input and its focus with it.
  const membership = listed.map((ch) => ch.number).join(',');
  const order = useMemo(
    () => (sort ? sortChannelsForView(listed, sort, isVFOChannel).map((ch) => ch.number) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sort, membership]
  );
  const channels = useMemo(() => {
    if (!order) return listed;
    const byNumber = new Map(listed.map((ch) => [ch.number, ch]));
    return order.map((n) => byNumber.get(n)).filter((ch): ch is Channel => ch !== undefined);
  }, [listed, order]);
  const toggleSort = (key: ChannelSortKey) =>
    setSort((current) =>
      current?.key !== key ? { key, descending: false } : current.descending ? null : { key, descending: true }
    );
  const sortState = (key: ChannelSortKey): SortState =>
    sort?.key === key ? (sort.descending ? 'descending' : 'ascending') : 'none';
  const sortTitle = (what: string) => `${what}. Click to sort the view; channel numbers don't change.`;
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
  const allSelectableSelected =
    selectableChannelNumbers.length > 0 && selectableChannelNumbers.every(n => selectedChannelNumbers.has(n));
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
    const shown = channelsRef.current;
    const shownNumbers = new Set(shown.map((ch) => ch.number));
    // An edit to a selected row applies to the rest of the selection that is
    // shown, except a name, which belongs to one channel. Rows a search or a
    // filter is hiding are left alone.
    const applyToNumbers = field !== 'name' && selected.size > 0 && selected.has(channelNumber)
      ? Array.from(selected).filter((n) => shownNumbers.has(n))
      : [channelNumber];
    // A TX put onto other selected rows (Copy RX to TX, or typing one) skips a
    // receive-only row: its blank TX is what keeps the radio from transmitting.
    const byNumber = field === 'txFrequency' ? new Map(shown.map((ch) => [ch.number, ch])) : null;
    const targets = applyToNumbers.filter((n) => {
      const ch = n === channelNumber ? undefined : byNumber?.get(n);
      return !(ch && isRxInNoTxBand(ch.rxFrequency) && isNoTxFrequency(ch.txFrequency));
    });

    const settings = radioSettingsRef.current;
    recordChannelEdit(
      `edit ${channelsLabel(targets)}`,
      () => {
        for (const num of targets) {
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
      },
      // Typing into a cell is one step, not one per keystroke.
      { mergeKey: `${targets.join(',')}:${field}` }
    );
  }, [updateChannel, updateSettings]);

  const applyClick = useCallback((channelNumber: number, click: SelectionClick) => {
    const next = selectByClick(selectionRef.current, channelNumber, click, selectableRef.current, anchorRef.current);
    anchorRef.current = next.anchor;
    setSelectionRef.current(next.selected);
  }, []);

  /** Row click: plain = one; Shift = range; Cmd/Ctrl or Alt = add/remove. Clicks on the row's own controls don't select. */
  const handleRowClick = useCallback((channelNumber: number, e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('input, button, select, [role="button"]')) return;
    if (isVFOChannel(channelNumber)) return;
    applyClick(channelNumber, { shift: e.shiftKey, toggle: e.altKey || e.metaKey || e.ctrlKey });
  }, [applyClick]);

  /** A row's checkbox adds or removes that row; with Shift it selects a range. */
  const handleToggleSelect = useCallback((channelNumber: number, e: React.MouseEvent) => {
    applyClick(channelNumber, { shift: e.shiftKey, toggle: !e.shiftKey });
  }, [applyClick]);

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

    recordChannelEdit(`clone ${channelsLabel([channel.number])}`, () => addChannel(clonedChannel));
    setClonedChannelNumber(nextNumber);
  }, [addChannel]);

  const registerRowRef = useCallback((channelNumber: number, el: HTMLTableRowElement | null) => {
    if (el) rowRefs.current.set(channelNumber, el);
    else rowRefs.current.delete(channelNumber);
  }, []);

  const channelsRef = useRef(channels);
  channelsRef.current = channels;
  const onRequestDeleteRef = useRef(onRequestDelete);
  onRequestDeleteRef.current = onRequestDelete;

  // Keys for the selection, while no field has the keyboard and no dialog is
  // open: Cmd/Ctrl+A selects every shown channel, Escape clears, Delete asks to
  // delete the selection, and Enter opens the editor on a single selection.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || isTextEntry(e.target) || isDialogOpen()) return;
      const selected = selectionRef.current;
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        setSelectionRef.current(new Set(selectableRef.current));
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey || selected.size === 0) return;
      if (e.key === 'Escape') {
        setSelectionRef.current(new Set());
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        onRequestDeleteRef.current?.();
      } else if (e.key === 'Enter' && selected.size === 1 && !isInteractive(e.target)) {
        const [only] = selected;
        const channel = channelsRef.current.find((ch) => ch.number === only);
        if (channel) {
          e.preventDefault();
          setEditingChannel(channel);
        }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
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
                ref={(el) => {
                  if (el) el.indeterminate = someSelectableSelected && !allSelectableSelected;
                }}
                checked={allSelectableSelected}
                onChange={() =>
                  setSelectedChannelNumbers(allSelectableSelected ? new Set() : new Set(selectableChannelNumbers))
                }
                className="checkbox-theme"
                title={allSelectableSelected ? 'Clear selection' : `Select every channel shown (${MOD_KEY}+A)`}
                aria-label={allSelectableSelected ? 'Clear selection' : 'Select every channel shown'}
              />
            </th>
            <th className="px-2 py-2 text-left text-neon-cyan font-bold sticky left-[28px] bg-dark-charcoal z-30 min-w-[40px]" aria-sort={sortState('number')}>
              <SortButton label="#" state={sortState('number')} onClick={() => toggleSort('number')} title={sortTitle('Channel number')} />
            </th>
            <th className="px-2 py-2 text-left text-neon-cyan font-bold sticky left-[68px] bg-dark-charcoal z-30 min-w-[120px]" aria-sort={sortState('name')}>
              <SortButton label="Name" state={sortState('name')} onClick={() => toggleSort('name')} title={sortTitle('Channel name')} />
            </th>
            <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[90px]" aria-sort={sortState('rxFrequency')}>
              <SortButton label="RX Freq" state={sortState('rxFrequency')} onClick={() => toggleSort('rxFrequency')} title={sortTitle('Receive frequency (MHz)')} />
            </th>
            <th className="px-2 py-2 text-center text-neon-cyan font-bold w-0 min-w-0" title="Copy RX to TX"><span className="sr-only">Copy</span></th>
            <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[90px]" aria-sort={sortState('txFrequency')}>
              <SortButton label="TX Freq" state={sortState('txFrequency')} onClick={() => toggleSort('txFrequency')} title={sortTitle('Transmit frequency (MHz)')} />
            </th>
            {!analogOnly && (
              <th className="px-2 py-2 text-center text-neon-cyan font-bold min-w-[50px]" aria-sort={sortState('mode')}>
                <SortButton label="Mode" state={sortState('mode')} onClick={() => toggleSort('mode')} title={sortTitle('Channel mode (Analog/Digital)')} />
              </th>
            )}
            <th className="px-2 py-2 text-center text-neon-cyan font-bold min-w-[40px]" title="Power level">PWR</th>
            <th className="px-2 py-2 text-center text-neon-cyan font-bold min-w-[40px]" title="Bandwidth (12.5 kHz / 25 kHz)">BW</th>
            {/* Common fields - work for both analog and digital */}
            <th className="px-2 py-2 text-center text-neon-cyan font-bold min-w-[35px]" title="Forbid transmit">Forbid TX</th>
            <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[75px]" title="Receive tone (CTCSS/DCS)">RX Tone</th>
            <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[75px]" title="Transmit tone (CTCSS/DCS)">TX Tone</th>
            {hasColumn('loneWorker') && (<th className="px-2 py-2 text-center text-neon-cyan font-bold min-w-[30px]" title="Lone Worker">LW</th>)}
            <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[100px]" title="Scan list assignment">Scan List</th>
            {hasColumn('freeToAir') && (<th className="px-2 py-2 text-center text-neon-cyan font-bold min-w-[35px]" title="Forbid Talkaround">FTA</th>)}
            {hasColumn('emergency') && (<th className="px-2 py-2 text-center text-neon-cyan font-bold min-w-[35px]" title="Emergency">Emerg</th>)}
            {hasColumn('emergency') && (<th className="px-2 py-2 text-center text-neon-cyan font-bold min-w-[35px]" title="Emergency acknowledge">Emerg Ack</th>)}
            {hasColumn('emergency') && (<th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[52px]" title="Emergency ID">Emerg ID</th>)}
            {hasColumn('aprs') && (<th className="px-2 py-2 text-center text-neon-cyan font-bold min-w-[35px]" title="APRS receive">APRS RX</th>)}
            {hasColumn('aprs') && (<th className="px-2 py-2 text-center text-neon-cyan font-bold min-w-[35px]" title="APRS transmit">APRS TX</th>)}
            {hasColumn('vox') && (<th className="px-2 py-2 text-center text-neon-cyan font-bold min-w-[35px]" title="Voice operated transmit">VOX</th>)}
            {hasColumn('audioProcessing') && (<th className="px-2 py-2 text-center text-neon-cyan font-bold min-w-[30px]" title="Scramble">SCR</th>)}
            {hasColumn('audioProcessing') && (<th className="px-2 py-2 text-center text-neon-cyan font-bold min-w-[30px]" title="Compander">CMP</th>)}
            {hasColumn('audioProcessing') && (<th className="px-2 py-2 text-center text-neon-cyan font-bold min-w-[30px]" title="Talkback">TB</th>)}
            {hasColumn('audioProcessing') && (<th className="px-2 py-2 text-center text-neon-cyan font-bold min-w-[30px]" title="Compander Dup">CMP DUP</th>)}
            {hasColumn('squelch') && (<th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[52px]" title="Squelch">SQL</th>)}
            {hasColumn('pttId') && (<th className="px-2 py-2 text-center text-neon-cyan font-bold min-w-[35px]" title="PTT ID display">PTT ID Display</th>)}
            {hasColumn('pttId') && (<th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[48px]" title="PTT ID">PTT ID</th>)}
            {hasColumn('vox') && (<th className="px-2 py-2 text-center text-neon-cyan font-bold min-w-[35px]" title="VOX related">VOX Related</th>)}
            {hasColumn('squelch') && (<th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[100px]" title="Receive squelch mode">RX Squelch Mode</th>)}
            {hasColumn('stepFrequency') && (<th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[70px]" title="Step frequency">Step Freq</th>)}
            {hasColumn('signalType') && (<th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[65px]" title="Signal type">Sig Type</th>)}
            {hasColumn('pttId') && (<th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[65px]" title="PTT ID type">PTT ID Type</th>)}
            {/* Digital-only fields - hidden for analog-only radios */}
            {!analogOnly && (
              <>
                <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[48px]" title="DMR color code">Color Code</th>
                <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[80px]" title="RX Group List">RX Group</th>
                <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[60px]" title="Slot Operation">Slot</th>
                {hasColumn('encryption') && (<th className="px-2 py-2 text-center text-neon-cyan font-bold min-w-[35px]" title="Encryption">Enc</th>)}
                {hasColumn('encryption') && (<th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[60px]" title="Encryption ID">Enc ID</th>)}
                {hasColumn('tdma') && (<th className="px-2 py-2 text-center text-neon-cyan font-bold min-w-[35px]" title="TDMA Direct Mode">TDMA</th>)}
                {hasColumn('confirmations') && (<th className="px-2 py-2 text-center text-neon-cyan font-bold min-w-[35px]" title="Short Data Confirm">SDC</th>)}
                {hasColumn('confirmations') && (<th className="px-2 py-2 text-center text-neon-cyan font-bold min-w-[35px]" title="Private Confirm">Priv</th>)}
                <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[100px]" title="DMR Radio ID Index for TX (0=None, 1-255=Index into DMR Radio IDs list)">TX DMR ID</th>
              </>
            )}
            {/* Radio-specific extras, rendered from EXTRA_CHANNEL_COLUMNS so the
                header and the cell cannot get out of step. A trailing * marks a
                field whose byte offset is known but whose value range has not
                been confirmed on hardware — hover for the detail. */}
            {extraColumnsFor(declared).map((c) => (
              <th
                key={c.field}
                className={`px-2 py-2 text-neon-cyan font-bold ${
                  c.editor.kind === 'boolean' ? 'text-center min-w-[45px]' : 'text-left min-w-[70px]'
                }`}
                title={extraColumnTitle(c)}
              >
                {c.header}
                {extraColumnMarker(c)}
              </th>
            ))}
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
                writeRule={writeRule}
                dataIndex={virtualItem.index}
                onCellChange={handleCellChange}
                onRowClick={handleRowClick}
                onToggleSelect={handleToggleSelect}
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
            recordChannelEdit(`edit ${channelsLabel([updatedChannel.number])}`, () =>
              updateChannel(updatedChannel.number, updatedChannel)
            );
            setEditingChannel(null);
          }}
          bandLimits={bandLimits}
          checkRxBand={writeRule.filterBand}
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
            const label = channelsLabel([channelToDelete.number]);
            recordChannelEdit(`delete ${label}`, () => deleteChannel(channelToDelete.number), {
              announce: `Deleted ${label}${channelToDelete.name ? ` (${channelToDelete.name})` : ''}.`,
            });
            // Later channels were renumbered, so a selection by number would now name other channels.
            setSelectedChannelNumbers(new Set());
            setChannelToDelete(null);
          }
        }}
        title="Delete channel"
        message={
          channelToDelete
            ? [
                `Delete channel ${channelToDelete.number}: "${channelToDelete.name}"?`,
                describeChannelDelete(channelsFromStore, [channelToDelete.number]),
              ]
                .filter(Boolean)
                .join('\n\n')
            : ''
        }
        confirmLabel="Delete"
        variant="danger"
      />
    </Card>
  );
};
