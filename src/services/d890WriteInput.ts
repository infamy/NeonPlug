/**
 * Gather the DA-7X2 codeplug-write input from the stores.
 *
 * Extracted so the Write button and the dry-run panel build the SAME input. A
 * dry run assembled separately would be testing a different write from the one
 * the button sends, which is the one thing a dry run must not do.
 */

import { useRadioStore } from '../store/radioStore';
import { useScanListsStore } from '../store/scanListsStore';
import { useQuickContactsStore } from '../store/quickContactsStore';
import { useRXGroupsStore } from '../store/rxGroupsStore';
import { useDMRRadioIDsStore } from '../store/dmrRadioIdsStore';
import { useEncryptionKeysStore } from '../store/encryptionKeysStore';
import { getCapabilitiesForModel } from '../radios/capabilities';
import { useZonesStore } from '../store/zonesStore';
import { zoneCurrentChannelsBySlot } from '../radios/d890uv/structures';
import type { D890CodeplugWriteInput } from '../radios/d890uv/codeplugWrite';
import type { Zone } from '../models/Zone';
import type { QuickContact } from '../models/QuickContact';
import type { Channel } from '../models/Channel';
import type { DMRRadioID } from '../models/DMRRadioID';
import type { ScanListDecoded } from '../radios/d890uv/structures';
import { encodeScanPriority } from '../radios/d890uv/scanListPriority';
import {
  buildTalkgroupRenumber,
  isNoOpRenumber,
  renumberChannelContacts,
  renumberRxGroupMembers,
  type TalkgroupRenumber,
} from '../radios/d890uv/talkgroupRenumber';

/**
 * The tables the UI can actually edit.
 *
 * Anything absent here is not lost — `planCodeplugWrite` writes back every
 * region it read but cannot encode, verbatim — so the radio keeps exactly what
 * it had. What is listed is what an edit can currently reach.
 */
export function buildD890CodeplugTables(
  zones: readonly Zone[],
  zoneSlots: readonly number[]
): D890CodeplugWriteInput['tables'] {
  const t = useRadioStore.getState().tables;
  return {
    roamingChannels: t.roaming?.channels,
    amChannels: t.broadcast?.am,
    fmChannels: t.broadcast?.fm,
    amVfo: t.broadcast?.amVfo,
    fmVfo: t.broadcast?.fmVfo,
    amZones: t.amZones,
    fiveTone: t.toneLists?.fiveTone,
    twoTone: t.toneLists?.twoTone,
    gpsRoaming: t.gpsRoaming,
    powerOnDisplay: t.powerOnDisplay,
    autoRepeaterOffsets: t.autoRepeaterOffsets,
    masterRadioId: t.masterRadioId,
    emergencySettings: t.emergencyAlarm?.settings ?? undefined,
    emergencyContact: t.emergencyAlarm?.contact ?? undefined,
    statusMessages: t.statusMessages,
    hotKeys: t.hotKeys,
    // Both books COMPACT on delete, so the write renumbers to array order and
    // the `slot` each entry was read from is deliberately not carried.
    analogContacts: t.analogAddressBook,
    mdc1200Contacts: t.mdc1200Contacts,
    // The SMS store does the opposite — a survivor keeps its own slot — so this
    // one IS carried by slot.
    smsStore: t.smsStore,
    dtmf: t.dtmf,
    talkgroups: d890Talkgroups(),
    // Identity here is genuinely stable: `id` IS the hardware slot,
    // `encryptionType` picks the table, and the store never renumbers — so
    // unlike every other table, these need no slot map and no refusal.
    // `entryNumber` is a position in the flattened list and is NOT used.
    encryptionKeys: useEncryptionKeysStore.getState().keys,
    radioIds: d890RadioIds(),
    scanLists: d890ScanLists(),
    clearedEncryptionKeys: d890ClearedEncryptionKeys(),
    // ⚠️ Receive groups are DELIBERATELY ABSENT and must stay that way until the
    // presence-mask address is proven. `D890_ADDR.RX_GROUP_SET` is 0x3701510,
    // which `D890_HOT_KEYS.MASK` also claims, and it reads zero on a radio that
    // holds two lists. Passing them here would make `maskedTable` write a
    // presence mask to an address we have not established. Reading them is
    // fixed (protocol.ts scans the records); writing them is not.
    // Position→slot. The read compacts empty slots away, so these two indexings
    // diverge the moment a zone in the middle is empty.
    zoneCurrentChannels:
      d890ZoneCurrentBySlot(zones, zoneSlots) ??
      (t.zoneCurrentChannels && zoneSlots.length > 0
        ? zoneCurrentChannelsBySlot(t.zoneCurrentChannels, zoneSlots)
        : undefined),
    // Derived from the zones themselves. The Zones tab's hide checkbox wrote to
    // `zone.hidden` and nothing ever turned that into slots, so it did nothing.
    hiddenZoneSlots: new Set(
      zones
        .map((z, i) => (z.hidden ? zoneSlots[i] : undefined))
        .filter((slot): slot is number => slot !== undefined)
    ),
  };
}

