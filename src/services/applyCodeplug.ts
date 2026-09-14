/**
 * Put a loaded codeplug into the stores — one implementation for every path.
 *
 * There were four copies: import and restore in the toolbar, import and restore
 * behind the startup screen. They had drifted. The toolbar's import marked the
 * imported radio settings changed, because the write path only encodes changed
 * fields, so settings that are merely loaded never reach the radio (issue #2).
 * The startup screen's import did not: a codeplug opened from there showed its
 * settings in the UI and then silently left them out of the next write.
 *
 * `intent` is the one real difference. An IMPORT is data the user means to put
 * on a radio, so its settings are marked changed. A RESTORE puts back a
 * snapshot, usually of a read, whose settings are already what the radio holds,
 * so nothing is marked.
 */

import type { CodeplugData } from './codeplugExport';
import { applyImportedTables } from './codeplugExport';
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

export type ApplyCodeplugIntent = 'import' | 'restore';

export function applyCodeplugToStores(data: CodeplugData, intent: ApplyCodeplugIntent): void {
  useChannelsStore.getState().setChannels(data.channels);
  useZonesStore.getState().setZones(data.zones);
  useScanListsStore.getState().setScanLists(data.scanLists);
  useContactsStore.getState().setContacts(data.contacts);
  const digital = useDigitalEmergencyStore.getState();
  digital.setSystems(data.digitalEmergencies);
  if (data.digitalEmergencyConfig) digital.setConfig(data.digitalEmergencyConfig);
  useAnalogEmergencyStore.getState().setSystems(data.analogEmergencies);
  if (data.radioSettings) {
    useRadioSettingsStore
      .getState()
      .setSettings(data.radioSettings, { markAllChanged: intent === 'import' });
  }
  const radio = useRadioStore.getState();
  radio.setRadioInfo(data.radioInfo ?? null);
  useQuickMessagesStore.getState().setMessages(data.messages ?? []);
  useDMRRadioIDsStore.getState().setRadioIds(data.radioIds ?? []);
  useQuickContactsStore.getState().setContacts(data.quickContacts ?? []);
  useRXGroupsStore.getState().setGroups(data.rxGroups ?? []);
  useEncryptionKeysStore.getState().setKeys(data.encryptionKeys ?? []);
  // Radio-specific tables (AM/FM, roaming, DTMF, hot keys …). Absent from files
  // written before 2026-09-12, for which this is a no-op.
  applyImportedTables(data.tables, radio.setTable);
}
