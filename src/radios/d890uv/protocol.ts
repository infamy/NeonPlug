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
import type { RXGroup } from '../../models/RXGroup';
import type { DMRRadioID } from '../../models/DMRRadioID';
import type { RadioInfo } from '../../types/radio';
import type { RadioSettings } from '../../models/RadioSettings';
import { parseD890Settings } from './settingsFormat';
import { D890Connection, openD890Port, type D890Identity } from './connection';
import {
  D890_ADDR,
  D890_LIMITS,
  D890_MODEL_IDS,
  D890_TALKGROUP_BITMAP_INVERTED,
} from './constants';
import {
  decodeOccupancyBitmap,
  occupiedIndices,
  parseZone,
  parseTalkgroup,
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
  async readChannels(): Promise<Channel[]> {
    const { decoded, unresolvedTones } = await this.readChannelsPreview();
    if (unresolvedTones > 0) {
      // Should not happen now the table is complete; if it does, the radio has a
      // tone index this build does not know and staying quiet would mean
      // exporting a channel as tone-less when it is not.
      console.warn(
        `[D890] ${unresolvedTones} channel(s) carry a CTCSS index outside the known ` +
          `51-entry table; their tones read as None. Please report this.`
      );
    }
    return decoded.map((d) => d.channel);
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
  async readChannelsPreview(
    onProgress?: (done: number, total: number) => void
  ): Promise<{ decoded: D890ChannelDecode[]; unresolvedTones: number }> {
    const conn = this.requireConnection();
    const bitmap = await conn.readMemory(D890_ADDR.CHANNEL_SET, D890_ADDR.CHANNEL_SET_SIZE);
    const present = occupiedIndices(
      decodeOccupancyBitmap(bitmap, D890_LIMITS.CHANNELS_MAX)
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
        // A record inside a run can still be vacant if the bitmap and the data
        // disagree; trust the data.
        if (isVacantChannel(record)) continue;
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

  /** Zones: occupancy bitmap, then name + membership per occupied slot. */
  async readZones(): Promise<Zone[]> {
    const conn = this.requireConnection();
    const bitmap = await conn.readMemory(D890_ADDR.ZONE_SET, D890_ADDR.ZONE_SET_SIZE);
    const present = occupiedIndices(decodeOccupancyBitmap(bitmap, D890_LIMITS.ZONES_MAX));

    const zones: Zone[] = [];
    for (const index of present) {
      const nameBytes = await conn.readMemory(
        zoneNameAddress(index),
        D890_ADDR.ZONE_NAME_LEN
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
   * The occupancy bitmap here is INVERTED — a set bit means the slot is empty.
   * The named constant is passed rather than a bare `true` so the sense is
   * legible at the call site; getting it wrong yields either nothing or ~10,000
   * phantom contacts.
   */
  async readContacts(): Promise<Contact[]> {
    const conn = this.requireConnection();
    const bitmap = await conn.readMemory(
      D890_ADDR.TALKGROUP_SET,
      D890_ADDR.TALKGROUP_SET_SIZE
    );
    const present = occupiedIndices(
      decodeOccupancyBitmap(
        bitmap,
        D890_LIMITS.TALK_GROUPS_MAX,
        D890_TALKGROUP_BITMAP_INVERTED
      )
    );

    const contacts: Contact[] = [];
    for (const index of present) {
      const record = await conn.readMemory(
        talkgroupAddress(index),
        D890_ADDR.TALKGROUP_STRIDE
      );
      contacts.push(parseTalkgroup(record, index));
    }
    return contacts;
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
    const bitmap = await conn.readMemory(
      D890_ADDR.SCAN_LIST_SET,
      D890_ADDR.SCAN_LIST_SET_SIZE
    );
    const present = occupiedIndices(
      decodeOccupancyBitmap(bitmap, D890_LIMITS.SCAN_LISTS_MAX)
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
    const bitmap = await conn.readMemory(
      D890_ADDR.RX_GROUP_SET,
      D890_ADDR.RX_GROUP_SET_SIZE
    );
    const present = occupiedIndices(
      decodeOccupancyBitmap(bitmap, D890_LIMITS.RX_GROUPS_MAX)
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
   * Occupancy comes from the same style of bitmap as every other list on this
   * radio, so an ID whose bit is clear is absent no matter what its record
   * contains — the gotcha called out in ADDING_A_RADIO.md, which applies to
   * every entity type here rather than just channels.
   */
  override async readDMRRadioIDs(): Promise<DMRRadioID[]> {
    const conn = this.requireConnection();
    const set = await conn.readMemory(D890_ADDR.RADIO_ID_SET, D890_ADDR.RADIO_ID_SET_SIZE);
    const occupied = decodeOccupancyBitmap(set, D890_LIMITS.DMR_RADIO_IDS_MAX);
    const out: DMRRadioID[] = [];
    for (let index = 0; index < occupied.length; index += 1) {
      if (!occupied[index]) continue;
      const record = await conn.readMemory(radioIdAddress(index), D890_ADDR.RADIO_ID_STRIDE);
      out.push(parseRadioId(record, index));
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
