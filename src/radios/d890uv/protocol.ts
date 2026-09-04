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
import type { OptionalDigitalReads } from '../optionalReads';
import type {
  D890WriteFrame,
  D890ChannelWritePlan,
  D890ReferencingTables,
} from './writePlan';
import { planChannelWrite, D890WriteRefusedError } from './writePlan';
import type { D890TableCounts } from './references';
import {
  D890_MASK_CHECKS,
  checkMaskAgainstRecords,
  blocksWriting,
  describeFindings,
  type D890IntegrityFinding,
} from './integrity';
import { dryRunWrite, type D890WriteDryRun } from './writeDryRun';
import { VENDOR_WRITE_RUNS, sliceFromReadLog, planCodeplugWrite } from './codeplugWrite';
import type { D890CodeplugWriteInput, D890CodeplugWritePlan } from './codeplugWrite';
import type { Channel } from '../../models/Channel';
import type { Zone } from '../../models/Zone';
import type { Contact } from '../../models/Contact';
import type { QuickContact } from '../../models/QuickContact';
import type { RXGroup } from '../../models/RXGroup';
import type { DMRRadioID } from '../../models/DMRRadioID';
import type { RadioInfo } from '../../types/radio';
import type { RadioSettings } from '../../models/RadioSettings';
import { parseD890Settings } from './settingsFormat';
import type { D890Settings } from './settingsFormat';
import type { EncryptionKey } from '../../models/EncryptionKey';
import { log } from '../../utils/protocolLogger';
import { D890_IMAGE, D890_IMAGE_ADDRESS, D890_IMAGE_LABEL, planImageWrite, type D890ImageKind } from './bootImage';
import { D890_ENCRYPTION_TYPE } from './constants';
import { predefinedSmsAddress, parsePredefinedSms } from './predefinedSms';
import { D890_EMERGENCY, parseEmergencySettings, parseEmergencyContact } from './emergency';
import {
  D890_BROADCAST,
  parseBroadcastChannel,
  isVacantBroadcastChannel,
  type D890BroadcastBand,
  type D890BroadcastChannel,
} from './broadcastChannels';
import { D890_GPS_ROAMING, parseGpsRoamingTable } from './gpsRoaming';
import { D890_POWER_ON, parsePowerOnDisplay } from './powerOnDisplay';
import { D890_AM_ZONES, parseAmZone, applyAmZoneTables, type D890AmZone } from './amZones';
import { D890_AUTO_REPEATER, parseAutoRepeaterOffsets } from './autoRepeater';
import {
  D890_TONES,
  parseFiveTone,
  parseTwoTone,
  type D890FiveTone,
  type D890TwoTone,
} from './tones';
import {
  D890_DIGITAL_CONTACTS,
  isEmptyContactBank,
  parseDigitalContactBank,
  type D890DigitalContact,
} from './digitalContacts';
import type { QuickTextMessage } from '../../models/QuickTextMessage';
import { D890_SATELLITE, decodeSatelliteTable, type D890SatelliteRecord } from './satellite';
import { D890Connection, openD890Port, type D890Identity } from './connection';
import {
  D890_ADDR,
  D890_LIMITS,
  D890_MODEL_IDS,
  D890_TALKGROUP_MASK_INVERTED,
  D890_BLOCK,
} from './constants';
import {
  decodeOccupancyMask,
  occupiedIndices,
  range,
  consecutiveRuns,
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

export class D890UVProtocol extends BaseDigitalProtocol implements OptionalDigitalReads {
  /**
   * Settings are folded into the whole-codeplug write, not sent on their own.
   *
   * Same contract as the Yaesu clone protocol: `writeRadioSettings` STAGES, and
   * the write that follows carries the bytes. The hook relies on this to call it
   * BEFORE the codeplug write and to clear the change flags only afterwards.
   */
  readonly bufferedSettingsWrite = true;

  /** Settings staged by `writeRadioSettings`, consumed by `writeCodeplug`. */
  private stagedSettings: Partial<D890Settings> | null = null;

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
      // Logged because it is the single biggest lever on read speed: the
      // vendor CPS uses 16-byte reads, so a fallback to 0x10 here means ~15x
      // more round trips for the same bytes. When a read feels slow, this line
      // says whether it is the protocol or the radio.
      const readLength = await conn.negotiateReadLength();
      log.info(`Negotiated read length 0x${readLength.toString(16)} (${readLength} bytes/frame)`, 'D890UV');
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

  /**
   * Send a planned write to the radio, as one session.
   *
   * The session envelope is identical to a read's, confirmed from the vendor
   * CPS's own captures of both:
   *
   *     PROGRAM -> "QX" + ACK
   *     02      -> "DMR-7X2\0V100\0" + ACK
   *     ... R frames (read) or W frames (write), each acknowledged ...
   *     END     -> ACK
   *
   * `connect()` has already done the handshake by the time this runs; END is
   * sent by `disconnect()`. What this adds is the part that matters:
   *
   * **Every frame is built and guarded BEFORE the first one is sent.** A bad
   * address or a wrong payload length then costs nothing — it throws with the
   * radio untouched, rather than half-way through a codeplug. This is the same
   * `dryRunWrite` the offline tooling uses, so what a dry run validated is
   * exactly what gets sent.
   *
   * On failure the connection is poisoned and can no longer send END, so the
   * radio does not commit a partial write. Nothing is retried: this radio
   * reboots when a write goes bad, and a retry would be aimed at a radio that
   * may already be restarting.
   */
  async runWriteSession(
    frames: readonly D890WriteFrame[],
    onProgress?: (percent: number, message: string) => void
  ): Promise<D890WriteDryRun> {
    const conn = this.requireConnection();

    // Validate the whole plan first — nothing has been sent at this point.
    const plan = dryRunWrite(frames);

    let written = 0;
    for (const frame of frames) {
      await conn.writeMemory(frame.address, frame.data);
      written += frame.data.length;
      onProgress?.((written / plan.payloadBytes) * 100, `Writing ${frame.what}...`);
    }
    return plan;
  }

  /**
   * Read every region the vendor writes that nothing else here reads.
   *
   * Not for parsing — for PRESERVING. A write on this radio has to be a whole
   * codeplug, and a region that was never read cannot be written back: the
   * planner refuses to invent bytes. So the only way to leave the codeplug
   * whole is to have the originals in hand, whether or not this driver
   * understands them.
   *
   * Driven off the vendor's own 74 write runs rather than a hand-kept list, so
   * a region the CPS writes can never be silently missing from ours. Spans
   * already in the read log are skipped, which is why this stays cheap as more
   * tables become properly modelled — it shrinks on its own.
   *
   * ⚠️ Costs real time: roughly 83 KB at ~10 KB/s, so about 8 seconds on top of
   * a codeplug read. That is the price of being able to write at all, and it is
   * charged once per read rather than per write.
   */
  async readPreserveRegions(
    onProgress?: (done: number, total: number) => void
  ): Promise<{ spans: number; bytes: number }> {
    const conn = this.requireConnection();
    const missing = VENDOR_WRITE_RUNS.filter(
      (run) => sliceFromReadLog(conn.readLog, run.address, run.bytes) === undefined
    );
    const total = missing.reduce((n, r) => n + r.bytes, 0);

    let bytes = 0;
    // Progress counts what was ATTEMPTED, not what succeeded. A region that
    // fails still consumed its share of the work, and advancing only on success
    // makes the bar freeze precisely when something is going wrong — which is
    // the least helpful moment for it to look hung.
    let attempted = 0;
    for (const run of missing) {
      // Read lengths must be 16-aligned; the vendor's runs already are, but
      // round up rather than assume — a short read would stage a partial span
      // and the write would then refuse it for the wrong reason.
      const length = Math.ceil(run.bytes / D890_BLOCK.ALIGNMENT) * D890_BLOCK.ALIGNMENT;
      try {
        await conn.readMemory(run.address, length);
        bytes += run.bytes;
      } catch (err) {
        // A region that will not read is not fatal to the READ — it only means
        // a later write cannot preserve it, and the write plan says so.
        log.warn(
          `DA-7X2 could not preserve 0x${run.address.toString(16)}: ${String(err)}`,
          'D890'
        );
      }
      attempted += run.bytes;
      onProgress?.(attempted, total);
    }
    return { spans: missing.length, bytes };
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
   * Every span this instance read, for staging into the next one.
   *
   * A write patches originals, so it needs the bytes the read saw — and the
   * write runs on a DIFFERENT protocol instance, whose connection has an empty
   * log. Without this the whole-codeplug plan skips every flat region
   * 'not-read' and the ~83 KB preservation pass is spent for nothing.
   */
  get rawReadLog(): ReadonlyMap<number, Uint8Array> | undefined {
    return this.connection?.readLog;
  }

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
    const channelMaskFinding = D890_MASK_CHECKS.channels(mask);
    if (channelMaskFinding) this.integrityFindings.push(channelMaskFinding);
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
   * Write channels.
   *
   * Hardware-verified by changed-field round trip: an edited channel written
   * from here read back changed in a later session, with its neighbours
   * untouched. That is the only proof that counts — a write-back comparison
   * inside the same session passes even when the radio kept nothing.
   *
   * The originals and the presence mask must be staged first, via
   * `setWriteOriginals` — they come from the last read and cannot be
   * reconstructed. Every record is patched, never built, and the mask is
   * patched, never rebuilt.
   *
   * `planChannelWrite` refuses before a byte is sent when a channel points at a
   * table entry that will not exist, when an original is missing, or when a
   * channel transmits outside the radio's bands. `runWriteSession` then builds
   * and guards every frame before sending the first, so an address fault costs
   * nothing.
   *
   * ⚠️ No read-back. Comparing during a write session compares against
   * pre-write contents and passes while proving nothing, and a read mid-write
   * reboots the radio. Verification is a separate session, a minute later.
   */
  /** The plan the last `writeChannels` sent, for reporting what happened. */
  lastWritePlan: D890ChannelWritePlan | null = null;

  async writeChannels(
    channels: Channel[],
    onProgress?: (percent: number, message: string) => void
  ): Promise<void> {
    // Refuse before planning. A corrupt read produces a plan that passes every
    // other gate — those check references and originals, not whether the read
    // itself was credible — and writing it back is how corruption sticks.
    if (blocksWriting(this.writeOriginals?.integrity ?? [])) {
      throw new D890WriteRefusedError(
        `Refusing to write: this codeplug did not read cleanly.\n\n` +
          describeFindings(this.writeOriginals?.integrity ?? []) +
          `\n\nRead the radio again. If it reads the same way, the codeplug on the ` +
          `radio is damaged — restore it from a backup before writing.`
      );
    }
    if (!this.writeOriginals) {
      throw new D890NotVerifiedError(
        'Writing channels',
        'the radio has not been read in this session. Every record is patched ' +
          'rather than built, so the original bytes and the presence mask must ' +
          'be read first — otherwise the fields this driver does not decode ' +
          'would be overwritten with zeros.'
      );
    }
    const plan = planChannelWrite({
      channels,
      originals: this.writeOriginals.channelRecords,
      originalMask: this.writeOriginals.channelMask,
      counts: this.writeOriginals.counts,
      referencingTables: this.writeOriginals.referencingTables,
      txBandLimits: this.writeOriginals.txBandLimits,
    });
    this.lastWritePlan = plan;
    await this.runWriteSession(plan.frames, onProgress);
  }


  /**
   * Write one 160x128 picture — boot screen or a standby background.
   *
   * ITS OWN OPERATION, deliberately not folded into the codeplug write. An
   * image is 2,560 frames on a link that moves ~10 KB/s, roughly 28 seconds and
   * four times any codeplug write we do; a picture that fails part way should
   * not leave a codeplug half-sent, and a codeplug write should not take a
   * minute and a half because three pictures rode along with it.
   *
   * NO ORIGINAL IS NEEDED, unlike every other write on this radio. The region
   * is pixels end to end — CONFIRMED 2026-09-03 from a vendor CPS capture of a
   * boot-image write: exactly 40,960 bytes at 0x3f80000, no header, no trailer,
   * nothing else in the session, and no erase step. So there is nothing
   * unmodelled to preserve and nothing to patch.
   *
   * The same capture confirmed the column-major pixel order (`x * HEIGHT + y`)
   * that `bootImage.ts` assumes: reading those bytes row-major scrambles the
   * vertical axis, column-major is smooth on both.
   *
   * ⚠️ No read-back, same rule as the codeplug write: reading mid-write reboots
   * the radio. Verify in a separate session.
   */
  async writeImage(
    kind: D890ImageKind,
    image: Uint8Array,
    onProgress?: (percent: number, message: string) => void
  ): Promise<void> {
    // planImageWrite validates the exact byte count and refuses anything else,
    // so a short buffer cannot become a partially written picture.
    const frames = planImageWrite(kind, image).map((f) => ({
      ...f,
      what: `${D890_IMAGE_LABEL[kind]} image`,
    }));
    await this.runWriteSession(frames, onProgress);
  }

  /** The plan the last `writeCodeplug` sent, for reporting what happened. */
  lastCodeplugPlan: D890CodeplugWritePlan | null = null;

  /**
   * Write the WHOLE codeplug — every region the read saw, not only what changed.
   *
   * "We write what we read" is the rule this implements. A change-only write
   * looks safer and is not: the radio's regions are interdependent, and a plan
   * assembled from diffs leaves the rest to whatever the last writer put there.
   * Regions this driver cannot encode are written back verbatim from the read
   * log rather than skipped, so the result is the codeplug that was read.
   *
   * Everything `writeChannels` refuses on, this refuses on too, and for the same
   * reasons — plus one more: a region missing from the read log is SKIPPED, not
   * zero-filled. That is why the read log is staged rather than rebuilt.
   *
   * ⚠️ No read-back. Same as `writeChannels`: a read mid-write reboots the
   * radio, and comparing inside the session proves nothing. Verify in a separate
   * session, a minute later.
   */
  /**
   * Stage settings for the codeplug write that follows.
   *
   * Sends nothing itself. The settings region is a read-modify-write — many
   * settings share a byte, so the byte must be patched, not rebuilt — and the
   * original comes from the staged read log, which only `writeCodeplug` has.
   *
   * APRS is refused rather than silently dropped. Its fields are folded into
   * `radioSpecific` on READ by `aprsToRadioSpecific`, and that mapping has no
   * inverse: there is no way to turn `aprsSourceCall` back into the
   * `D890AprsSettings` the encoder needs. Passing them through would let the
   * encoder ignore them while the UI reported success.
   */
  override async writeRadioSettings(
    settings: RadioSettings,
    options?: { changedFields?: string[] }
  ): Promise<void> {
    const changed = options?.changedFields ?? [];
    const aprsChanged = changed
      .map((f) => f.replace(/^radioSpecific\./, ''))
      .filter((f) => f.startsWith('aprs'));
    if (aprsChanged.length > 0) {
      throw new D890NotVerifiedError(
        'Writing settings',
        `APRS settings cannot be written yet (${aprsChanged.join(', ')}). They are ` +
          'read into the settings list through a one-way mapping, so there is ' +
          'nothing to encode from. Revert them to write the rest.'
      );
    }
    const raw = (settings as unknown as { radioSpecific?: Record<string, unknown> }).radioSpecific;
    if (!raw) return;
    const staged: Record<string, number> = {};
    for (const [key, value] of Object.entries(raw)) {
      if (key.startsWith('aprs')) continue;
      // Checkbox fields arrive as booleans — the profile renders any field with
      // max <= 1 as a checkbox — and `encodeD890Settings` skips anything that is
      // not a number. Two real fields land here (dateDisplayFormat,
      // simpRepeaterVoiceEnable), and skipping them silently is the same class
      // of bug as the no-op write this replaced.
      if (typeof value === 'boolean') staged[key] = value ? 1 : 0;
      else if (typeof value === 'number' && Number.isFinite(value)) staged[key] = value;
    }
    this.stagedSettings = staged as Partial<D890Settings>;
  }

  async writeCodeplug(
    channels: Channel[],
    zones: Zone[],
    zoneSlots: readonly number[],
    tables: D890CodeplugWriteInput['tables'],
    onProgress?: (percent: number, message: string) => void
  ): Promise<D890CodeplugWritePlan> {
    if (!this.writeOriginals) {
      throw new D890NotVerifiedError(
        'Writing the codeplug',
        'the radio has not been read in this session. Every record is patched ' +
          'rather than built, so the original bytes must be read first.'
      );
    }
    if (!this.writeOriginals.readLog || this.writeOriginals.readLog.size === 0) {
      throw new D890NotVerifiedError(
        'Writing the codeplug',
        'the read log from the last read is missing, so the regions this driver ' +
          'does not decode have no original bytes to write back. Read the radio ' +
          'again before writing.'
      );
    }

    const plan = this.planCodeplug(channels, zones, zoneSlots, tables);
    this.lastCodeplugPlan = plan;
    await this.runWriteSession(plan.frames, onProgress);
    return plan;
  }

  /**
   * Build the write plan WITHOUT sending it.
   *
   * Same code path the real write takes — same guards, same encoders, same
   * frames — so a dry run is a promise about the bytes a write would send
   * rather than a separate approximation of them. Diff it against the read log
   * with `diffPlanAgainstRead`: on an unmodified codeplug every frame should
   * come back identical, and anything that does not is a bug or a lossy decode.
   */
  planCodeplug(
    channels: Channel[],
    zones: Zone[],
    zoneSlots: readonly number[],
    tables: D890CodeplugWriteInput['tables']
  ): D890CodeplugWritePlan {
    if (!this.writeOriginals?.readLog) {
      throw new D890NotVerifiedError(
        'Planning a codeplug write',
        'the radio has not been read in this session, so there are no original ' +
          'bytes to patch.'
      );
    }
    // planCodeplugWrite runs the integrity gate itself, before building anything.
    return planCodeplugWrite({
      channels,
      zones,
      zoneSlots,
      readLog: this.writeOriginals.readLog,
      integrity: this.writeOriginals.integrity,
      channelInput: {
        originals: this.writeOriginals.channelRecords,
        originalMask: this.writeOriginals.channelMask,
        counts: this.writeOriginals.counts,
        referencingTables: this.writeOriginals.referencingTables,
        txBandLimits: this.writeOriginals.txBandLimits,
      },
      tables: this.stagedSettings ? { ...tables, settings: this.stagedSettings } : tables,
    });
  }

  /**
   * Stage what a write needs from the last read.
   *
   * Separate from the write itself because the two happen on DIFFERENT protocol
   * instances — `useRadioConnection` builds a fresh one per operation, so the
   * read's raw records are gone by the time a write starts. The caller restores
   * them from the store.
   */
  private writeOriginals: {
    channelRecords: ReadonlyMap<number, Uint8Array>;
    channelMask: Uint8Array;
    counts: D890TableCounts;
    referencingTables: D890ReferencingTables;
    txBandLimits?: { vhfMin: number; vhfMax: number; uhfMin?: number; uhfMax?: number };
    /** Findings from the read these originals came from. A blocker stops the write. */
    integrity?: readonly D890IntegrityFinding[];
    /** Every span the read saw. Required by the whole-codeplug write, which
     *  patches regions this driver does not model and must have their bytes. */
    readLog?: ReadonlyMap<number, Uint8Array>;
    /** Hardware slot per zone, by array position. */
    zoneSlots?: readonly number[];
    /** Zone id -> slot, and zone id -> current A/B. Stable across edits, which
     *  array position is not. */
    zoneSlotById?: Readonly<Record<string, number>>;
    zoneCurrentById?: Readonly<Record<string, { a: number; b: number }>>;
  } | null = null;

  setWriteOriginals(originals: NonNullable<D890UVProtocol['writeOriginals']>): void {
    this.writeOriginals = originals;
  }

  /**
   * Findings from the last read. Empty on a healthy codeplug.
   *
   * Populated as regions are read rather than in a separate pass, because the
   * masks are already in hand there and a second read to re-check them would
   * cost seconds on a link that moves ~10 KB/s.
   */
  readonly integrityFindings: D890IntegrityFinding[] = [];

  /** Zones: occupancy mask, then name + membership per occupied slot. */
  async readZones(): Promise<Zone[]> {
    const conn = this.requireConnection();
    const mask = await conn.readMemory(D890_ADDR.ZONE_SET, D890_ADDR.ZONE_SET_SIZE);

    // An all-0xFF mask is erased flash, not 250 zones. Reported rather than
    // silently normalised: a read that quietly "fixes" a corrupt radio hides
    // the corruption, and the next write would send the fiction back.
    const maskFinding = D890_MASK_CHECKS.zones(mask);
    if (maskFinding) this.integrityFindings.push(maskFinding);

    const present = occupiedIndices(decodeOccupancyMask(mask, D890_LIMITS.ZONES_MAX));

    // A second, independent mask over the same slots — NOT a variant of the
    // presence one. A hidden zone is still a present zone: it keeps its channels
    // and must still be read, it is just absent from the radio's zone menu.
    const hideBytes = await conn.readMemory(D890_ADDR.ZONE_HIDE, D890_ADDR.ZONE_HIDE_SIZE);
    const hideFinding = D890_MASK_CHECKS.hiddenZones(hideBytes);
    if (hideFinding) this.integrityFindings.push(hideFinding);
    const hidden = decodeOccupancyMask(hideBytes, D890_LIMITS.ZONES_MAX);


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
      zones.push(parseZone(nameBytes, memberBytes, index, hidden[index] === true));
    }

    // Even an intact mask can disagree with the records behind it. A record is
    // self-describing; a bit is not, so the records are the ones to believe.
    const withContent = zones.filter(
      (z) => (z.channels?.length ?? 0) > 0 || !/^Zone \d+$/.test(z.name)
    ).length;
    const crossCheck = checkMaskAgainstRecords('zone', zones.length, withContent);
    if (crossCheck) this.integrityFindings.push(crossCheck);

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

  /**
   * Read a strided table by asking its presence mask which slots are stored.
   *
   * This is the shape the vendor CPS uses for every such table. Found in its
   * own serial capture (`7x2_read_new.txt`) and **CONFIRMED ON HARDWARE
   * 2026-09-01** — AM, FM, AM zones and both tone lists all read correctly off
   * a radio through this path. In every case the mask is read first and then
   * exactly as many records are fetched as the mask has bits set:
   *
   *   AM channels  mask 0x3884200 = 07  ->  192 B / 0x40 = 3 records
   *   AM zones     mask 0x3884400 = 01  ->  128 B / 0x80 = 1 record
   *   5-Tone       mask 0x3481900 = 03  ->  128 B / 0x40 = 2 records
   *   2-Tone       mask 0x3482800 = 03  ->   64 B / 0x20 = 2 records
   *
   * Polarity is SET = PRESENT in all four.
   *
   * This matters because the link is byte-limited at ~10 KB/s — reading a whole
   * table to find two records is most of a codeplug read. Unlike the CPS, which
   * asks in 16-byte frames throughout, we keep the negotiated read length, so
   * three AM records are one 192-byte request rather than twelve 16-byte ones.
   *
   * Two safety properties, both deliberate:
   *  - the mask only decides HOW MUCH to read. The caller still parses each
   *    record and decides whether it is vacant, so a wrongly-set bit costs a
   *    few bytes and never invents an entry.
   *  - a mask that decodes to nothing is not believed. Erased flash reads 0xFF
   *    ("all present", so the whole table) and an all-zero mask falls back to
   *    the whole table too — which is exactly what these reads did before.
   */
  private async readMaskedSlots(
    maskAddress: number,
    dataAddress: number,
    stride: number,
    slots: number
  ): Promise<{ index: number; bytes: Uint8Array }[]> {
    const conn = this.requireConnection();
    const maskLength = Math.ceil(Math.ceil(slots / 8) / D890_BLOCK.ALIGNMENT) * D890_BLOCK.ALIGNMENT;
    const present = occupiedIndices(
      decodeOccupancyMask(await conn.readMemory(maskAddress, maskLength), slots)
    );
    const wanted = present.length > 0 ? present : range(slots);

    const out: { index: number; bytes: Uint8Array }[] = [];
    for (const run of consecutiveRuns(wanted)) {
      const bytes = await conn.readMemory(dataAddress + run.start * stride, run.count * stride);
      for (let i = 0; i < run.count; i += 1) {
        out.push({
          index: run.start + i,
          bytes: bytes.subarray(i * stride, (i + 1) * stride),
        });
      }
    }
    return out;
  }

  /** AM airband and FM broadcast channels, plus their VFO records. */
  async readBroadcastChannels(band: D890BroadcastBand): Promise<D890BroadcastChannel[]> {
    const conn = this.requireConnection();
    const spec = D890_BROADCAST[band];

    // The scan ("Add") flag is a SEPARATE flat mask, and only FM has one here.
    // AM's equivalent is per AM-zone (`AmChannelList_CH_Scan`) inside the zone
    // table, so AM channels come back with scanAdd undefined rather than a
    // fabricated false.
    const scanMaskAddr = 'scanMask' in spec ? spec.scanMask : undefined;
    const scan = scanMaskAddr === undefined
      ? undefined
      : decodeOccupancyMask(await conn.readMemory(scanMaskAddr, 0x10), spec.channels);

    const out: D890BroadcastChannel[] = [];
    for (const slot of await this.readMaskedSlots(
      spec.mask, spec.data, spec.stride, spec.channels
    )) {
      const ch = parseBroadcastChannel(slot.bytes, slot.index, band);
      if (isVacantBroadcastChannel(ch)) continue;
      out.push(scan === undefined ? ch : { ...ch, scanAdd: scan[slot.index] === true });
    }
    return out;
  }

  /**
   * The FM VFO — the 101st FM memory.
   *
   * Confirmed by the CPS's own help text on the FM node: "101 FMs (100 Normal
   * FMs + VFO FM)". It sits outside the numbered table and has no mask bit, so
   * it is read directly rather than filtered by occupancy.
   *
   * AM has an equivalent address in D890_BROADCAST, but it is NOT read here:
   * `recordLayout.ts` calls 0x3884000 the AM mask region while broadcastChannels
   * calls it the AM VFO, and that disagreement is unresolved. Reading a wrong
   * region would invent an airband memory.
   */
  /**
   * The AM airband receiver's own tuning record — what the radio is on in VFO
   * mode, as opposed to a stored memory.
   *
   * Same shape as an AM channel (BCD frequency at +0x00, UTF-16LE name at
   * +0x04), CONFIRMED 2026-09-03 from a vendor CPS write capture where this
   * record's name changed to "AM-256" while its frequency bytes stayed put.
   * `recordLayout.ts` had called it a VFO/tuning record on inference; the
   * capture made it an observation.
   *
   * It has no presence-mask bit — it is tuning state, not a memory — so
   * vacancy is decided by the record's own contents, exactly as for FM.
   */
  async readAmVfo(): Promise<D890BroadcastChannel | null> {
    const spec = D890_BROADCAST.am;
    const bytes = await this.requireConnection().readMemory(spec.vfo, spec.stride);
    const ch = parseBroadcastChannel(bytes, spec.channels, 'am');
    return isVacantBroadcastChannel(ch) ? null : ch;
  }

  async readFmVfo(): Promise<D890BroadcastChannel | null> {
    const spec = D890_BROADCAST.fm;
    const bytes = await this.requireConnection().readMemory(spec.vfo, spec.stride);
    const ch = parseBroadcastChannel(bytes, spec.channels, 'fm');
    return isVacantBroadcastChannel(ch) ? null : ch;
  }

  /**
   * The DMR contact database — the CPS's Digital Contact List, and the source
   * of its Friends List.
   *
   * SLOW BY NATURE: the vendor CPS spends ~1,025,000 frames and 16.4 MB here.
   * This stops at the first empty bank instead of walking all 83, which on a
   * radio with a partly-filled database is the difference between seconds and
   * many minutes. Never call this from a codeplug read.
   */
  async readDigitalContacts(
    onProgress?: (percent: number, message: string) => void
  ): Promise<D890DigitalContact[]> {
    const conn = this.requireConnection();
    const out: D890DigitalContact[] = [];

    // Find out how much work there actually is BEFORE reporting any progress.
    //
    // A bank is 200,000 bytes; its first 16 tell you whether it holds anything.
    // Probing all 83 costs 83 small reads — about a fifth of a second at this
    // radio's ~10 KB/s — and buys an honest denominator. Without it the bar is
    // measured against 83 banks while the loop stops at the first empty one, so
    // a half-full database crawls to 10% and then snaps to done.
    //
    // It also handles a GAP correctly. Stopping at the first empty bank assumes
    // the database is dense from the start; probing does not have to assume it.
    const probeSize = 0x10;
    const populated: number[] = [];
    for (let bank = 0; bank < D890_DIGITAL_CONTACTS.BANKS; bank += 1) {
      const address = D890_DIGITAL_CONTACTS.BASE + bank * D890_DIGITAL_CONTACTS.BANK_STRIDE;
      const head = await conn.readMemory(address, probeSize);
      if (!isEmptyContactBank(head)) populated.push(bank);
    }
    if (populated.length === 0) return out;

    const startedAt = Date.now();
    let bytesRead = 0;

    for (const [done, bank] of populated.entries()) {
      const address = D890_DIGITAL_CONTACTS.BASE + bank * D890_DIGITAL_CONTACTS.BANK_STRIDE;
      const bytes = await conn.readMemory(address, D890_DIGITAL_CONTACTS.BANK_BYTES);
      bytesRead += bytes.length;
      out.push(...parseDigitalContactBank(bytes));

      const seconds = (Date.now() - startedAt) / 1000;
      const rate = seconds > 0 ? Math.round(bytesRead / 1024 / seconds) : 0;
      onProgress?.(
        Math.round(((done + 1) / populated.length) * 100),
        `Read ${out.length.toLocaleString()} contacts · `
        + `${Math.round(bytesRead / 1024).toLocaleString()} KB · ${rate} KB/s`
      );
    }
    log.info(
      `Digital contacts: ${out.length} records from ${populated.length} banks, `
      + `${bytesRead} bytes in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`,
      'D890UV'
    );
    return out;
  }

  /** Power-on screen text and password — outside the settings block. */
  async readPowerOnDisplay(): Promise<import('./powerOnDisplay').D890PowerOnDisplay> {
    const bytes = await this.requireConnection().readMemory(
      D890_POWER_ON.LINE_1,
      D890_POWER_ON.SPAN
    );
    return parsePowerOnDisplay(bytes);
  }

  /** The 5-Tone and 2-Tone signalling code lists. */
  async readTones(): Promise<{ fiveTone: D890FiveTone[]; twoTone: D890TwoTone[] }> {
    const five = D890_TONES.fiveTone;
    const two = D890_TONES.twoTone;

    const fiveTone: D890FiveTone[] = [];
    for (const slot of await this.readMaskedSlots(five.mask, five.address, five.stride, five.slots)) {
      const entry = parseFiveTone(slot.bytes, slot.index);
      if (entry) fiveTone.push(entry);
    }
    const twoTone: D890TwoTone[] = [];
    for (const slot of await this.readMaskedSlots(two.mask, two.address, two.stride, two.slots)) {
      const entry = parseTwoTone(slot.bytes, slot.index);
      if (entry) twoTone.push(entry);
    }
    return { fiveTone, twoTone };
  }

  /** Zones over the AM airband table — a separate system from the main zones. */
  async readAmZones(): Promise<D890AmZone[]> {
    const out: D890AmZone[] = [];
    for (const slot of await this.readMaskedSlots(
      D890_AM_ZONES.MASK, D890_AM_ZONES.ADDRESS, D890_AM_ZONES.STRIDE, D890_AM_ZONES.SLOTS
    )) {
      const zone = parseAmZone(slot.bytes, slot.index);
      if (zone) out.push(zone);
    }
    if (out.length === 0) return out;

    // A Channel and the per-zone scan bitmaps live OUTSIDE the zone record, in
    // the AM mask block. Read here rather than as separate tables because both
    // are indexed by zone slot and their values are member POSITIONS — they
    // only mean anything beside the zone they belong to.
    //
    // Two 16-byte reads. Cheap, and skipping them is what left both fields
    // invisible: a NeonPlug write never touched them, so they stayed erased and
    // the radio fell back to member 0 for every zone.
    // SEQUENTIAL, never Promise.all.
    //
    // The connection is one serial port with one request/reply stream: two
    // reads in flight interleave their frames and each consumes the other's
    // reply. Issuing these concurrently on 2026-09-03 desynchronised the
    // framing for the REST of the read — every later preserve region failed
    // with "needed 248 bytes, have 140" and the read stalled at 89%.
    const conn = this.requireConnection();
    const aChannels = await conn.readMemory(D890_AM_ZONES.A_CHANNEL_TABLE, 0x10);
    const scan = await conn.readMemory(D890_AM_ZONES.SCAN_TABLE, 0x10);
    return applyAmZoneTables(out, aChannels, scan);
  }

  /**
   * The radio's OWN DMR ID — the CPS's "MastID".
   *
   * Byte-for-byte a Radio ID record (BCD-as-hex id at +0x00, UTF-16LE name at
   * +0x04), CONFIRMED ON HARDWARE 2026-09-03: setting MastID to 16776415 /
   * "MASTERX" in the vendor CPS produced `16 77 64 15 4d 00 41 00 53 00 54 00
   * 45 00 52 00 58 00` here.
   *
   * `overrideAllTxIds` is a single byte at `MASTER_ID_OVERRIDE_TX_AT` — the
   * checkbox the vendor CPS labels **"Used"**. With it on, this ID overrides
   * the TX ID of every channel instead of each channel using its own.
   *
   * It is NOT "the record is non-empty", which is what a first look suggested:
   * with the box unticked and the values kept, the ID and name stayed exactly
   * as written and only that one byte moved.
   *
   * An all-zero record still reports null: an ID of 0 with a blank name is not
   * a radio ID, whatever the flag says.
   */
  async readMasterRadioId(): Promise<{ id: DMRRadioID; overrideAllTxIds: boolean } | null> {
    const bytes = await this.requireConnection().readMemory(
      D890_ADDR.MASTER_ID_DATA,
      D890_ADDR.MASTER_ID_SIZE
    );
    if (bytes.every((b) => b === 0)) return null;
    return {
      id: parseRadioId(bytes, 0),
      overrideAllTxIds: bytes[D890_ADDR.MASTER_ID_OVERRIDE_TX_AT] === 1,
    };
  }

  /**
   * Auto-repeater offsets — 250 u32 LE values in units of 10 Hz.
   *
   * The slot INDEX is meaningful: the settings fields `autoRepeater1Uhf` and
   * `autoRepeater1Vhf` are u8 selectors into this table, so compacting or
   * reordering it would silently repoint them at a different offset.
   */
  async readAutoRepeaterOffsets(): Promise<(number | null)[]> {
    const bytes = await this.requireConnection().readMemory(
      D890_AUTO_REPEATER.ADDRESS,
      D890_ADDR.AUTO_REPEATER_READ
    );
    return parseAutoRepeaterOffsets(bytes);
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
   * back to a radio through this path. A settings write is a read-modify-write
   * of the RECORD — many settings share a byte, so the byte must be preserved
   * and patched, not rebuilt.
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
  /** Benchmarking hook — force a read size instead of the negotiated one. */
  forceReadLength(length: number): void {
    this.requireConnection().forceReadLength(length);
  }

  /** The read size in use, negotiated or forced. */
  getReadLength(): number {
    return this.requireConnection().getReadLength();
  }

  async readRawRegion(
    address: number,
    length: number,
    onProgress?: (read: number, total: number) => void
  ): Promise<Uint8Array> {
    return this.requireConnection().readMemory(address, length, onProgress);
  }
}