/**
 * Hardware slot for each zone in the CURRENT list, resolved by identity.
 *
 * A zone that was read keeps the slot it was read from. A zone the user ADDED
 * gets the lowest slot nothing else claims. A zone that was deleted simply
 * stops appearing, and its slot falls out — which is what makes the presence
 * mask clear exactly that bit and nothing else.
 *
 * The staged `zoneSlots` array is positional, and position stops being a key as
 * soon as the list is edited: on 2026-09-03 deleting zone 2 wrote all seven
 * survivors one slot down (their A/B pointers stayed behind, three ending up
 * past the end of their new zone), and adding a zone resolved position 8
 * against 8 staged slots to -1, skipping it silently — no record, no mask bit.
 *
 * Falls back to the positional array only when nothing identity-keyed was
 * staged, so an older staged read still writes exactly as it used to.
 */
/**
 * Zone slots for DISPLAY — never throws.
 *
 * `d890ZoneSlots` refuses when the staged read predates identity tracking,
 * because writing then would move zones into the wrong slots. That guard is
 * right for a write and wrong for a render: it took down the whole Settings tab
 * on 2026-09-03 when a component called it in its body. A label that falls back
 * to positions is worse than a correct one and far better than a blank page.
 */
export function d890ZoneSlotsForDisplay(zones?: readonly Zone[]): readonly number[] {
  try {
    return d890ZoneSlots(zones);
  } catch {
    const list = zones ?? useZonesStore.getState().zones;
    return list.map((_, i) => i);
  }
}

export function d890ZoneSlots(zones?: readonly Zone[]): readonly number[] {
  const staged = useRadioStore.getState().tables.writeOriginals;
  const list = zones ?? useZonesStore.getState().zones;
  const byId = staged?.zoneSlotById;
  if (byId) return resolveZoneSlots(list, byId);

  // No identity map: this read was staged before that existed. The positional
  // array is only safe while the list is UNEDITED — one add or delete and every
  // later zone lines up against the wrong slot, which is how seven zones got
  // written a slot down on 2026-09-03. Refuse rather than silently shift; the
  // fix is a re-read, which costs a minute and stages the map.
  const positional = staged?.zoneSlots ?? [];
  if (positional.length !== list.length) {
    throw new Error(
      `Refusing to write zones: the loaded read was staged before zone identity ` +
        `tracking, and the zone list has changed since (${list.length} zones ` +
        `against ${positional.length} slots). Read the radio again before writing — ` +
        `writing now would move every zone after the edit into the wrong slot.`
    );
  }
  return positional;
}

