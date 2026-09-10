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

  // ⚠️ DELETE IS REFUSED until reference renumbering exists.
  //
  // Compaction is only half of a delete. Channels reference a talk group by
  // SLOT (u32 at channel +0x14, 0-based, 0xFFFFFFFF = none) and receive groups
  // reference them the same way (`decodeU32Members`). When the table shifts,
  // every reference ABOVE the deleted entry has to shift with it or it silently
  // retargets — a channel pointing at talk group 600 would transmit on 601's.
  //
  // Writing a correctly compacted table with stale references is a WORSE
  // failure than refusing: the codeplug reads back clean and the radio talks to
  // the wrong group.
  //
  // ADD is allowed: a new entry lands on the end and shifts nothing.
  //
  // To lift this: record each talk group's read slot, build old -> new from it,
  // and apply that map to channel `contactId` and receive-group members before
  // planning. A reference to the DELETED talk group needs a decision of its own
  // — clear it, or refuse the write and name the channels.
  const staged = useRadioStore.getState().tables.writeOriginals;
  const readCount = staged?.talkgroupCountAtRead;
  if (readCount !== undefined && contacts.length < readCount) {
    throw new Error(
      `Refusing to write talk groups: deleting one is not safe yet.\n\n` +
        `The table compacts, so every talk group after the deleted one moves ` +
        `down a slot — and channels and receive groups reference them BY SLOT. ` +
        `Renumbering those references is not implemented, so the write would ` +
        `produce a codeplug that reads back clean while channels transmit on ` +
        `the wrong talk group.\n\n` +
        `Editing and adding still work. To remove one, use the vendor CPS.`
    );
  }
  return contacts.map((c, i) => ({ ...c, index: i }));
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
