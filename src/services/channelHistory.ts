/**
 * Undo and redo for changes made on the Channels tab.
 *
 * A delete renumbers every channel after it, zones and scan lists follow, and
 * nothing could put it back: snapshots are taken at a read, a write or an
 * import, so restoring one also lost every edit since. This keeps the channel,
 * zone and scan list stores as they were before each change the Channels tab
 * makes, in memory, so Undo puts all three back together.
 *
 * Only changes made through `recordChannelEdit` go in the history. Anything
 * else that changes those stores (a read, an import, an edit on the Zones tab)
 * clears it, because putting back an older copy would throw that change away
 * without a word.
 */

import { create } from 'zustand';
import type { Channel } from '../models/Channel';
import type { RadioSettings } from '../models/RadioSettings';
import type { ScanList } from '../models/ScanList';
import type { Zone } from '../models/Zone';
import { useChannelsStore, type RawChannelData } from '../store/channelsStore';
import { useDMRRadioIDsStore } from '../store/dmrRadioIdsStore';
import { useEncryptionKeysStore } from '../store/encryptionKeysStore';
import { useQuickContactsStore } from '../store/quickContactsStore';
import { useRXGroupsStore } from '../store/rxGroupsStore';
import { useRadioStore } from '../store/radioStore';
import type { RadioTables } from '../types/radioTables';
import { useRadioSettingsStore } from '../store/radioSettingsStore';
import { useScanListsStore } from '../store/scanListsStore';
import { useZonesStore } from '../store/zonesStore';
import { formatPlural } from '../utils/formatPlural';
import { getVFOIdentifier, isVFOChannel } from '../utils/vfoChannels';

interface ChannelSnapshot {
  channels: Channel[];
  rawChannelData: Map<number, RawChannelData>;
  zones: Zone[];
  scanLists: ScanList[];
  /** VFO A and B are rows in the channel grid, but they live in the settings. */
  vfoA: Channel | undefined;
  vfoB: Channel | undefined;
  /** The DA-7X2's zone current A/B, which a delete that leaves a hole moves. */
  zoneCurrent: RadioTables['zoneCurrentChannels'] | undefined;
  zoneCurrentEdits: RadioTables['zoneCurrentEdits'] | undefined;
}

interface HistoryEntry {
  /** What the change did, as the Undo button names it: "delete 3 channels". */
  label: string;
  /** The stores before the change (in `past`), or before it was undone (in `future`). */
  snapshot: ChannelSnapshot;
  mergeKey?: string;
  at: number;
}

interface ChannelHistoryState {
  past: HistoryEntry[];
  future: HistoryEntry[];
  /** The notice offering Undo after a delete or an import. */
  notice: { id: number; text: string } | null;
}

export const useChannelHistoryStore = create<ChannelHistoryState>(() => ({
  past: [],
  future: [],
  notice: null,
}));

/** Steps kept. Each holds references to the stores' arrays, not copies of them. */
export const HISTORY_LIMIT = 100;

/** Keystrokes into one cell, each this close to the last, are one step. */
export const MERGE_WINDOW_MS = 2000;

/** True while a recorded change, an undo or a redo is changing the stores. */
let applying = false;
/** The step a following change may join: none after an undo, a redo or a clear. */
let joinable: HistoryEntry | null = null;
/** Open until the current task ends, so one click that sets two fields is one step. */
let sameTask = false;
let lastNoticeId = 0;

function snapshotStores(): ChannelSnapshot {
  const { channels, rawChannelData } = useChannelsStore.getState();
  const settings = useRadioSettingsStore.getState().settings;
  const { tables } = useRadioStore.getState();
  return {
    channels,
    rawChannelData,
    zones: useZonesStore.getState().zones,
    scanLists: useScanListsStore.getState().scanLists,
    vfoA: settings?.vfoA,
    vfoB: settings?.vfoB,
    zoneCurrent: tables.zoneCurrentChannels,
    zoneCurrentEdits: tables.zoneCurrentEdits,
  };
}

function sameSnapshot(a: ChannelSnapshot, b: ChannelSnapshot): boolean {
  return (
    a.channels === b.channels &&
    a.rawChannelData === b.rawChannelData &&
    a.zones === b.zones &&
    a.scanLists === b.scanLists &&
    a.vfoA === b.vfoA &&
    a.vfoB === b.vfoB &&
    a.zoneCurrent === b.zoneCurrent &&
    a.zoneCurrentEdits === b.zoneCurrentEdits
  );
}

function asApplying(change: () => void): void {
  const was = applying;
  applying = true;
  try {
    change();
  } finally {
    applying = was;
  }
}

function restore(snapshot: ChannelSnapshot): void {
  asApplying(() => {
    useChannelsStore.setState({ channels: snapshot.channels, rawChannelData: snapshot.rawChannelData });
    useZonesStore.setState({ zones: snapshot.zones });
    useScanListsStore.setState({ scanLists: snapshot.scanLists });
    const radio = useRadioStore.getState();
    if (radio.tables.zoneCurrentChannels !== snapshot.zoneCurrent) {
      radio.setTable('zoneCurrentChannels', snapshot.zoneCurrent ?? null);
    }
    if (radio.tables.zoneCurrentEdits !== snapshot.zoneCurrentEdits) {
      radio.setTable('zoneCurrentEdits', snapshot.zoneCurrentEdits ?? null);
    }
    const { settings, updateSettings } = useRadioSettingsStore.getState();
    if (!settings) return;
    const vfos: Partial<RadioSettings> = {};
    if (snapshot.vfoA && settings.vfoA !== snapshot.vfoA) vfos.vfoA = snapshot.vfoA;
    if (snapshot.vfoB && settings.vfoB !== snapshot.vfoB) vfos.vfoB = snapshot.vfoB;
    if (vfos.vfoA || vfos.vfoB) updateSettings(vfos);
  });
}

