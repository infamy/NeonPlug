/**
 * AT-D890UV family protocol (BTECH DA-7X2 / DA-7XR).
 *
 * Read paths are hardware-verified against a real DA-7X2 (2026-08-25): channels,
 * zones, scan lists, talkgroups and RX groups all decode from captured bytes
 * (tests/unit/d890uvFixtures.test.ts). The WRITE path is deliberately
 * unimplemented — see writeChannels() for why that is not just a missing feature.
 *
 * Extends BaseDigitalProtocol, which supplies no-op stubs for everything not
 * overridden here. Note what is NOT implemented: `setMemoryImage`. That method
 * is optional, and `useRadioConnection` guards its clone-image restore behind
 * an `else if (protocol.setMemoryImage)` check — so this radio skips that path
 * entirely, which is correct. There is no contiguous image to restore.
 */

import { BaseDigitalProtocol } from '../shared/BaseProtocols';
import type { Channel } from '../../models/Channel';
import type { Zone } from '../../models/Zone';
import type { Contact } from '../../models/Contact';
import type { QuickContact } from '../../models/QuickContact';
import type { RXGroup } from '../../models/RXGroup';
import type { DMRRadioID } from '../../models/DMRRadioID';
import type { RadioInfo } from '../../types/radio';
import type { RadioSettings } from '../../models/RadioSettings';
import { parseD890Settings } from './settingsFormat';
import type { EncryptionKey } from '../../models/EncryptionKey';
import { log } from '../../utils/protocolLogger';
import { D890_IMAGE, D890_IMAGE_ADDRESS, D890_IMAGE_LABEL, type D890ImageKind } from './bootImage';
import { D890_ENCRYPTION_TYPE } from './constants';
import { predefinedSmsAddress, parsePredefinedSms } from './predefinedSms';
import { D890_EMERGENCY, parseEmergencySettings, parseEmergencyContact } from './emergency';
import {
  D890_BROADCAST,
  broadcastChannelAddress,
  parseBroadcastChannel,
  isVacantBroadcastChannel,
  type D890BroadcastBand,
  type D890BroadcastChannel,
} from './broadcastChannels';
import { D890_GPS_ROAMING, parseGpsRoamingTable } from './gpsRoaming';
import type { QuickTextMessage } from '../../models/QuickTextMessage';
import { D890_SATELLITE, decodeSatelliteTable, type D890SatelliteRecord } from './satellite';
import { D890Connection, openD890Port, type D890Identity } from './connection';
import {
  D890_ADDR,
  D890_LIMITS,
  D890_MODEL_IDS,
  D890_TALKGROUP_MASK_INVERTED,
} from './constants';
import {
  decodeOccupancyMask,
  occupiedIndices,
  parseZone,
  parseTalkgroup,
  parseTalkgroupQuick,
  parseRoamingChannel,
  parseRoamingZone,
  roamingChannelAddress,
  roamingZoneAddress,
  channelAddresses,
  parseEncryptionSlot,
  parseAesKeySlot,
  parseArc4KeySlot,
  aesKeyNum,
  type D890RoamingChannel,
  type D890RoamingZone,
  parseRxGroup,
  parseScanList,
  parseChannel,
  isVacantChannel,
  planChannelReads,
  zoneNameAddress,
  zoneChannelsAddress,
  talkgroupAddress,
  rxGroupAddress,
  scanListAddress,
  type ScanListDecoded,
  type D890ChannelDecode,
  parseRadioId,
  radioIdAddress,
} from './structures';
import {
  parseD890AprsSettings,
  aprsToRadioSpecific,
  type D890AprsSettings,
} from './aprs';

/**
 * Thrown for the parts of this driver that exist structurally but must not be
 * used until a radio has confirmed the layout. A distinct error type so the UI
 * can say "not implemented yet" rather than "read failed".
 */
export class D890NotVerifiedError extends Error {
  constructor(what: string, reason: string) {
    super(`${what} is not implemented for the DA-7X2/D890UV yet: ${reason}`);
    this.name = 'D890NotVerifiedError';
  }
}

