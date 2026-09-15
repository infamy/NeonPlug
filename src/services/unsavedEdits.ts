/**
 * Unsaved edits: noticing them, and keeping them before something replaces them.
 *
 * Nothing used to track edits. A Read clears every store before it connects, an
 * import or a restore replaces them, and closing the tab drops them, each
 * without a word, so work done since the last read existed only in memory.
 *
 * The codeplug counts as edited once any part of it changes. Whatever loads a
 * whole codeplug (a read, an import, a restore, the sample data) or saves one
 * (a write, an export) marks it clean when it is done.
 */

import type { CodeplugData } from './codeplugExport';
import { exportableTables } from './codeplugExport';
import { saveSnapshot } from './codeplugSnapshots';
import { useUnsavedChangesStore } from '../store/unsavedChangesStore';
import { useChannelsStore } from '../store/channelsStore';
import { useZonesStore } from '../store/zonesStore';
import { useScanListsStore } from '../store/scanListsStore';
import { useContactsStore } from '../store/contactsStore';
import { useRadioSettingsStore } from '../store/radioSettingsStore';
import { useDigitalEmergencyStore } from '../store/digitalEmergencyStore';
import { useAnalogEmergencyStore } from '../store/analogEmergencyStore';
import { useRadioStore } from '../store/radioStore';
import { useQuickMessagesStore } from '../store/quickMessagesStore';
import { useDMRRadioIDsStore } from '../store/dmrRadioIdsStore';
import { useQuickContactsStore } from '../store/quickContactsStore';
import { useRXGroupsStore } from '../store/rxGroupsStore';
import { useEncryptionKeysStore } from '../store/encryptionKeysStore';

/** The whole codeplug as the stores hold it now. */
export function codeplugFromStores(): CodeplugData {
  const rs = useRadioStore.getState();
  const digital = useDigitalEmergencyStore.getState();
  return {
    channels: useChannelsStore.getState().channels,
    zones: useZonesStore.getState().zones,
    scanLists: useScanListsStore.getState().scanLists,
    contacts: useContactsStore.getState().contacts,
    digitalEmergencies: digital.systems,
    digitalEmergencyConfig: digital.config,
    analogEmergencies: useAnalogEmergencyStore.getState().systems,
    radioSettings: useRadioSettingsStore.getState().settings,
    radioInfo: rs.radioInfo,
    messages: useQuickMessagesStore.getState().messages,
    radioIds: useDMRRadioIDsStore.getState().radioIds,
    quickContacts: useQuickContactsStore.getState().contacts,
    rxGroups: useRXGroupsStore.getState().groups,
    encryptionKeys: useEncryptionKeysStore.getState().keys,
    tables: exportableTables(rs.tables),
    exportDate: new Date().toISOString(),
  };
}

/** True when there is a codeplug to lose. */
export function codeplugHasData(): boolean {
  return (
    useChannelsStore.getState().channels.length > 0 ||
    useZonesStore.getState().zones.length > 0 ||
    useScanListsStore.getState().scanLists.length > 0 ||
    useContactsStore.getState().contacts.length > 0 ||
    useQuickContactsStore.getState().contacts.length > 0
  );
}

export function hasUnsavedEdits(): boolean {
  return useUnsavedChangesStore.getState().dirty && codeplugHasData();
}

/**
 * Snapshot the codeplug before something replaces it, when it holds edits that
 * no snapshot has. The codeplug is captured before this returns, so a caller
 * that cannot wait (a read needs the click's user activation to open the port
 * picker) can go ahead and clear the stores.
 */
export function backupUnsavedEdits(before: string): Promise<void> {
  if (!hasUnsavedEdits()) return Promise.resolve();
  const data = codeplugFromStores();
  return saveSnapshot(data, { eventType: 'backup', reason: before }).catch((err) => {
    console.warn('Could not snapshot the unsaved edits:', err);
  });
}

type Watchable<S> = { subscribe: (listener: (state: S, prev: S) => void) => () => void };

function watch<S>(store: Watchable<S>, pick: (state: S) => readonly unknown[]): () => void {
  return store.subscribe((state, prev) => {
    const now = pick(state);
    const before = pick(prev);
    if (now.some((value, i) => value !== before[i])) useUnsavedChangesStore.getState().markDirty();
  });
}

/**
 * Mark the codeplug edited whenever any part of it changes. Only the codeplug:
 * which RX group is selected, or whether a radio is busy, is not an edit.
 * Returns a function that stops tracking.
 */
export function trackUnsavedEdits(): () => void {
  const stops = [
    watch(useChannelsStore, (s) => [s.channels]),
    watch(useZonesStore, (s) => [s.zones]),
    watch(useScanListsStore, (s) => [s.scanLists]),
    watch(useContactsStore, (s) => [s.contacts]),
    watch(useRadioSettingsStore, (s) => [s.settings]),
    watch(useDigitalEmergencyStore, (s) => [s.systems, s.config]),
    watch(useAnalogEmergencyStore, (s) => [s.systems]),
    watch(useQuickMessagesStore, (s) => [s.messages]),
    watch(useDMRRadioIDsStore, (s) => [s.radioIds]),
    watch(useQuickContactsStore, (s) => [s.contacts]),
    watch(useRXGroupsStore, (s) => [s.groups]),
    watch(useEncryptionKeysStore, (s) => [s.keys]),
    watch(useRadioStore, (s) => [s.tables]),
  ];
  return () => stops.forEach((stop) => stop());
}