/** "channel 5", "VFO A" or "3 channels". */
export function channelsLabel(numbers: readonly number[]): string {
  if (numbers.length !== 1) return `${numbers.length} ${formatPlural(numbers.length, 'channel')}`;
  const [n] = numbers;
  return isVFOChannel(n) ? `VFO ${getVFOIdentifier(n)}` : `channel ${n}`;
}

export interface RecordOptions {
  /** A change with the same key as the step before, within MERGE_WINDOW_MS of it, joins that step. */
  mergeKey?: string;
  /** Offer Undo in a notice, for a change that is easy to miss or to regret. */
  announce?: string;
}

/**
 * Make a change on the Channels tab that Undo can take back: the stores are
 * kept as they were before `change` runs.
 */
export function recordChannelEdit(label: string, change: () => void, options: RecordOptions = {}): void {
  const before = snapshotStores();
  asApplying(change);
  if (sameSnapshot(before, snapshotStores())) return;

  const now = Date.now();
  const { past, notice } = useChannelHistoryStore.getState();
  const last = past[past.length - 1];
  const joins =
    last !== undefined &&
    last === joinable &&
    (sameTask ||
      (options.mergeKey !== undefined && options.mergeKey === last.mergeKey && now - last.at < MERGE_WINDOW_MS));

  const entry: HistoryEntry = joins
    ? { ...last, label, mergeKey: options.mergeKey, at: now }
    : { label, snapshot: before, mergeKey: options.mergeKey, at: now };
  joinable = entry;
  useChannelHistoryStore.setState({
    past: joins ? [...past.slice(0, -1), entry] : [...past, entry].slice(-HISTORY_LIMIT),
    future: [],
    notice: options.announce ? { id: ++lastNoticeId, text: options.announce } : joins ? notice : null,
  });

  if (!sameTask) {
    sameTask = true;
    queueMicrotask(() => {
      sameTask = false;
    });
  }
}

/** Put the stores back as they were before the last change. Returns what was undone. */
export function undoChannelEdit(): string | null {
  const { past, future } = useChannelHistoryStore.getState();
  const last = past[past.length - 1];
  if (!last) return null;
  const current = snapshotStores();
  restore(last.snapshot);
  joinable = null;
  useChannelHistoryStore.setState({
    past: past.slice(0, -1),
    future: [...future, { label: last.label, snapshot: current, at: Date.now() }],
    notice: null,
  });
  return last.label;
}

/** Make the last undone change again. Returns what was redone. */
export function redoChannelEdit(): string | null {
  const { past, future } = useChannelHistoryStore.getState();
  const next = future[future.length - 1];
  if (!next) return null;
  const current = snapshotStores();
  restore(next.snapshot);
  joinable = null;
  useChannelHistoryStore.setState({
    past: [...past, { label: next.label, snapshot: current, at: Date.now() }],
    future: future.slice(0, -1),
    notice: null,
  });
  return next.label;
}

/** Take the notice down; with an id, only if it is still that notice. */
export function dismissChannelNotice(id?: number): void {
  const { notice } = useChannelHistoryStore.getState();
  if (notice && (id === undefined || notice.id === id)) useChannelHistoryStore.setState({ notice: null });
}

export function clearChannelHistory(): void {
  joinable = null;
  const { past, future, notice } = useChannelHistoryStore.getState();
  if (past.length > 0 || future.length > 0 || notice) {
    useChannelHistoryStore.setState({ past: [], future: [], notice: null });
  }
}

/**
 * Clear the history whenever the channel, zone or scan list stores change
 * other than through this module. Returns a function that stops watching.
 */
export function watchChannelHistory(): () => void {
  const changedElsewhere = () => {
    if (!applying) clearChannelHistory();
  };
  const stops = [
    useChannelsStore.subscribe((s, prev) => {
      if (s.channels !== prev.channels || s.rawChannelData !== prev.rawChannelData) changedElsewhere();
    }),
    useZonesStore.subscribe((s, prev) => {
      if (s.zones !== prev.zones) changedElsewhere();
    }),
    useScanListsStore.subscribe((s, prev) => {
      if (s.scanLists !== prev.scanLists) changedElsewhere();
    }),
    useRadioSettingsStore.subscribe((s, prev) => {
      if (s.settings?.vfoA !== prev.settings?.vfoA || s.settings?.vfoB !== prev.settings?.vfoB) changedElsewhere();
    }),
    // Channels name talk groups, RX groups, radio IDs and keys by slot or index,
    // so a change to one of those lists can change what an older copy of the
    // channels points at. A talk group delete that moved no current channel left
    // Undo able to put back a TX contact past the end of the list.
    useQuickContactsStore.subscribe((s, prev) => {
      if (s.contacts !== prev.contacts) changedElsewhere();
    }),
    useRXGroupsStore.subscribe((s, prev) => {
      if (s.groups !== prev.groups) changedElsewhere();
    }),
    useDMRRadioIDsStore.subscribe((s, prev) => {
      if (s.radioIds !== prev.radioIds) changedElsewhere();
    }),
    useEncryptionKeysStore.subscribe((s, prev) => {
      if (s.keys !== prev.keys) changedElsewhere();
    }),
    useRadioStore.subscribe((s, prev) => {
      const { zoneCurrentChannels, zoneCurrentEdits } = s.tables;
      if (zoneCurrentChannels !== prev.tables.zoneCurrentChannels || zoneCurrentEdits !== prev.tables.zoneCurrentEdits) {
        changedElsewhere();
      }
    }),
  ];
  return () => stops.forEach((stop) => stop());
}
