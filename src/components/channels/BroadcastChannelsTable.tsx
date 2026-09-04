import React, { useState } from 'react';
import { Card } from '../ui/Card';
import { EmptyState } from '../ui/EmptyState';
import { useRadioStore } from '../../store/radioStore';
import { deleteBroadcastChannels } from '../../radios/d890uv/broadcastEdits';
import type { D890BroadcastChannel } from '../../radios/d890uv/broadcastChannels';
import { AmZonesEditor } from './AmZonesEditor';

/**
 * AM airband / FM broadcast memories.
 *
 * A separate table from the main channel list on the radio — these do not use
 * channel numbers and cannot be put in a zone — which is why this is a sibling
 * view of the channel table rather than rows inside it.
 *
 * Receive only: the radio has no transmitter for either band, so there is no
 * power, tone, bandwidth or TX column to show.
 */
export const BroadcastChannelsTable: React.FC<{
  entries: D890BroadcastChannel[];
  /** AM needs 4 decimals for 25 kHz airband spacing; FM only 2. */
  decimals: number;
  emptyMessage: string;
  /**
   * AM zones, shown above the channels. A separate zone system from the main
   * one — its members are AM channel INDICES, so they are resolved against this
   * table rather than against channel numbers.
   */
  /** Present (even if empty) when this band has zones — AM does, FM does not. */
  zones?: unknown[];
  /** Which table in `tables.broadcast` these rows belong to. */
  band: 'am' | 'fm';
  /**
   * The band's own tuning record — what the receiver is on in VFO mode.
   *
   * Shown ABOVE the memories rather than as a row among them: it has no
   * presence-mask bit, cannot be added to a zone, and cannot be deleted, so
   * listing it as a numbered memory implies a slot that does not exist.
   */
  vfo?: D890BroadcastChannel | null;
  /** Slots the radio has for this band — 256 AM, 100 FM. */
  maxChannels: number;
}> = ({ entries, decimals, emptyMessage, zones, band, maxChannels, vfo }) => {
  const { tables, setTable } = useRadioStore();
  const broadcast = tables.broadcast;
  const [selected, setSelected] = useState<Set<number>>(new Set());

  // Mutate the STORE's list, never `entries` — that prop is the search-filtered
  // view, and rebuilding the table from it would delete every row the filter
  // happens to be hiding.
  const all = broadcast?.[band] ?? [];

  const commit = (next: D890BroadcastChannel[]) => {
    if (!broadcast) return;
    setTable('broadcast', {
      ...broadcast,
      [band]: [...next].sort((a, b) => a.index - b.index),
    });
  };

  const patch = (index: number, fields: Partial<D890BroadcastChannel>) =>
    commit(all.map((c) => (c.index === index ? { ...c, ...fields } : c)));

  const addChannel = () => {
    // Lowest free slot, not `length`. The list is kept compact so these are the
    // same number in practice, but the record's address is derived from its
    // index, so a gap must never be skipped over.
    const used = new Set(all.map((c) => c.index));
    let index = 0;
    while (used.has(index)) index += 1;
    if (index >= maxChannels) return;
    commit([...all, { index, name: '', frequency: null }]);
  };

  /**
   * Delete, then close the gap — renumbering the references along with it.
   *
   * These indices are hardware slots, not display numbers: an AM zone's members
   * are absolute indices into this table, and so is its `currentChannel`. So
   * compacting is only safe if every reference moves at the same time. Doing
   * the shift without the remap would leave each zone naming the station one
   * slot along, silently — the same class of bug as the AM-001 pointer, which
   * showed a DELETED record's leftover name because nothing had updated it.
   *
   * Rewriting the whole table costs 29 records ~= 1.8 KB, which is nothing on a
   * codeplug write, so the gap is not worth keeping.
   */
  const deleteChannels = (indices: ReadonlySet<number>) => {
    if (indices.size === 0) return;
    const { channels, zones: remappedZones } = deleteBroadcastChannels(
      all,
      indices,
      band === 'am' ? (tables.amZones ?? []) : []
    );
    commit(channels);
    if (band === 'am' && tables.amZones) setTable('amZones', remappedZones);
    // Indices are renumbered by the delete, so any surviving selection would
    // now point at different channels. Clearing is the only honest option.
    setSelected(new Set());
  };

  const toggle = (index: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index); else next.add(index);
      return next;
    });

  // Only rows currently VISIBLE, so "select all" under a search filter cannot
  // quietly stage a deletion of rows the user cannot see.
  const selectableHere = entries.map((c) => c.index);
  const allHereSelected =
    selectableHere.length > 0 && selectableHere.every((i) => selected.has(i));

  const full = all.length >= maxChannels;
  // Decided ONCE for the whole table, then used for both the header and every
  // cell. Testing each row separately would emit a header with no cells (or the
  // reverse) the moment one row disagreed, and a row one cell short of its
  // header shifts every column after it — the exact bug fixed in ChannelRow.
  const showScan = entries.some((c) => c.scanAdd !== undefined);

  // AM zones are editable; the editor owns its own rendering and empty state.
  const zoneList = zones ? <AmZonesEditor channels={entries} /> : null;

  const vfoKey = band === 'am' ? 'amVfo' : 'fmVfo';
  const setVfo = (patch: Partial<D890BroadcastChannel>) => {
    if (!broadcast || !vfo) return;
    setTable('broadcast', { ...broadcast, [vfoKey]: { ...vfo, ...patch } });
  };

  const vfoStrip = vfo ? (
    <div className="flex flex-wrap items-center gap-3 mb-2 px-2 py-1.5 rounded border border-neon-cyan border-opacity-30 bg-neon-cyan bg-opacity-5">
      <span className="text-neon-cyan text-xs font-bold">VFO</span>
      <input
        value={vfo.name}
        onChange={(e) => setVfo({ name: e.target.value })}
        placeholder="(no name)"
        className="bg-transparent text-white text-sm border-none outline-none focus:bg-panel focus:px-1 rounded w-40"
      />
      <input
        key={`vfo-${vfo.frequency ?? 'null'}`}
        defaultValue={vfo.frequency === null ? '' : vfo.frequency.toFixed(decimals)}
        onBlur={(e) => {
          const raw = e.target.value.trim();
          if (raw === '') return setVfo({ frequency: null });
          const v = Number.parseFloat(raw);
          if (Number.isFinite(v)) setVfo({ frequency: v });
          else e.target.value = vfo.frequency === null ? '' : vfo.frequency.toFixed(decimals);
        }}
        className="bg-transparent text-white text-sm font-mono border-none outline-none focus:bg-panel focus:px-1 rounded w-28"
      />
      <span className="text-muted text-xs">MHz</span>
      <span className="text-muted text-xs ml-auto">
        What the receiver is tuned to — not a stored memory, so it has no number
        and cannot be deleted.
      </span>
    </div>
  ) : null;

  const addButton = (
    <div className="flex items-center gap-3 mb-2">
      <button
        onClick={addChannel}
        disabled={!broadcast || full}
        className="px-3 py-1.5 rounded border border-neon-cyan text-neon-cyan
                   hover:bg-neon-cyan hover:bg-opacity-10 disabled:opacity-40
                   disabled:cursor-not-allowed text-sm"
      >
        + Add {band.toUpperCase()} memory
      </button>
      <span className="text-muted text-xs">
        {all.length} of {maxChannels}
        {full && ' — the radio has no more slots for this band'}
      </span>
      {selected.size > 0 && (
        <button
          onClick={() => deleteChannels(selected)}
          className="px-3 py-1.5 rounded border border-red-600 text-red-400
                     hover:bg-red-600 hover:bg-opacity-10 text-sm"
        >
          Delete {selected.size} selected
        </button>
      )}
    </div>
  );

  if (entries.length === 0) {
    return (
      <>
        {zoneList}
        {vfoStrip}
        {broadcast && addButton}
        <EmptyState message={emptyMessage} secondary="Read the radio to load these memories" />
      </>
    );
  }

  return (
    <>
    {zoneList}
    {vfoStrip}
    {addButton}
    <Card className="h-full overflow-auto" padding="none">
      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0 z-10">
          <tr className="bg-dark-charcoal border-b border-neon-cyan">
            <th className="px-3 py-2 w-8">
              <input
                type="checkbox"
                checked={allHereSelected}
                onChange={(e) =>
                  setSelected(e.target.checked ? new Set(selectableHere) : new Set())
                }
                title={allHereSelected ? 'Clear selection' : 'Select all shown'}
              />
            </th>
            <th className="px-3 py-2 text-left text-neon-cyan font-bold w-16">#</th>
            <th className="px-3 py-2 text-left text-neon-cyan font-bold">Name</th>
            <th className="px-3 py-2 text-left text-neon-cyan font-bold">Frequency</th>
            {/* Only FM carries a flat scan mask; AM's lives per-zone in a table
                we do not read, so the column is omitted rather than shown empty. */}
            {showScan && (
              <th
                className="px-3 py-2 text-left text-neon-cyan font-bold w-20"
                title="Tick to include this memory when scanning this band"
              >
                Scan
              </th>
            )}
            <th className="px-3 py-2 text-right text-neon-cyan font-bold w-20">Actions</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((ch) => (
            <tr key={ch.index} className="border-b border-panel hover:bg-neon-cyan hover:bg-opacity-5">
              <td className="px-3 py-2">
                <input
                  type="checkbox"
                  checked={selected.has(ch.index)}
                  onChange={() => toggle(ch.index)}
                />
              </td>
              <td className="px-3 py-2 text-muted">{ch.index + 1}</td>
              <td className="px-3 py-2">
                <input
                  value={ch.name}
                  onChange={(e) => patch(ch.index, { name: e.target.value })}
                  placeholder="—"
                  className="w-full bg-transparent text-white border-none outline-none
                             focus:bg-panel focus:px-1 rounded"
                />
              </td>
              <td className="px-3 py-2 font-mono">
                {/* Text, not type=number: a partly-typed "118." is not a valid
                    number and a number input would discard it mid-keystroke.
                    Empty parses back to null — the same "no usable frequency"
                    the decoder produces for erased bytes, rather than 0.0000,
                    which would invent one. */}
                <input
                  defaultValue={ch.frequency === null ? '' : ch.frequency.toFixed(decimals)}
                  key={`${ch.index}-${ch.frequency ?? 'null'}`}
                  onBlur={(e) => {
                    const raw = e.target.value.trim();
                    if (raw === '') return patch(ch.index, { frequency: null });
                    const v = Number.parseFloat(raw);
                    if (Number.isFinite(v)) patch(ch.index, { frequency: v });
                    else e.target.value =
                      ch.frequency === null ? '' : ch.frequency.toFixed(decimals);
                  }}
                  placeholder="—"
                  className="w-28 bg-transparent text-white border-none outline-none
                             focus:bg-panel focus:px-1 rounded"
                />
                <span className="text-muted ml-1">MHz</span>
              </td>
              {showScan && (
                <td className="px-3 py-2">
                  {/* FM's scan is flat — one bit per channel — so it belongs
                      here as a column. AM's is per (zone, member position) and
                      lives on the zone's member chips instead, because an AM
                      channel has no single scan state. */}
                  <input
                    type="checkbox"
                    checked={ch.scanAdd === true}
                    onChange={() => patch(ch.index, { scanAdd: !ch.scanAdd })}
                    title={ch.scanAdd ? `${ch.name || '#' + (ch.index + 1)} is scanned` : `${ch.name || '#' + (ch.index + 1)} is skipped when scanning`}
                  />
                </td>
              )}
              <td className="px-3 py-2 text-right">
                  <button
                    onClick={() => deleteChannels(new Set([ch.index]))}
                    title={`Delete ${band.toUpperCase()} memory ${ch.index + 1}`}
                    className="text-muted hover:text-red-400 px-2"
                  >
                    ✕
                  </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
    </>
  );
};
