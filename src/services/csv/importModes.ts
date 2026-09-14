/**
 * Adding a CSV to what a list already holds, instead of replacing the list.
 *
 * Each function keeps the list as it is and appends what the file adds. An entry
 * already here is skipped, matched by what that list is known by: every channel
 * field but the number; a zone's, scan list's or RX group's name; a contact's or
 * radio ID's DMR ID; a talk group's DMR ID and call type.
 *
 * Added channels and contacts are numbered on from the list's last. Added scan
 * lists (on radios that place them by slot), radio IDs and RX groups keep the
 * file's slot or index where it is free, so the file's own references to them
 * still land, and take the lowest free one where it isn't. Channel numbers in
 * zones and scan lists are taken as the file has them.
 */

import type { Channel, Contact, DMRRadioID, QuickContact, RXGroup, ScanList, Zone } from '../../models';
import type { RadioCapabilities } from '../../types/radioCapabilities';
import { CHANNEL_CSV_COLUMN_LIST } from './channelCsvColumns';
import { generateZoneId } from '../../utils/zoneHelpers';
import { isVFOChannel } from '../../utils/vfoChannels';
import { lowestFreeSlot } from '../../utils/lowestFreeSlot';

/** The first entry for each key `seen` doesn't already hold. */
function newEntries<T>(imported: readonly T[], key: (entry: T) => string | number, seen: Set<string | number>): T[] {
  const kept: T[] = [];
  for (const entry of imported) {
    const k = key(entry);
    if (seen.has(k)) continue;
    seen.add(k);
    kept.push(entry);
  }
  return kept;
}

/** The file's slot when it is free, otherwise the lowest free one; undefined when none is. */
function freeSlot(wanted: number | undefined, used: Set<number>, slots: number): number | undefined {
  const slot = wanted !== undefined && wanted < slots && !used.has(wanted) ? wanted : lowestFreeSlot(used, slots);
  if (slot !== undefined) used.add(slot);
  return slot;
}

/** Every CSV column but the number, so two channels match only when nothing else differs. */
function channelKey(channel: Channel): string {
  return JSON.stringify(
    CHANNEL_CSV_COLUMN_LIST.filter(([key]) => key !== 'number').map(([key, column]) => column.write(channel[key]))
  );
}

export function addChannels(existing: readonly Channel[], imported: readonly Channel[]): Channel[] {
  const regular = existing.filter((ch) => !isVFOChannel(ch.number));
  const vfo = existing.filter((ch) => isVFOChannel(ch.number));
  let last = regular.reduce((max, ch) => Math.max(max, ch.number), 0);
  const added = newEntries(
    imported.filter((ch) => !isVFOChannel(ch.number)),
    channelKey,
    new Set(existing.map(channelKey))
  );
  return [...regular, ...added.map((ch) => ({ ...ch, number: ++last })), ...vfo];
}

export function addZones(existing: readonly Zone[], imported: readonly Zone[]): Zone[] {
  const ids = new Set(existing.map((zone) => zone.id));
  const added = newEntries(imported, (zone) => zone.name, new Set(existing.map((zone) => zone.name))).map((zone) => {
    const id = ids.has(zone.id) ? generateZoneId() : zone.id;
    ids.add(id);
    return id === zone.id ? zone : { ...zone, id };
  });
  return [...existing, ...added];
}

export function addScanLists(
  existing: readonly ScanList[],
  imported: readonly ScanList[],
  caps: Pick<RadioCapabilities, 'scanListsBySlot' | 'maxScanLists'> | null | undefined
): ScanList[] {
  const added = newEntries(imported, (list) => list.name, new Set(existing.map((list) => list.name)));
  if (!caps?.scanListsBySlot) return [...existing, ...added];
  const used = new Set(existing.flatMap((list) => (list.slot === undefined ? [] : [list.slot])));
  // With no slot free a list gets none, and the count check reports it.
  return [...existing, ...added.map((list) => ({ ...list, slot: freeSlot(list.slot, used, caps.maxScanLists ?? 0) }))];
}

export function addContacts(existing: readonly Contact[], imported: readonly Contact[]): Contact[] {
  let last = existing.reduce((max, contact) => Math.max(max, contact.id), 0);
  const added = newEntries(imported, (contact) => contact.dmrId, new Set(existing.map((contact) => contact.dmrId)));
  return [...existing, ...added.map((contact) => ({ ...contact, id: ++last }))];
}

export function addRadioIds(
  existing: readonly DMRRadioID[],
  imported: readonly DMRRadioID[],
  slots: number | undefined
): DMRRadioID[] {
  const used = new Set(existing.map((id) => id.index));
  const room = slots ?? existing.length + imported.length;
  const added = newEntries(imported, (id) => id.dmrIdValue, new Set(existing.map((id) => id.dmrIdValue)));
  // With no index free an entry keeps the file's, past the radio's room, and the count check trims it.
  return [...existing, ...added.map((id) => ({ ...id, index: freeSlot(id.index, used, room) ?? id.index }))];
}

export function addTalkGroups(existing: readonly QuickContact[], imported: readonly QuickContact[]): QuickContact[] {
  const key = (tg: QuickContact) => `${tg.contactNumber}:${tg.callType}`;
  const added = newEntries(imported, key, new Set(existing.map(key)));
  // Appended, so every talk group already here keeps its slot, and so do the references to it.
  return [...existing, ...added.map((tg, i) => ({ ...tg, index: existing.length + i + 1 }))];
}

export function addRxGroups(existing: readonly RXGroup[], imported: readonly RXGroup[], slots: number | undefined): RXGroup[] {
  const used = new Set(existing.map((group) => group.index));
  const room = slots ?? existing.length + imported.length;
  const added = newEntries(imported, (group) => group.name, new Set(existing.map((group) => group.name)));
  return [...existing, ...added.map((group) => ({ ...group, index: freeSlot(group.index, used, room) ?? group.index }))];
}