export class D890UVProtocol extends BaseDigitalProtocol {
  private connection: D890Connection | null = null;
  private identity: D890Identity | null = null;

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  async connect(portOrOptions?: string | { forcePortSelection?: boolean }): Promise<void> {
    const force =
      typeof portOrOptions === 'object' && portOrOptions?.forcePortSelection === true;
    const port = await openD890Port(force);
    const conn = new D890Connection();
    await conn.open(port);
    try {
      await conn.enterProgramMode();
      const identity = await conn.identify();
      conn.assertKnownModel(identity);
      await conn.negotiateReadLength();
      this.identity = identity;
      this.connection = conn;
    } catch (err) {
      // Leave the radio in a clean state, but do NOT send END — the session
      // never got far enough to have anything worth committing.
      await conn.close();
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    if (!this.connection) return;
    try {
      await this.connection.sendEnd();
    } catch {
      // A failed END still needs the port released; the radio drops out of
      // programming mode on its own.
    }
    await this.connection.close();
    this.connection = null;
    this.identity = null;
  }

  isConnected(): boolean {
    return this.connection !== null;
  }

  async getRadioInfo(): Promise<RadioInfo> {
    const conn = this.requireConnection();
    return {
      // The NeonPlug model ID, NOT the wire string. `useRadioConnection` feeds
      // this straight into getCapabilitiesForModel(), which is keyed on
      // descriptor modelIds — and the radio reports "ID890UV", which is not one
      // of them. Returning the wire string made every capability lookup miss, so
      // supportsChannelRead/supportsZones/supportsScanLists were all silently
      // ignored. Found on hardware, not in review. FT-65 does the same thing via
      // `this.modelId`; follow that convention.
      model: D890_MODEL_IDS[0],
      firmware: this.identity?.version ?? 'unknown',
      // Not reported by this radio's identify response; the reference documents
      // only model and version.
      buildDate: '',
      maxContacts: D890_LIMITS.TALK_GROUPS_MAX,
      // The wire identity, kept so diagnostics can show what actually came back.
      radioVersion: this.identity?.model ?? 'unknown',
      // The negotiated read size is the single most useful diagnostic for this
      // radio, and codeplugVersion is the only free-form field available.
      codeplugVersion: `read=${conn.getReadLength()}B`,
    };
  }

  private requireConnection(): D890Connection {
    if (!this.connection) throw new Error('Not connected to the radio');
    return this.connection;
  }

  // -------------------------------------------------------------------------
  // Read paths
  // -------------------------------------------------------------------------

  /**
   * Read every programmed channel.
   *
   * Enabled 2026-08-25 once the 51-entry CTCSS table was derived from hardware
   * (D890UV-HARDWARE-CHECKLIST.md 6) and the DCS encoding was cracked. Both tone
   * kinds now decode, so a channel no longer reads as "no tone" when the radio
   * has one set.
   */
  async readChannels(onProgress?: (done: number, total: number) => void): Promise<Channel[]> {
    // Forwarding this matters more than it looks. Channels are the longest phase
    // of a read by a wide margin, and without a callback the progress bar sits
    // frozen through all of it — which is indistinguishable from a hung read.
    const { decoded, unresolvedTones } = await this.readChannelsPreview(onProgress);
    if (unresolvedTones > 0) {
      // Should not happen now the table is complete; if it does, the radio has a
      // tone index this build does not know and staying quiet would mean
      // exporting a channel as tone-less when it is not.
      console.warn(
        `[D890] ${unresolvedTones} channel(s) carry a CTCSS index outside the known ` +
          `51-entry table; their tones read as None. Please report this.`
      );
    }
    const channels = decoded.map((d) => d.channel);

    // VFO A and B go at the TOP of the list, not in number order.
    //
    // They carry numbers 4001/4002 so `isVFOChannel` recognises them, which
    // would sort them to the very bottom below 4000 real channels — the one
    // place nobody looks for the thing they are currently tuned to. The DM-32
    // shows them first for the same reason.
    //
    // A VFO that will not read must not cost the user their channels, so this
    // is best-effort and silent on failure beyond a log line.
    try {
      channels.unshift(...(await this.readVfoChannels()));
    } catch (err) {
      log.warn(`DA-7X2 VFO read failed: ${String(err)}`, 'D890');
    }
    return channels;
  }

  /**
   * Channel decode for diagnostics and fixture capture.
   *
   * Returns every channel with the raw tone indices alongside, and a count of
   * how many carry a tone this build cannot name. This is what turns a hardware
   * session into the CTCSS table: read channels whose tones are known from the
   * OEM CPS, and the index → Hz mapping falls out.
   *
   * Not wired into the normal read path on purpose — see readChannels().
   */
  /**
   * Raw 128-byte channel records, keyed by 1-based channel number, exactly as
   * the radio sent them.
   *
   * A write PATCHES these rather than building a record from scratch — that is
   * what keeps the ~49 fields this driver decodes but does not encode, and the
   * unnamed bytes beyond them, intact across a write. Without this map there is
   * no safe write path at all, only an unsafe one.
   */
  readonly rawChannelRecords = new Map<number, Uint8Array>();

  /**
   * The raw presence mask, as read.
   *
   * Kept because a write must PATCH it, not rebuild it: a mask rebuilt over the
   * 4000 storable slots writes zeros past them, and the radio uses slots 4000
   * and 4001 for VFO A and B. Both serial captures show byte 500 as 0x03.
   */
  rawChannelMask: Uint8Array | null = null;

  /**
   * Hardware slot index of each zone returned by `readZones`, in the same order.
   *
   * `parseZone` generates a fresh UI id and drops the slot, so without this the
   * zones array cannot be lined up against any other per-slot zone table. The
   * A/B current-channel tables are indexed by slot, so reading them against the
   * compacted zones array would attribute zone 5's channel to zone 3 the moment
   * a zone slot is empty.
   */
  readonly rawZoneIndices: number[] = [];

  async readChannelsPreview(
    onProgress?: (done: number, total: number) => void
  ): Promise<{ decoded: D890ChannelDecode[]; unresolvedTones: number }> {
    const conn = this.requireConnection();
    const mask = await conn.readMemory(D890_ADDR.CHANNEL_SET, D890_ADDR.CHANNEL_SET_SIZE);
    this.rawChannelMask = Uint8Array.from(mask);
    this.rawChannelRecords.clear();
    const present = occupiedIndices(
      decodeOccupancyMask(mask, D890_LIMITS.CHANNELS_MAX)
    );

    // Read consecutive runs in one request each rather than two frames per
    // channel. The record's two 0x40 "halves" are adjacent, and consecutive
    // channels are contiguous within a block, so a full block of 128 channels is
    // one 0x4000 read instead of 256 round trips.
    const spans = planChannelReads(present);
    const decoded: D890ChannelDecode[] = [];
    let done = 0;

    for (const span of spans) {
      const buffer = await conn.readMemory(span.address, span.length);
      for (let r = 0; r < span.recordCount; r++) {
        const index = span.startIndex + r;
        const offset = r * D890_ADDR.CHANNEL_STRIDE;
        const record = buffer.subarray(offset, offset + D890_ADDR.CHANNEL_STRIDE);
        done++;
        // A record inside a run can still be vacant if the mask and the data
        // disagree; trust the data.
        if (isVacantChannel(record)) continue;
        // Copy, not a view: `buffer` covers a whole span and would keep the
        // entire run alive, and a later reader could see it mutate.
        this.rawChannelRecords.set(index + 1, Uint8Array.from(record));
        decoded.push(parseChannel(record, index));
      }
      onProgress?.(Math.min(done, present.length), present.length);
    }

    return {
      decoded,
      unresolvedTones: decoded.filter((d) => d.hasUnresolvedTone).length,
    };
  }

  /**
   * NOT IMPLEMENTED, and the bar for implementing it is high.
   *
   * The read path is hardware-verified now, but writing to this radio is a
   * different problem: the flash erase unit is 256 KB, and writing a single
   * 16-byte block can erase the entire unit containing it. A correct write path
   * must therefore read back every co-resident byte of each affected unit and
   * re-stage it, while never touching the two flash-management blocks at
   * +0x3fbf0 and +0x3fff0 of each unit (see D890_FORBIDDEN_UNIT_OFFSETS).
   *
   * Until that read-modify-write staging exists, writing would risk erasing a
   * working codeplug.
   */
  async writeChannels(_channels: Channel[]): Promise<void> {
    throw new D890NotVerifiedError(
      'Writing to the radio',
      'the 256 KB flash erase unit means one 16-byte write can erase 256 KB. ' +
        'A read-modify-write staging layer is required first and does not exist yet.'
    );
  }

  /** Zones: occupancy mask, then name + membership per occupied slot. */
  async readZones(): Promise<Zone[]> {
    const conn = this.requireConnection();
    const mask = await conn.readMemory(D890_ADDR.ZONE_SET, D890_ADDR.ZONE_SET_SIZE);
    const present = occupiedIndices(decodeOccupancyMask(mask, D890_LIMITS.ZONES_MAX));

    const zones: Zone[] = [];
    this.rawZoneIndices.length = 0;
    for (const index of present) {
      this.rawZoneIndices.push(index);
      const nameBytes = await conn.readMemory(
        zoneNameAddress(index),
        D890_ADDR.ZONE_NAME_READ
      );
      const memberBytes = await conn.readMemory(
        zoneChannelsAddress(index),
        D890_ADDR.ZONE_CHANNELS_STRIDE
      );
      zones.push(parseZone(nameBytes, memberBytes, index));
    }
    return zones;
  }

  /**
   * Talkgroups, surfaced as Contacts.
   *
   * The occupancy mask here is INVERTED — a set bit means the slot is empty.
   * The named constant is passed rather than a bare `true` so the sense is
   * legible at the call site; getting it wrong yields either nothing or ~10,000
   * phantom contacts.
   */
  async readContacts(): Promise<Contact[]> {
    const conn = this.requireConnection();
    const mask = await conn.readMemory(
      D890_ADDR.TALKGROUP_SET,
      D890_ADDR.TALKGROUP_SET_READ
    );
    const present = occupiedIndices(
      decodeOccupancyMask(
        mask,
        D890_LIMITS.TALK_GROUPS_MAX,
        D890_TALKGROUP_MASK_INVERTED
      )
    );

    const contacts: Contact[] = [];
    for (const index of present) {
      const record = await conn.readMemory(
        talkgroupAddress(index),
        D890_ADDR.TALKGROUP_READ
      );
      contacts.push(parseTalkgroup(record, index));
    }
    return contacts;
  }

  /**
   * Talkgroups as `QuickContact`s — what the Digital tab and the channel grid's
   * TX-contact dropdown actually read.
   *
   * Separate from `readContacts()` rather than derived from it: the two land in
   * different stores and the codeplug read only wants this one, so deriving would
   * mean either a second pass over the radio or a coupling between two flows that
   * have no other reason to know about each other.
   */
  async readQuickContacts(): Promise<QuickContact[]> {
    const conn = this.requireConnection();
    const mask = await conn.readMemory(
      D890_ADDR.TALKGROUP_SET,
      D890_ADDR.TALKGROUP_SET_READ
    );
    const present = occupiedIndices(
      decodeOccupancyMask(
        mask,
        D890_LIMITS.TALK_GROUPS_MAX,
        D890_TALKGROUP_MASK_INVERTED
      )
    );

    const out: QuickContact[] = [];
    for (const index of present) {
      const record = await conn.readMemory(talkgroupAddress(index), D890_ADDR.TALKGROUP_READ);
      out.push(parseTalkgroupQuick(record, index));
    }
    return out;
  }

  /**
   * Scan lists, narrowed to the shared ScanList model.
   *
   * The full decode (timers, priority encodings, revert mode) is preserved by
   * `readScanListsDetailed()`; the shared model has no home for most of it,
   * because it was shaped around the DM-32's wire format.
   */
  async readScanLists(): Promise<import('../../models/ScanList').ScanList[]> {
    const detailed = await this.readScanListsDetailed();
    return detailed.map((sl) => ({
      name: sl.name,
      channels: sl.channels,
      channelCount: sl.channels.length,
      // DM-32 wire concepts with no D890 equivalent; left at neutral defaults
      // rather than invented.
      ctcScanMode: 0,
      scanTxMode: 0,
      hangTime: sl.dwellTime,
    }));
  }

  /** Full D890 scan-list decode, without the lossy narrowing above. */
  async readScanListsDetailed(): Promise<ScanListDecoded[]> {
    const conn = this.requireConnection();
    const mask = await conn.readMemory(
      D890_ADDR.SCAN_LIST_SET,
      D890_ADDR.SCAN_LIST_SET_SIZE
    );
    const present = occupiedIndices(
      decodeOccupancyMask(mask, D890_LIMITS.SCAN_LISTS_MAX)
    );

    const lists: ScanListDecoded[] = [];
    for (const index of present) {
      const record = await conn.readMemory(
        scanListAddress(index),
        D890_ADDR.SCAN_LIST_STRIDE
      );
      lists.push(parseScanList(record, index));
    }
    return lists;
  }

  /** Receive group lists. Members are talkgroup bank indices, not DMR IDs. */
  async readRXGroups(): Promise<RXGroup[]> {
    const conn = this.requireConnection();
    const mask = await conn.readMemory(
      D890_ADDR.RX_GROUP_SET,
      D890_ADDR.RX_GROUP_SET_SIZE
    );
    const present = occupiedIndices(
      decodeOccupancyMask(mask, D890_LIMITS.RX_GROUPS_MAX)
    );

    const groups: RXGroup[] = [];
    for (const index of present) {
      const record = await conn.readMemory(
        rxGroupAddress(index),
        D890_ADDR.RX_GROUP_STRIDE
      );
      groups.push(parseRxGroup(record, index));
    }
    return groups;
  }

  /**
   * Reads the DMR radio IDs.
   *
   * Occupancy comes from the same style of mask as every other list on this
   * radio, so an ID whose bit is clear is absent no matter what its record
   * contains — the gotcha called out in ADDING_A_RADIO.md, which applies to
   * every entity type here rather than just channels.
   */
  override async readDMRRadioIDs(): Promise<DMRRadioID[]> {
    const conn = this.requireConnection();
    const set = await conn.readMemory(D890_ADDR.RADIO_ID_SET, D890_ADDR.RADIO_ID_SET_SIZE);
    const occupied = decodeOccupancyMask(set, D890_LIMITS.DMR_RADIO_IDS_MAX);
    const out: DMRRadioID[] = [];
    for (let index = 0; index < occupied.length; index += 1) {
      if (!occupied[index]) continue;
      const record = await conn.readMemory(radioIdAddress(index), D890_ADDR.RADIO_ID_STRIDE);
      out.push(parseRadioId(record, index));
    }
    return out;
  }

  /**
   * Roaming channels — the fallback frequency pairs the radio uses when roaming.
   *
   * Gated on the presence mask like every other record type here: a slot whose
   * bit is clear is absent no matter what its record contains.
   */
  async readRoamingChannels(): Promise<D890RoamingChannel[]> {
    const conn = this.requireConnection();
    const set = await conn.readMemory(
      D890_ADDR.ROAMING_CHANNEL_SET,
      D890_ADDR.ROAMING_CHANNEL_SET_SIZE
    );
    const present = occupiedIndices(
      decodeOccupancyMask(set, D890_LIMITS.ROAMING_CHANNELS_MAX)
    );
    const out: D890RoamingChannel[] = [];
    for (const index of present) {
      const record = await conn.readMemory(
        roamingChannelAddress(index),
        D890_ADDR.ROAMING_CHANNEL_STRIDE
      );
      out.push(parseRoamingChannel(record, index));
    }
    return out;
  }

  /**
   * Roaming zones.
   *
   * ⚠️ No presence mask has been found for these. The roaming-CHANNEL mask
   * at 0x2084000 covers channels only, and nothing in the RE bundle names a zone
   * equivalent. So this reads records until it finds one with no members, which
   * is a guess about how the radio marks the end of the table — unlike the
   * mask-gated reads, a stale record beyond the last real zone would be
   * returned as real. Treat the zone list as least-trustworthy until a mask
   * turns up or a codeplug with several zones proves the terminator.
   */
  async readRoamingZones(): Promise<D890RoamingZone[]> {
    const conn = this.requireConnection();
    const out: D890RoamingZone[] = [];
    for (let index = 0; index < D890_LIMITS.ROAMING_ZONES_MAX; index += 1) {
      const record = await conn.readMemory(
        roamingZoneAddress(index),
        D890_ADDR.ROAMING_ZONE_STRIDE
      );
      const zone = parseRoamingZone(record, index);
      if (zone.members.length === 0) break;
      out.push(zone);
    }
    return out;
  }

  /**
   * APRS settings.
   *
   * Confirmed field by field against the vendor CPS's own export of the same
   * codeplug — sixteen exact matches including three callsign strings and the
   * symbol pair. Returns null only when the region reads short.
   */
  async readAprsSettings(): Promise<D890AprsSettings | null> {
    const bytes = await this.readAprsSettingsRaw();
    return parseD890AprsSettings(bytes);
  }

  /** The same region undecoded, for the Diagnostics dump and for fixtures. */
  async readAprsSettingsRaw(): Promise<Uint8Array> {
    return this.requireConnection().readMemory(
      D890_ADDR.APRS_SETTINGS,
      D890_ADDR.APRS_SETTINGS_SIZE
    );
  }

  /**
   * Read VFO A and B.
   *
   * They live at channel indices 4000 and 4001 — the two slots immediately past
   * the 4000 addressable channels — and are reached through the ordinary channel
   * addressing, so no new layout is involved.
   *
   * They are read UNCONDITIONALLY rather than through the presence mask. A VFO
   * always exists; the mask covers the 4000 storable channels and says nothing
   * about these two, so gating on it would mean never reading them.
   *
   * Numbers are 1-based to match the rest of the channel list, which puts VFO A
   * at 4001 and B at 4002 — exactly what `isVFOChannel` in ChannelRow expects.
   */
  async readVfoChannels(): Promise<Channel[]> {
    const conn = this.requireConnection();
    const out: Channel[] = [];
    for (const index of [D890_ADDR.VFO_A_INDEX, D890_ADDR.VFO_B_INDEX]) {
      try {
        const { primary } = channelAddresses(index);
        const record = await conn.readMemory(primary, D890_ADDR.CHANNEL_STRIDE);
        const { channel } = parseChannel(record, index);
        // Cached under the same 1-based key as every other channel, so a writer
        // does not have to special-case them to find their original bytes.
        this.rawChannelRecords.set(index + 1, Uint8Array.from(record));
        out.push(channel);
      } catch (err) {
        log.warn(`DA-7X2 VFO at index ${index} unreadable: ${String(err)}`, 'D890');
      }
    }
    return out;
  }

  /**
   * Read pre-defined SMS — what the vendor calls "Pre-defined SMS" and what this
   * app already models as quick messages.
   *
   * Slots are read until `emptyRunLimit` consecutive empties, rather than all
   * 100. The presence mask at 0x2980000 would be the exact answer, but its
   * layout is unconfirmed, and reading 100 banked slots to find five messages is
   * 100 round trips for nothing. Stopping after a run of empties costs one extra
   * bank read in the worst case and is honest about what it assumes.
   */
  async readQuickMessages(): Promise<QuickTextMessage[]> {
    const conn = this.requireConnection();
    const out: QuickTextMessage[] = [];
    const emptyRunLimit = D890_ADDR.PREDEFINED_SMS_PER_BANK;
    let emptyRun = 0;
    for (let index = 0; index < D890_ADDR.PREDEFINED_SMS_MAX; index += 1) {
      const bytes = await conn.readMemory(
        predefinedSmsAddress(index),
        D890_ADDR.PREDEFINED_SMS_STRIDE
      );
      const text = parsePredefinedSms(bytes);
      if (text === null) {
        emptyRun += 1;
        if (emptyRun >= emptyRunLimit) break;
        continue;
      }
      emptyRun = 0;
      // `flag` and `checkValue` are DM-32 fields with no counterpart here; the
      // model requires them, so they are zero rather than invented.
      out.push({ index, text, flag: 0, checkValue: 0 });
    }
    return out;
  }

  /**
   * The current channel for each zone's A and B VFOs.
   *
   * ⚠️ THESE ARE POSITIONS IN THE ZONE'S MEMBER LIST, NOT CHANNEL NUMBERS.
   * Zone 3's stored 8 means "the 9th channel in zone 3", not channel 8. Reading
   * them as channel numbers gives a plausible number that is almost always the
   * wrong channel — which is why this returns positions and makes the caller
   * resolve them against the zone it belongs to.
   *
   * Verified against a real radio image: zone B holds [0, 1, 8, 5, 12, 5, 5]
   * across seven zones, and each lands inside that zone's own member count.
   */
  async readZoneCurrentChannels(): Promise<{ a: number[]; b: number[] }> {
    const conn = this.requireConnection();
    const size = D890_LIMITS.ZONES_MAX * 2;
    const readPositions = async (address: number): Promise<number[]> => {
      const bytes = await conn.readMemory(address, Math.ceil(size / 0x10) * 0x10);
      const out: number[] = [];
      for (let z = 0; z < D890_LIMITS.ZONES_MAX; z += 1) {
        out.push((bytes[z * 2] ?? 0) | ((bytes[z * 2 + 1] ?? 0) << 8));
      }
      return out;
    };
    return {
      a: await readPositions(D890_ADDR.ZONE_A_CHANNEL),
      b: await readPositions(D890_ADDR.ZONE_B_CHANNEL),
    };
  }

  /** Emergency / alarm settings and the contact they call. */
  async readEmergency(): Promise<{
    settings: import('./emergency').D890EmergencySettings | null;
    contact: import('./emergency').D890EmergencyContact | null;
  }> {
    const conn = this.requireConnection();
    const settingsBytes = await conn.readMemory(D890_EMERGENCY.SETTINGS, D890_EMERGENCY.SIZE);
    const contactBytes = await conn.readMemory(D890_EMERGENCY.CONTACT, D890_EMERGENCY.SIZE);
    return {
      settings: parseEmergencySettings(settingsBytes),
      contact: parseEmergencyContact(contactBytes),
    };
  }

  /** AM airband and FM broadcast channels, plus their VFO records. */
  async readBroadcastChannels(band: D890BroadcastBand): Promise<D890BroadcastChannel[]> {
    const conn = this.requireConnection();
    const spec = D890_BROADCAST[band];
    const mask = await conn.readMemory(spec.mask, band === 'am' ? 0x20 : 0x10);
    const present = occupiedIndices(decodeOccupancyMask(mask, spec.channels));
    const out: D890BroadcastChannel[] = [];
    for (const index of present) {
      const record = await conn.readMemory(broadcastChannelAddress(band, index), spec.stride);
      const ch = parseBroadcastChannel(record, index, band);
      if (!isVacantBroadcastChannel(ch)) out.push(ch);
    }
    return out;
  }

  /** The GPS Roaming geofence table. */
  async readGpsRoaming(): Promise<import('./gpsRoaming').D890GpsRoamingEntry[]> {
    const bytes = await this.requireConnection().readMemory(
      D890_GPS_ROAMING.DATA,
      D890_GPS_ROAMING.TABLE_BYTES
    );
    return parseGpsRoamingTable(bytes);
  }

  /**
   * Read the satellite table.
   *
   * Decode only — `satellite.ts` can also build the bytes, but nothing writes
   * them. Slots are returned in table order with empties dropped: the vendor
   * serializer zero-fills unused slots, so an all-zero slot means "no
   * satellite" rather than "a satellite with no name".
   */
  async readSatellites(): Promise<D890SatelliteRecord[]> {
    const bytes = await this.requireConnection().readMemory(
      D890_ADDR.SATELLITE_TABLE,
      D890_SATELLITE.TABLE_BYTES
    );
    return decodeSatelliteTable(bytes);
  }

  /**
   * Read all three encryption tables into the shared `EncryptionKey` list.
   *
   * This radio keeps a SEPARATE table per algorithm — basic 16-bit codes, AES
   * and ARC4 — where the DM-32 keeps one mixed list. They are flattened into one
   * list here because that is the shape the UI and the model already have, and
   * because a user thinks in terms of "my keys" rather than "my ARC4 table".
   * `encryptionType` is what distinguishes them, and it is what makes a key's
   * identity `(type, slot)` rather than slot alone — slot 1 exists three times.
   *
   * Only slots that are actually in use are returned. All three tables are 32
   * slots regardless, so returning every one would bury a handful of real keys
   * in 90+ empty rows.
   *
   * ⚠️ `name` is SYNTHESIZED, and kept under 10 characters because that is the
   * name field's limit — a longer label is silently truncated the moment a user
   * edits the row. None of these tables stores a name; the field exists in the
   * model because the DM-32 has one. Do not write it back expecting the radio to
   * keep it.
   *
   * The basic table's 16-bit Encryption ID is carried in `encryptionId`, which
   * exists on the model for exactly this: a channel references that ID, not the
   * slot, so dropping it would break any future channel/key cross-reference.
   *
   * ⚠️ The basic table's key passes through an XOR mask that is zero unless the
   * vendor CPS has an activation file loaded. No activation file was available,
   * so a radio programmed by an activated CPS would decode differently here.
   */
  async readEncryptionKeys(): Promise<EncryptionKey[]> {
    const conn = this.requireConnection();
    const out: EncryptionKey[] = [];
    const push = (
      id: number,
      encryptionType: number,
      key: string,
      label: string,
      encryptionId?: number
    ) => {
      out.push({ entryNumber: out.length + 1, id, name: label, encryptionType, key, encryptionId });
    };

    // Basic "Encryption Code" table: a 16-bit ID and a 16-bit key per slot.
    try {
      const ids = await conn.readMemory(
        D890_ADDR.ENCRYPTION_ID_TABLE,
        D890_ADDR.ENCRYPTION_SLOTS * D890_ADDR.ENCRYPTION_ID_STRIDE
      );
      const keys = await conn.readMemory(
        D890_ADDR.ENCRYPTION_KEY_TABLE,
        D890_ADDR.ENCRYPTION_SLOTS * D890_ADDR.ENCRYPTION_KEY_STRIDE
      );
      for (let i = 0; i < D890_ADDR.ENCRYPTION_SLOTS; i += 1) {
        const slot = parseEncryptionSlot(ids, keys, i);
        // A zero key is the factory state; the ID is populated on every slot
        // whether or not a key was ever set, so the key is what marks it used.
        if (slot.key === 0) continue;
        push(
          slot.slot,
          D890_ENCRYPTION_TYPE.BASIC,
          slot.key.toString(16).toUpperCase().padStart(4, '0'),
          `Code ${slot.slot}`,
          slot.encryptionId
        );
      }
    } catch (err) {
      log.warn(`DA-7X2 basic encryption table unreadable: ${String(err)}`, 'D890');
    }

    try {
      const aes = await conn.readMemory(
        D890_ADDR.AES_KEY_TABLE,
        D890_ADDR.ENCRYPTION_SLOTS * D890_ADDR.AES_KEY_STRIDE
      );
      for (let i = 0; i < D890_ADDR.ENCRYPTION_SLOTS; i += 1) {
        const slot = parseAesKeySlot(aes, i);
        if (slot.empty) continue;
        // aes_key_num is the key length in HEX CHARACTERS: 0x40 = 256-bit.
        const bits = aesKeyNum(aes, i) * 4;
        push(
          slot.slot,
          bits <= 128 ? D890_ENCRYPTION_TYPE.AES128 : D890_ENCRYPTION_TYPE.AES256,
          slot.keyHex,
          `AES ${slot.slot}`
        );
      }
    } catch (err) {
      log.warn(`DA-7X2 AES table unreadable: ${String(err)}`, 'D890');
    }

    try {
      const arc4 = await conn.readMemory(
        D890_ADDR.ARC4_KEY_TABLE,
        D890_ADDR.ENCRYPTION_SLOTS * D890_ADDR.ARC4_KEY_STRIDE
      );
      for (let i = 0; i < D890_ADDR.ENCRYPTION_SLOTS; i += 1) {
        const slot = parseArc4KeySlot(arc4, i);
        if (slot.empty) continue;
        push(slot.slot, D890_ENCRYPTION_TYPE.ARC4, slot.keyHex, `ARC4 ${slot.slot}`);
      }
    } catch (err) {
      log.warn(`DA-7X2 ARC4 table unreadable: ${String(err)}`, 'D890');
    }

    return out;
  }

  /**
   * Read the boot image and both standby pictures.
   *
   * All three are read on every codeplug read rather than on demand. That costs
   * 3 x 40 KB, which on this radio is seconds — it is a sparse-address protocol
   * at 921600 baud, not a clone image, so there is no whole-memory upload to sit
   * behind. Making them part of the normal read means the Settings area can just
   * show them, instead of every viewing being an explicit round trip.
   *
   * A failed image read must NOT fail the codeplug read: these are cosmetic, and
   * a radio that returns nothing for them is still fully programmable. Each is
   * therefore independent and returns null on failure.
   */
  async readImages(
    onProgress?: (percent: number, label: string) => void
  ): Promise<Record<D890ImageKind, Uint8Array | null>> {
    const out: Record<D890ImageKind, Uint8Array | null> = { boot: null, bk1: null, bk2: null };
    const kinds = ['boot', 'bk1', 'bk2'] as const;
    const total = kinds.length * D890_IMAGE.BYTES;
    let done = 0;
    for (const [i, kind] of kinds.entries()) {
      const label = `${D890_IMAGE_LABEL[kind]} (${i + 1} of ${kinds.length})`;
      try {
        out[kind] = await this.requireConnection().readMemory(
          D890_IMAGE_ADDRESS[kind],
          D890_IMAGE.BYTES,
          // Progress is reported across ALL THREE images, not per image — three
          // bars that each fill and reset tells the user less than one that
          // moves steadily to the end.
          (bytes) => onProgress?.(((done + bytes) / total) * 100, label)
        );
      } catch {
        // Leave it null; the UI distinguishes "not read" from "blank".
      }
      done += D890_IMAGE.BYTES;
      onProgress?.((done / total) * 100, label);
    }
    return out;
  }

  /**
   * Reads the general settings region.
   *
   * Read-only: `writeRadioSettings` is deliberately not implemented, so the
   * Settings tab shows the radio's state but cannot push it back. The offsets
   * are hardware-derived (DA7X2-RDT-TO-RADIO.md) but nothing has been written
   * back to a radio through this path, and a settings write on this family is a
   * read-modify-write inside a 256 KB erase unit — see D890_ERASE_UNIT.
   *
   * Returns null on a short or failed read rather than a zeroed object, so the
   * UI cannot mistake a truncated read for a radio with everything switched off.
   */
  override async readRadioSettings(): Promise<RadioSettings | null> {
    const bytes = await this.requireConnection().readMemory(
      D890_ADDR.SETTINGS,
      D890_ADDR.SETTINGS_SIZE
    );
    const radioSpecific = parseD890Settings(bytes);
    if (!radioSpecific) return null;

    // APRS lives in its own region (0x3501000), not in the settings block, but
    // it is settings from the user's point of view — so it is folded in here
    // rather than needing a second read path and a second store. A failure to
    // read it must not lose the settings we already have, hence the catch.
    try {
      const aprs = parseD890AprsSettings(await this.readAprsSettingsRaw());
      if (aprs) Object.assign(radioSpecific, aprsToRadioSpecific(aprs));
    } catch {
      /* APRS region unreadable — the rest of the settings are still good. */
    }

    return { radioSpecific } as unknown as RadioSettings;
  }

  /**
   * Raw region read, for the Diagnostics tab and for capturing the fixtures the
   * hardware checklist calls for. Returns bytes exactly as the radio sent them.
   */
  async readRawRegion(
    address: number,
    length: number,
    onProgress?: (read: number, total: number) => void
  ): Promise<Uint8Array> {
    return this.requireConnection().readMemory(address, length, onProgress);
  }
}