/** The pure half of `d890ZoneSlots`, so the allocation rules can be tested. */
export function resolveZoneSlots(
  zones: readonly { id: string }[],
  slotById: Readonly<Record<string, number>>
): number[] {
  // Claim every slot a surviving zone already owns BEFORE allocating, or a new
  // zone could be handed a slot that a later existing zone still holds.
  const taken = new Set<number>();
  for (const z of zones) {
    const slot = slotById[z.id];
    if (slot !== undefined) taken.add(slot);
  }
  let next = 0;
  return zones.map((z) => {
    const known = slotById[z.id];
    if (known !== undefined) return known;
    while (taken.has(next)) next += 1;
    taken.add(next);
    return next;
  });
}

/**
 * Per-zone current A/B channel, keyed by the slot each zone is being written to.
 *
 * Looked up by zone id rather than by array position for the same reason as the
 * slots: after an edit the store's position-indexed copy no longer lines up
 * with the zones list, and pairing them by index is what left the A/B pointers
 * one zone behind.
 */
export function d890ZoneCurrentBySlot(
  zones: readonly Zone[],
  slots: readonly number[]
): { a: Map<number, number>; b: Map<number, number> } | undefined {
  const byId = useRadioStore.getState().tables.writeOriginals?.zoneCurrentById;
  if (!byId) return undefined;
  const a = new Map<number, number>();
  const b = new Map<number, number>();
  zones.forEach((z, i) => {
    const slot = slots[i];
    const v = byId[z.id];
    // A zone the user just added has no stored current channel; leaving it out
    // means the encoder does not touch that slot's bytes at all.
    if (slot === undefined || v === undefined) return;
    a.set(slot, v.a);
    b.set(slot, v.b);
  });
  return { a, b };
}

/**
 * Talk groups, in the order they will occupy slots.
 *
 * ⚠️ THIS TABLE COMPACTS. Entry i goes to slot i, always, and the table always
 * occupies 0..N-1 with no holes — MEASURED from the vendor CPS on 2026-09-10 by
 * clearing one row and diffing the write it produced:
 *
 *     slot 500   TG0501 -> TG0502        500 records shifted down by one
 *     slot 999   TG1000 -> TG1001
 *     bank 1     10 records -> 9
 *     locator[1009]  0x000003f1 -> 0xffffffff
 *     mask           slot 1009 becomes absent
 *
 * That also explains the locator. It is an identity table in every capture not
 * because `V = slot index` is a rule worth preserving, but because slot ALWAYS
 * equals position when the table cannot have holes. `V = slot` is true and
 * vacuous.
 *
 * The previous version kept survivors on the slots they were read from and
 * punched a hole. It wrote exactly that, read back byte-perfect, and left the
 * radio reporting 1010 talk groups and CRASHING on the deleted entry — it had
 * dereferenced a locator entry that said "not there". See the retraction in
 * `HW-ROUNDTRIP-TESTS.md`.
 *
 * So no identity map is needed, and there is nothing to refuse: add, delete and
 * edit are all just "write the list in order".
 */
export function d890Talkgroups(): QuickContact[] | undefined {
  const contacts = useQuickContactsStore.getState().contacts;
  if (contacts.length === 0) return undefined;
  // Compaction: entry i goes to slot i. No identity needed to PLACE a record.
  return contacts.map((c, i) => ({ ...c, index: i }));
}

/** What moved where, or undefined when the session has no read to compare to. */
export function d890TalkgroupRenumber(): TalkgroupRenumber | undefined {
  const countAtRead =
    useRadioStore.getState().tables.writeOriginals?.talkgroupCountAtRead;
  if (countAtRead === undefined) return undefined;
  const r = buildTalkgroupRenumber(
    useQuickContactsStore.getState().contacts,
    countAtRead
  );
  return isNoOpRenumber(r) ? undefined : r;
}

