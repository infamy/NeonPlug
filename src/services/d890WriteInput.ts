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
    amZones: t.amZones,
    fiveTone: t.toneLists?.fiveTone,
    twoTone: t.toneLists?.twoTone,
    gpsRoaming: t.gpsRoaming,
    powerOnDisplay: t.powerOnDisplay,
    emergencySettings: t.emergencyAlarm?.settings ?? undefined,
    emergencyContact: t.emergencyAlarm?.contact ?? undefined,
    // Position→slot. The read compacts empty slots away, so these two indexings
    // diverge the moment a zone in the middle is empty.
    zoneCurrentChannels:
      t.zoneCurrentChannels && zoneSlots.length > 0
        ? zoneCurrentChannelsBySlot(t.zoneCurrentChannels, zoneSlots)
        : undefined,
    // Derived from the zones themselves. The Zones tab's hide checkbox wrote to
    // `zone.hidden` and nothing ever turned that into slots, so it did nothing.
    hiddenZoneSlots: new Set(
      zones
        .map((z, i) => (z.hidden ? zoneSlots[i] : undefined))
        .filter((slot): slot is number => slot !== undefined)
    ),
  };
}

/** Zones and their hardware slots, as the last read staged them. */
export function d890ZoneSlots(): readonly number[] {
  return useRadioStore.getState().tables.writeOriginals?.zoneSlots ?? [];
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
