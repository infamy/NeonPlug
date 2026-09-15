import React, { useState, useMemo, useCallback } from 'react';
import { formatPlural } from '../../utils/formatPlural';
import { useChannelsStore } from '../../store/channelsStore';
import { useRadioSettingsStore } from '../../store/radioSettingsStore';
import { useRadioCapabilities } from '../../hooks/useRadioCapabilities';
import { useOutOfBandActive } from '../../hooks/useOutOfBandActive';
import { ChannelsTable } from './ChannelsTable';
import { createDefaultChannel } from '../../utils/channelHelpers';
import { ConfirmModal } from '../ui/ConfirmModal';
import { CsvExportImportButtons } from '../ui/CsvExportImportButtons';
import { useAlert } from '../../hooks/useAlert';
import { useCsvImport } from '../../hooks/useCsvImport';
import { exportChannelsToCSV, importChannelsFromCSV, downloadCSV } from '../../services/csv';
import { addChannels } from '../../services/csv/importModes';
import { checkChannelLimits } from '../../services/csv/importLimits';
import { nothingImportedMessage } from '../../services/csv/importProblems';
import type { Channel } from '../../models/Channel';

import { isVFOChannel } from '../../utils/vfoChannels';
import { useRadioStore } from '../../store/radioStore';
import { BroadcastChannelsTable } from './BroadcastChannelsTable';
import { D890_BROADCAST } from '../../radios/d890uv/broadcastChannels';
import { PageHeader } from '../ui/PageHeader';
import { BUTTON, FIELD } from '../ui/controlStyles';
import {
  channelsLabel,
  recordChannelEdit,
  redoChannelEdit,
  undoChannelEdit,
  useChannelHistoryStore,
} from '../../services/channelHistory';
import { describeChannelDelete } from '../../services/channelDelete';
import { REDO_SHORTCUT, UNDO_SHORTCUT, useChannelUndoShortcuts } from '../../hooks/useChannelUndoShortcuts';
import { ChannelUndoNotice } from './ChannelUndoNotice';
import { useChannelWriteRule } from '../../hooks/useChannelWriteRule';
import { isChannelWritable } from '../../services/validation/writeFilter';
import { MOD_KEY } from '../../utils/keyboardTargets';
import { useZonesStore } from '../../store/zonesStore';
import { CHANNEL_SEARCH_HELP, matchesChannelSearch, parseChannelSearch } from './channelSearch';

/** Which channel table the tab is showing. */
type ChannelView = 'main' | 'am' | 'fm';