/**
 * Channels with their TX contacts moved to follow the talk groups.
 *
 * Call this instead of handing the store's channels straight to the plan. A
 * delete compacts the talk group table, and a channel's `contactId` is a SLOT —
 * so without this a channel pointing at talk group 600 would transmit on 601's,
 * in a codeplug that reads back perfectly clean.
 *
 * REFUSES rather than guessing in two cases, both of which need a human:
 *
 *   - a channel's TX contact is a talk group that was DELETED. Clearing it to
 *     "none" changes what that channel does on air, and that is the user's
 *     call.
 *   - a RECEIVE GROUP references a talk group that moved or went away. Receive
 *     groups are not passed to the write plan at all yet (see the audit in
 *     TODO-DA7X2.md), so we cannot fix them — and leaving them stale points
 *     them at the wrong talk groups just as surely.
 */
export function d890RenumberedChannels(channels: readonly Channel[]): Channel[] {
  const r = d890TalkgroupRenumber();
  if (!r) return [...channels];

  const rx = renumberRxGroupMembers(useRXGroupsStore.getState().groups, r);
  const rxAffected =
    rx.dangling.length > 0 ||
    rx.groups.some((g, i) => g !== useRXGroupsStore.getState().groups[i]);
  if (rxAffected) {
    throw new Error(
      `Refusing to write: deleting a talk group would leave receive groups ` +
        `pointing at the wrong ones.\n\n` +
        `Talk groups compact, so everything after the deleted one moves down a ` +
        `slot — and receive groups reference them by slot. NeonPlug does not ` +
        `write receive groups yet, so it cannot fix them.\n\n` +
        `Remove the talk group in the vendor CPS instead, or delete one that no ` +
        `receive group uses.`
    );
  }

  const result = renumberChannelContacts(channels, r);
  if (result.dangling.length > 0) {
    const shown = result.dangling
      .slice(0, 8)
      .map((d) => `  channel ${d.number}${d.name ? ` (${d.name})` : ''}`)
      .join('\n');
    throw new Error(
      `Refusing to write: ${result.dangling.length} channel(s) use a talk group ` +
        `you deleted.\n${shown}` +
        (result.dangling.length > 8
          ? `\n  ... and ${result.dangling.length - 8} more`
          : '') +
        `\n\nClearing their TX contact would change what they transmit, so that ` +
        `is your call — point them at another talk group first, or keep the one ` +
        `they use.`
    );
  }
  return result.channels;
}

/**
 * Key slots the read saw that the user has since removed.
 *
 * A write emits only the keys it is handed, so without this a delete is a
 * SILENT NO-OP: the removed key's record stays on the radio untouched and the
 * user's deletion simply does not happen. These get written back as empty
 * records instead — zeroing the key bytes is what makes the parser call a slot
 * empty.
 *
 * Matched on `(encryptionType, id)` because slot 1 exists in three tables at
 * once; matching on `id` alone would clear the wrong table's key.
 */
export function d890ClearedEncryptionKeys():
  { encryptionType: number; id: number }[] | undefined {
  const atRead = useRadioStore.getState().tables.writeOriginals?.encryptionKeysAtRead;
  if (!atRead) return undefined;
  const now = new Set(
    useEncryptionKeysStore.getState().keys.map((k) => `${k.encryptionType}:${k.id}`)
  );
  return atRead.filter((k) => !now.has(`${k.encryptionType}:${k.id}`));
}

/**
 * DMR radio IDs, keyed by the hardware slot each one occupies.
 *
 * `DMRRadioID.index` IS the slot: `readDMRRadioIDs` walks the presence mask and
 * hands each occupied slot to `parseRadioId`, and `dmrRadioIdsStore` renumbers
 * on neither add nor delete. So an edit needs no mapping — unlike scan lists,
 * receive groups and quick messages, which all lose their slots.
 *
 * DELETE leaves a HOLE — survivors keep their slots. MEASURED 2026-09-10 from a
 * vendor CPS delete: removing radio ID slot 2 of 0-3 left the read fetching
 * 0x3680000 (slots 0-1) and 0x36800c0 (slot 3), with nothing shifted. Same as
 * zones, and unlike talk groups, which compact.
 *
 * So a delete needs no renumbering: channels reference radio IDs by index
 * (`dmrRadioIdIndex`, channel `+0x18`) and those indices do not move. It does
 * need the dangling-reference gate to be slot-aware, or a channel pointing at
 * slot 3 of {0,1,3} is refused against a count of 3 — see `occupiedSlots`.
 */
export function d890RadioIds(): DMRRadioID[] | undefined {
  const ids = useDMRRadioIDsStore.getState().radioIds;
  if (ids.length === 0) return undefined;

  return [...ids];
}

/**
 * Scan lists, as the DECODED records with the user's edits overlaid.
 *
 * Two problems make this the awkward one of the five tables in the audit, and
 * both come from the shared `ScanList` model being shaped around the DM-32:
 *
 *   1. It has no slot. The DA-7X2 reads scan lists off a presence mask, so
 *      array position is not the slot and a write placing by position would
 *      relocate every list after a gap. `ScanList.slot` now carries it.
 *   2. It has no home for scan mode, priority select, the raw priority
 *      channels, or the four timers — all of which `applyScanListToRecord`
 *      writes. Narrowing at read time loses them, so the DECODED record from
 *      `tables.scanListsDetailed` is the base and only the fields the UI can
 *      actually edit — name and channels — are overlaid.
 *
 * DELETE leaves a HOLE — survivors keep their slots. MEASURED 2026-09-10 from a
 * vendor CPS delete: removing scan list slot 0 of {0,1} left the read fetching
 * 0x2100200 alone, so slot 1 stayed slot 1 rather than moving down. Channels
 * reference a scan list by index (`scanListId`, channel `+0x1b`) and those
 * indices do not move, so no renumbering is needed.
 *
 * ⚠️ ADD is still refused: a new list has no decoded record to patch, and this
 * radio's scan list record has fields the shared model cannot describe.
 */
/**
 * Clamp a UI number into the u16 the record holds, falling back to what the
 * radio already had rather than to zero. A blank or NaN input must not silently
 * become a 0-decisecond timer.
 */
function u16(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(Math.max(Math.trunc(value!), 0), 0xffff);
}

export function d890ScanLists(): ScanListDecoded[] | undefined {
  const detailed = useRadioStore.getState().tables.scanListsDetailed;
  if (!detailed || detailed.length === 0) return undefined;
  const edited = useScanListsStore.getState().scanLists;

  const bySlot = new Map<number, (typeof edited)[number]>();
  for (const list of edited) {
    if (list.slot !== undefined) bySlot.set(list.slot, list);
  }

  // An add is a list with no DECODED RECORD behind its slot, not merely one
  // with no slot. The UI now allocates the lowest free slot on add (so a hole
  // left by a delete gets reused instead of being stranded), which means
  // `slot === undefined` no longer identifies a new list.
  const haveRecord = new Set(detailed.map((r) => r.slot));
  const added = edited.filter((l) => l.slot === undefined || !haveRecord.has(l.slot));
  if (added.length > 0) {
    const where = added
      .map((l) => (l.slot === undefined ? `"${l.name}"` : `"${l.name}" (slot ${l.slot + 1})`))
      .join(', ');
    throw new Error(
      `Refusing to write: adding a scan list is not supported yet (${where}).\n\n` +
        `A new list has no record read from the radio to patch. Its layout is ` +
        `otherwise fully known — every byte from 0x98 to the end of the record is ` +
        `zero in all six scan lists captured so far — but four fields the UI cannot ` +
        `show have no known default: look-back time A and B, dropout delay and ` +
        `revert channel. Both lists on the reference radio hold deliberately ` +
        `distinct sweep values, so neither is a default.\n\n` +
        `ONE scan list created fresh in the vendor CPS would settle them for good. ` +
        `Until then, editing and deleting work; add one with the vendor CPS.`
    );
  }

  // Deleted lists simply drop out: the slot keeps its hole and the masked-table
  // planner clears the presence bit for it.
  return detailed
    .filter((record) => bySlot.has(record.slot))
    .map((record) => {
      const ui = bySlot.get(record.slot)!;
      return {
        ...record,
        name: ui.name,
        channels: ui.channels ?? record.channels,
        // Hang time IS this radio's dwell time — the read already maps it that
        // way, so not writing it back meant the field displayed a real value,
        // accepted an edit, and silently reverted.
        dwellTime: u16(ui.hangTime, record.dwellTime),
        // An ABSENT type keeps the radio's value; it never means "Off". The read
        // always populates these, so undefined here means the list came from
        // somewhere else — an importer, or a .neonplug saved before this was
        // wired — and forcing 0xffff would silently delete a real priority.
        priorityChannel1Raw:
          ui.priority1Type === undefined
            ? record.priorityChannel1Raw
            : encodeScanPriority(ui.priority1Type, ui.priorityChannel1),
        priorityChannel2Raw:
          ui.priority2Type === undefined
            ? record.priorityChannel2Raw
            : encodeScanPriority(ui.priority2Type, ui.priorityChannel2),
      };
    });
}