export const ChannelsTab: React.FC = () => {
  const { channels, addChannel, deleteChannels, setChannels } = useChannelsStore();
  const { settings: radioSettings } = useRadioSettingsStore();
  const { caps } = useRadioCapabilities();
  const outOfBand = useOutOfBandActive();
  const supportsVfoChannels = caps?.supportsVfoChannels === true;
  const zones = useZonesStore((s) => s.zones);
  const [searchQuery, setSearchQuery] = useState('');
  const [scrollToChannel, setScrollToChannel] = useState<number | null>(null);
  const [selectedChannelNumbers, setSelectedChannelNumbers] = useState<Set<number>>(new Set());
  const [view, setView] = useState<ChannelView>('main');
  const [onlyUnwritable, setOnlyUnwritable] = useState(false);

  // AM airband and FM broadcast are separate tables on the radio, not rows in
  // the main list — shown as sibling views so they keep channel-list room
  // without pretending to be channel numbers.
  const { tables } = useRadioStore();
  // The FM VFO is the 101st memory — outside the numbered table, so it is
  // appended rather than sorted in, and only for the FM view.
  const broadcast =
    view === 'am'
      ? tables.broadcast?.am
      : view === 'fm'
        ? tables.broadcast?.fm
        : undefined;
  const isBroadcast = view !== 'main';
  const undoLabel = useChannelHistoryStore((s) => s.past[s.past.length - 1]?.label);
  const redoLabel = useChannelHistoryStore((s) => s.future[s.future.length - 1]?.label);
  // Undo and redo can renumber channels, and a selection is by number, so it would
  // afterwards name other channels. They clear it.
  const clearSelection = useCallback(() => setSelectedChannelNumbers(new Set()), []);
  useChannelUndoShortcuts(!isBroadcast, clearSelection);

  // Channels a write leaves out, by the rule this radio's write uses.
  const writeRule = useChannelWriteRule();
  const unwritable = useMemo(
    () => new Set(channels.filter((ch) => ch.rxFrequency > 0 && !isChannelWritable(ch, writeRule)).map((ch) => ch.number)),
    [channels, writeRule]
  );
  const showingUnwritable = onlyUnwritable && unwritable.size > 0;

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

  const { alertOpen, alertMessage, alertTitle, showAlert, closeAlert } = useAlert('Full CSV Export/Import');
  const { startImport, csvImportDialog } = useCsvImport();

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
    
    recordChannelEdit(`add ${channelsLabel([nextNumber])}`, () => addChannel(newChannel));
    
    // Scroll to the new channel after adding
    setScrollToChannel(nextNumber);
  };

  const handleScrollComplete = useCallback(() => {
    setScrollToChannel(null);
  }, []);

  const selectedCount = selectedChannelNumbers.size;
  const [pendingDelete, setPendingDelete] = useState<{ numbers: number[]; message: string } | null>(null);


  // Full-fidelity CSV export/import (all channel modes and fields) — distinct from the
  // Smart Import wizard's CHIRP export (analog-only): this round-trips the whole channel
  // list. Importing asks whether to add the file's channels or replace the list with them.
  const handleExportChannelsCsv = useCallback(() => {
    downloadCSV(exportChannelsToCSV(channels), 'channels.csv');
  }, [channels]);

  const handleImportChannelsFile = useCallback((file: File) => {
    file.text().then(content => {
      const result = importChannelsFromCSV(content);
      // Rows that can't be read are left out and named; only a file with
      // nothing readable stops here.
      if (!result.channels || result.channels.length === 0) {
        showAlert(nothingImportedMessage(result.errors), 'Import failed');
        return;
      }
      const imported = result.channels;
      startImport({
        noun: 'channel',
        existing: channels,
        imported,
        problems: result.errors,
        add: () => addChannels(channels, imported),
        check: (list) => checkChannelLimits(list, caps),
        apply: (list, mode) => {
          const added = list.length - channels.length;
          recordChannelEdit(
            mode === 'replace' ? 'replace the channels from a CSV file' : 'add channels from a CSV file',
            () => setChannels(list),
            {
              announce:
                mode === 'replace'
                  ? `Replaced the channels with the file's ${list.length}.`
                  : `Added ${added} ${formatPlural(added, 'channel')} from the file.`,
            }
          );
        },
      });
    }).catch(err => {
      showAlert(err instanceof Error ? err.message : 'Failed to read CSV file', 'Import failed');
    });
  }, [showAlert, startImport, channels, caps, setChannels]);

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

  const search = useMemo(() => parseChannelSearch(searchQuery), [searchQuery]);
  const zonesByChannel = useMemo(() => {
    const byChannel = new Map<number, string[]>();
    for (const zone of zones) {
      for (const n of zone.channels) {
        const names = byChannel.get(n);
        if (names) names.push(zone.name);
        else byChannel.set(n, [zone.name]);
      }
    }
    return byChannel;
  }, [zones]);

  const filteredChannels = useMemo(() => {
    // Exclude empty channels (rxFrequency 0 = unprogrammed slot)
    const nonEmptyChannels = channels.filter(ch => ch.rxFrequency > 0);
    const allChannels = showingUnwritable
      ? nonEmptyChannels.filter(ch => unwritable.has(ch.number))
      : [...vfoChannels, ...nonEmptyChannels];
    if (search.terms.length === 0) return allChannels;
    const context = { zonesByChannel, bandLimits: caps?.bandLimits };
    return allChannels.filter(channel => matchesChannelSearch(channel, search, context));
  }, [channels, vfoChannels, search, zonesByChannel, caps, showingUnwritable, unwritable]);

  const handleDeleteSelectedClick = () => {
    const toDelete = Array.from(selectedChannelNumbers).filter(n => !isVFOChannel(n));
    if (toDelete.length === 0) {
      setSelectedChannelNumbers(new Set());
      return;
    }
    // A selection outlives a search, so it can hold rows the search now hides.
    const shown = new Set(filteredChannels.map(ch => ch.number));
    const hidden = toDelete.filter(n => !shown.has(n)).length;
    const effect = describeChannelDelete(channels, toDelete, hidden);
    setPendingDelete({
      numbers: toDelete,
      message: `Delete ${channelsLabel(toDelete)}?${effect ? `\n\n${effect}` : ''}`,
    });
  };

  const handleDeleteSelectedConfirm = () => {
    if (!pendingDelete) return;
    const label = channelsLabel(pendingDelete.numbers);
    recordChannelEdit(`delete ${label}`, () => deleteChannels(pendingDelete.numbers), {
      announce: `Deleted ${label}.`,
    });
    setSelectedChannelNumbers(new Set());
  };

  // "12 of 312 channels" while a search or the won't-be-written filter hides some.
  const totalChannels = channels.filter(ch => ch.rxFrequency > 0).length;
  const shownChannels = filteredChannels.filter(ch => !isVFOChannel(ch.number)).length;
  const shownVfos = filteredChannels.length - shownChannels;
  const channelCountLabel =
    (shownChannels === totalChannels
      ? `${totalChannels} ${formatPlural(totalChannels, 'channel')}`
      : `${shownChannels} of ${totalChannels} ${formatPlural(totalChannels, 'channel')}`) +
    (shownVfos > 0 ? ` (${shownVfos} ${formatPlural(shownVfos, 'VFO')})` : '');

  return (
    <div className="h-full flex flex-col min-h-0">
      <PageHeader
        title="Channels"
        actions={<>
          {tables.broadcast && (
            <div className="flex items-center gap-1">
              {([
                ['main', 'Main', channels.length],
                ['am', 'AM Airband', tables.broadcast.am.length],
                ['fm', 'FM Broadcast', tables.broadcast.fm.length],
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
          <div>
            {isBroadcast
              ? `${filteredBroadcast.length} ${formatPlural(filteredBroadcast.length, 'channel')}`
              : channelCountLabel}
          </div>
          {!isBroadcast && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  if (undoChannelEdit() !== null) clearSelection();
                }}
                disabled={!undoLabel}
                className={`${BUTTON.subtle} px-2 py-1 text-xs border rounded`}
                title={undoLabel ? `Undo ${undoLabel} (${UNDO_SHORTCUT})` : 'Nothing to undo'}
                aria-label={undoLabel ? `Undo ${undoLabel}` : 'Undo'}
              >
                ↶
              </button>
              <button
                type="button"
                onClick={() => {
                  if (redoChannelEdit() !== null) clearSelection();
                }}
                disabled={!redoLabel}
                className={`${BUTTON.subtle} px-2 py-1 text-xs border rounded`}
                title={redoLabel ? `Redo ${redoLabel} (${REDO_SHORTCUT})` : 'Nothing to redo'}
                aria-label={redoLabel ? `Redo ${redoLabel}` : 'Redo'}
              >
                ↷
              </button>
            </div>
          )}
          {/* Add applies to the main list only: broadcast slots are fixed
              hardware positions, and nothing writes them back yet. */}
          {!isBroadcast && (
            <button
              onClick={handleAddChannel}
              className={`${BUTTON.subtle} px-2 py-1 text-xs border rounded`}
              title="Add new channel"
            >
              + Add
            </button>
          )}
          {!isBroadcast && (
            <CsvExportImportButtons
              label="channels"
              onExport={handleExportChannelsCsv}
              onImportFile={handleImportChannelsFile}
              exportDisabled={channels.length === 0}
            />
          )}
        </>}
      />
      {outOfBand && (
        <div
          role="alert"
          className="mb-3 shrink-0 rounded border-2 border-red-500 bg-red-900/30 px-4 py-2 text-sm font-semibold text-red-300"
        >
          ⚠ Out-of-band frequencies are ON. Channels aren't checked against the radio's bands, and a write keeps
          them as they are. Turn it off in About.
        </div>
      )}
      <div className="mb-3 flex items-center gap-3 shrink-0">
        <div className="relative flex-1 min-w-0">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              // A lone "#12" scrolls to channel 12 rather than filtering.
              const { jumpTo } = parseChannelSearch(e.target.value);
              if (!isBroadcast && jumpTo !== null && channels.some(ch => ch.number === jumpTo)) {
                setScrollToChannel(jumpTo);
              }
            }}
            placeholder={
              isBroadcast
                ? 'Search by name, frequency, number...'
                : 'Search name, number or frequency · #12 jumps · mode:dig zone:none'
            }
            title={isBroadcast ? undefined : CHANNEL_SEARCH_HELP}
            aria-label="Search channels"
            className={`${FIELD} w-full border rounded px-4 py-2 pl-10 text-sm`}
          />
          <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-cool-gray text-sm">
            🔍
          </span>
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className={`${BUTTON.ghost} absolute right-3 top-1/2 transform -translate-y-1/2 text-sm`}
              title="Clear search"
            >
              ×
            </button>
          )}
        </div>
        {!isBroadcast && unwritable.size > 0 && (
          <button
            type="button"
            onClick={() => setOnlyUnwritable(!showingUnwritable)}
            aria-pressed={showingUnwritable}
            className={`${BUTTON.danger} px-2 py-1.5 text-xs border rounded whitespace-nowrap shrink-0`}
            title={
              showingUnwritable
                ? 'Show every channel again'
                : "Show only the channels a write leaves out, because this radio can't hold them"
            }
          >
            {showingUnwritable ? 'Show all channels' : `⚠ ${unwritable.size} won't be written`}
          </button>
        )}
        {selectedCount > 0 && !isBroadcast ? (
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-cool-gray text-sm whitespace-nowrap">{selectedCount} selected</span>
            <button
              onClick={handleDeleteSelectedClick}
              className={`${BUTTON.danger} px-2 py-1.5 text-xs border rounded whitespace-nowrap`}
              title="Delete selected channels"
            >
              Delete ({selectedCount})
            </button>
            <button
              onClick={clearSelection}
              className={`${BUTTON.subtle} px-2 py-1.5 text-xs border rounded whitespace-nowrap`}
              title="Clear selection"
            >
              Clear
            </button>
          </div>
        ) : (
          !isBroadcast && (
            <p
              className="text-cool-gray text-xs shrink-0 whitespace-nowrap"
              title={`Click a row to select it, Shift+click for a range, ${MOD_KEY}+click to add or remove one, ${MOD_KEY}+A for every channel shown. Then Delete to delete, Enter to edit one, Esc to clear.`}
            >
              Shift or {MOD_KEY}+click to select more
            </p>
          )
        )}
      </div>
      <div className="flex-1 min-h-0">
        {isBroadcast ? (
          <BroadcastChannelsTable
            entries={filteredBroadcast}
            band={view === 'am' ? 'am' : 'fm'}
            maxChannels={D890_BROADCAST[view === 'am' ? 'am' : 'fm'].channels}
            decimals={view === 'am' ? 4 : 2}
            vfo={view === 'am' ? tables.broadcast?.amVfo : tables.broadcast?.fmVfo}
            zones={view === 'am' ? tables.amZones ?? undefined : undefined}
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
          onRequestDelete={handleDeleteSelectedClick}
        />
        )}
      </div>
      <ConfirmModal
        isOpen={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={handleDeleteSelectedConfirm}
        title={pendingDelete?.numbers.length === 1 ? 'Delete channel' : 'Delete channels'}
        message={pendingDelete?.message}
        confirmLabel="Delete"
        variant="danger"
      />
      <ChannelUndoNotice onUndo={clearSelection} />
      {csvImportDialog}
      <ConfirmModal
        isOpen={alertOpen}
        onClose={closeAlert}
        title={alertTitle}
        message={alertMessage}
        confirmLabel="OK"
        variant="alert"
      />
    </div>
  );
};