/** Zones exactly as the UI holds them. */
export function d890Zones(): Zone[] {
  return useZonesStore.getState().zones;
}

/**
 * The originals a write patches, assembled from the staged read plus the
 * table counts and cross-references the plan needs to refuse safely.
 *
 * Shared by the Write button and the dry-run panel so both plan from identical
 * input — a dry run built from a different source would prove nothing about
 * what the button sends.
 */
export function buildD890WriteOriginals(effectiveModel: string | null) {
  const staged = useRadioStore.getState().tables.writeOriginals;
  if (!staged || staged.model !== effectiveModel) return null;

  const zonesNow = useZonesStore.getState().zones;
  const scanListsNow = useScanListsStore.getState().scanLists;
  return {
    channelRecords: staged.channelRecords,
    channelMask: staged.channelMask,
    counts: {
      DMRTalkGroups: useQuickContactsStore.getState().contacts.length,
      ScanList: scanListsNow.length,
      DMRReceiveGroupCallList: useRXGroupsStore.getState().groups.length,
      RadioIDList: useDMRRadioIDsStore.getState().radioIds.length,
      AESEncryptionCode: useEncryptionKeysStore.getState().keys.length,
    },
    // The slots these tables ACTUALLY occupy, which is not the same as how many
    // there are. Radio IDs and scan lists leave a HOLE when an entry is deleted
    // — measured from a vendor CPS delete on 2026-09-10, where removing radio ID
    // slot 2 of 0-3 left the survivors on slots 0, 1 and 3. A count of 3 would
    // then call a channel referencing slot 3 out of range and refuse a write
    // that is perfectly valid.
    //
    // Talk groups are deliberately absent: they COMPACT, so their count and
    // their slot set say the same thing, and the count is the simpler truth.
    occupiedSlots: {
      RadioIDList: new Set(useDMRRadioIDsStore.getState().radioIds.map((r) => r.index)),
      ScanList: new Set(
        scanListsNow
          .map((l) => l.slot)
          .filter((slot): slot is number => slot !== undefined)
      ),
    },
    // What still points AT channels, so the plan can refuse to clear a channel
    // a zone or scan list is using.
    referencingTables: [
      ...zonesNow.map((z) => ({
        kind: 'zone' as const,
        name: z.name,
        channelNumbers: z.channels ?? [],
      })),
      ...scanListsNow.map((sl) => ({
        kind: 'scan list' as const,
        name: sl.name,
        channelNumbers: sl.channels ?? [],
      })),
    ],
    // TX limits come from the descriptor, not the radio — the real TX range is
    // absent from LocalInfo and from every byte of a full codeplug capture.
    txBandLimits: getCapabilitiesForModel(effectiveModel ?? '')?.bandLimits,
    // The write is refused on the basis of the read it is patching.
    integrity: staged.integrity ?? [],
    readLog: staged.readLog,
    zoneSlots: staged.zoneSlots,
  };
}
