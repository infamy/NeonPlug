/**
 * Plan a whole-codeplug write.
 *
 * The rule this exists to enforce: **write what we read.** A write that touches
 * only the channel table has been tried, and the radio was in a bad state
 * afterwards. The vendor CPS writes every region it read, every time, and until
 * there is evidence this radio tolerates less, so do we.
 *
 * Two things follow from that, and both are visible in the plan rather than
 * buried:
 *
 * 1. **Regions this driver cannot encode are NOT written.** They are left
 *    exactly as the radio holds them — which is safe on its own terms, but it
 *    means a NeonPlug write is not yet the same thing as a vendor write. The
 *    plan reports precisely which of the vendor's 74 runs it reproduces and
 *    which it skips, because "full codeplug write" is a claim that has to be
 *    checkable rather than asserted.
 * 2. **Nothing is written that was not read.** Every region takes its original
 *    from the connection's read log; a region that was never read is skipped
 *    with a reason, never built from zeros.
 *
 * Frames come out in ascending address order, which is the order the vendor's
 * own session uses. Whether the radio cares is unknown — but matching a
 * sequence that is known to work costs nothing.
 */

import type { Channel } from '../../models/Channel';
import type { Zone } from '../../models/Zone';
import { D890_ADDR, D890_ENCRYPTION_TYPE } from './constants';
import type { D890WriteFrame } from './writePlan';
import { planChannelWrite, planZoneWrite, D890WriteRefusedError } from './writePlan';
import type { D890ChannelWriteInput } from './writePlan';
import { blocksWriting, describeFindings, type D890IntegrityFinding } from './integrity';
import { planMaskedTableWrite, planSpanTableWrite, type D890MaskedTableSpec } from './writePlan';
import { planFlatRegionWrite, D890_FLAT_REGIONS } from './flatRegionWrite';
import {
  D890_MASKED_TABLES,
  applyTalkgroupToRecord,
  applyRxGroupToRecord,
  applyRadioIdToRecord,
  applyScanListToRecord,
  applyRoamingChannelToRecord,
  applyBroadcastToRecord,
  applyAmZoneToRecord,
  applyFiveToneToRecord,
  applyTwoToneToRecord,
  applyGpsRoamingToRecord,
  applyEmergencySettings,
  applyEmergencyContact,
  applyZoneHiddenMask,
  applyZoneCurrentChannels,
  applyKeySlotToRecord,
  applyEncryptionIdToRecord,
  applyEncryptionKeyRefToRecord,
} from './tableWrite';
import { encodePowerOnDisplay, type D890PowerOnDisplay } from './powerOnDisplay';
import { encodeD890Settings, type D890Settings } from './settingsFormat';
import { encodeD890AprsSettings, type D890AprsSettings } from './aprs';
import { encodePredefinedSms, predefinedSmsAddress } from './predefinedSms';
import type { D890EmergencySettings, D890EmergencyContact } from './emergency';
import { D890_GPS_ROAMING, type D890GpsRoamingEntry } from './gpsRoaming';
import type { QuickContact } from '../../models/QuickContact';
import type { RXGroup } from '../../models/RXGroup';
import type { DMRRadioID } from '../../models/DMRRadioID';
import type { EncryptionKey } from '../../models/EncryptionKey';
import type { ScanListDecoded, D890RoamingChannel } from './structures';
import type { D890BroadcastChannel } from './broadcastChannels';
import type { D890AmZone } from './amZones';
import type { D890FiveTone, D890TwoTone } from './tones';

/** A region the plan deliberately did not write, and why. */
export interface D890SkippedRegion {
  region: string;
  address: number;
  reason: 'not-read' | 'no-encoder';
  detail: string;
}

export interface D890CodeplugWritePlan {
  frames: D890WriteFrame[];
  /** Payload bytes — what reaches the radio's memory. */
  payloadBytes: number;
  /** Regions written, in address order. */
  written: { region: string; address: number; bytes: number }[];
  skipped: D890SkippedRegion[];
  /** Channels this plan marks ABSENT. Destructive; never silent. */
  clearedChannelNumbers: number[];
  /** Zone slots this plan marks ABSENT. */
  clearedZoneSlots: number[];
}

export interface D890CodeplugWriteInput {
  channels: readonly Channel[];
  zones: readonly Zone[];
  /** Hardware slot per zone, by array position — from `rawZoneIndices`. */
  zoneSlots: readonly number[];
  /**
   * Every span read from the radio, keyed by address — the connection's read
   * log. Regions absent from it are skipped, not invented.
   */
  readLog: ReadonlyMap<number, Uint8Array>;
  /** Everything `planChannelWrite` needs beyond the channels themselves. */
  channelInput: Omit<D890ChannelWriteInput, 'channels'>;
  /** Findings from the read these originals came from. A blocker refuses. */
  integrity?: readonly D890IntegrityFinding[];
  /**
   * Write back, unchanged, every region that was read but cannot be encoded.
   * Defaults to on — it is what makes a write cover the whole codeplug rather
   * than only the tables this driver models. Turn it off to see what the
   * encoders alone produce.
   */
  writeUnmodelledVerbatim?: boolean;
  /**
   * The rest of the codeplug, as read. Anything absent is simply not written —
   * the radio keeps what it holds — which is why every field is optional.
   */
  tables?: {
    talkgroups?: readonly QuickContact[];
    scanLists?: readonly ScanListDecoded[];
    rxGroups?: readonly RXGroup[];
    radioIds?: readonly DMRRadioID[];
    roamingChannels?: readonly D890RoamingChannel[];
    amChannels?: readonly D890BroadcastChannel[];
    fmChannels?: readonly D890BroadcastChannel[];
    amZones?: readonly D890AmZone[];
    fiveTone?: readonly D890FiveTone[];
    twoTone?: readonly D890TwoTone[];
    gpsRoaming?: readonly D890GpsRoamingEntry[];
    powerOnDisplay?: D890PowerOnDisplay;
    settings?: Partial<D890Settings>;
    aprs?: D890AprsSettings;
    emergencySettings?: D890EmergencySettings;
    emergencyContact?: D890EmergencyContact;
    /** Per-zone current A/B channel, keyed by hardware SLOT. Build it with
     *  `zoneCurrentChannelsBySlot` — the read's own form is indexed by POSITION
     *  in the zones array, and the two only coincide when no slot is empty. */
    zoneCurrentChannels?: {
      a: ReadonlyMap<number, number>;
      b: ReadonlyMap<number, number>;
    };
    /** Hardware slots of the zones that are hidden. */
    hiddenZoneSlots?: ReadonlySet<number>;
    /** Slot-indexed, NOT positional — `readQuickMessages` compacts empty slots
     *  away, so messages in slots 0 and 5 arrive as a 2-element list. Writing
     *  those by array position would move the second one to slot 1. */
    quickMessages?: readonly { readonly index: number; readonly text: string }[];
    /**
     * Encryption keys as read. Identity is `(encryptionType, id)`: `id` is the
     * hardware slot and `encryptionType` says which of the three tables it
     * belongs to — slot 1 exists three times over. `entryNumber` is only a
     * position in the flattened list and must never be used to place a key.
     */
    encryptionKeys?: readonly EncryptionKey[];
  };
}

/**
 * The original bytes at `address`, sliced out of whatever span covered them.
 *
 * A read does not fetch one record at a time: `readMaskedSlots` coalesces
 * consecutive occupied slots into a single request, so the log holds runs, not
 * records. Looking up a record's address directly would miss almost every one
 * of them and the write would skip tables it had perfectly good originals for.
 *
 * Returns undefined when nothing read covers the span — which the caller must
 * treat as "do not write this", never as "write zeros".
 */
export function sliceFromReadLog(
  readLog: ReadonlyMap<number, Uint8Array>,
  address: number,
  length: number
): Uint8Array | undefined {
  const exact = readLog.get(address);
  if (exact && exact.length >= length) return exact.subarray(0, length);
  for (const [base, bytes] of readLog) {
    if (address >= base && address + length <= base + bytes.length) {
      return bytes.subarray(address - base, address - base + length);
    }
  }
  return undefined;
}

/**
 * The minimal set of 16-byte frames covering whatever an encoder CHANGED.
 *
 * Writes go out in 16-byte frames, but records do not respect that grid: the
 * BASIC encryption key is 2 meaningful bytes at offset 0x10 of a 40-byte record
 * on a 40-byte stride, so a record can start mid-frame, end mid-frame, and span
 * three of them. Hand-rolling that arithmetic per call site is what produced
 * `RangeError: offset is out of bounds` on every BASIC key — 40 bytes `set()`
 * into a 16-byte buffer — and framed the wrong window for most slots besides.
 *
 * So: diff the encoder's output against the original, and emit only the frames
 * that actually contain a changed byte. Bytes inside a touched frame but
 * outside the record come from the read log, because a partial frame would zero
 * its neighbours. Deriving the span from the diff rather than from a hardcoded
 * offset also means an encoder that starts writing more bytes is covered
 * automatically.
 *
 * Returns `undefined` when a frame it needs was never read — the caller must
 * skip, never substitute zeros.
 */
export function framesForChanges(
  readLog: ReadonlyMap<number, Uint8Array>,
  recordAt: number,
  original: Uint8Array,
  updated: Uint8Array,
  what: string
): D890WriteFrame[] | undefined {
  const changed: number[] = [];
  for (let i = 0; i < updated.length; i += 1) {
    if (original[i] !== updated[i]) changed.push(i);
  }
  if (changed.length === 0) return [];

  const frameAddresses = new Set<number>();
  for (const i of changed) {
    const address = recordAt + i;
    frameAddresses.add(address - (address % 0x10));
  }

  const frames: D890WriteFrame[] = [];
  for (const frameAt of [...frameAddresses].sort((a, b) => a - b)) {
    const base = sliceFromReadLog(readLog, frameAt, 0x10);
    if (!base) return undefined;
    const data = Uint8Array.from(base);
    for (let j = 0; j < 0x10; j += 1) {
      const index = frameAt + j - recordAt;
      if (index >= 0 && index < updated.length) data[j] = updated[index]!;
    }
    frames.push({ address: frameAt, data, what });
  }
  return frames;
}

export function planCodeplugWrite(input: D890CodeplugWriteInput): D890CodeplugWritePlan {
  // Gate 0 — a read we do not trust must not be written back. Checked first
  // because every other gate reasons about a plan built ON that read.
  if (blocksWriting(input.integrity ?? [])) {
    throw new D890WriteRefusedError(
      `Refusing to write: this codeplug did not read cleanly.\n\n` +
        describeFindings(input.integrity ?? [])
    );
  }

  const frames: D890WriteFrame[] = [];
  const written: D890CodeplugWritePlan['written'] = [];
  const skipped: D890SkippedRegion[] = [];
  const clearedZoneSlots: number[] = [];

  const take = (region: string, address: number, part: readonly D890WriteFrame[]) => {
    if (part.length === 0) return;
    frames.push(...part);
    written.push({ region, address, bytes: part.reduce((n, f) => n + f.data.length, 0) });
  };

  // ── Channels, and the channel presence mask ──────────────────────────────
  const channelPlan = planChannelWrite({ ...input.channelInput, channels: input.channels });
  take('channels', D890_ADDR.CHANNEL_DATA, channelPlan.frames);

  // ── Zones: membership, names, and their shared mask ──────────────────────
  //
  // Both records come from the read log by SLOT, not by array position: empty
  // slots are dropped on read, so the two diverge as soon as one in the middle
  // is empty, and writing by position would move every later zone.
  const zoneMask = sliceFromReadLog(input.readLog, D890_ADDR.ZONE_SET, D890_ADDR.ZONE_SET_SIZE);
  if (!zoneMask) {
    skipped.push({
      region: 'zones',
      address: D890_ADDR.ZONE_SET,
      reason: 'not-read',
      detail:
        'the zone presence mask is not in the read log, so a zone write cannot be planned ' +
        'without inventing it.',
    });
  } else {
    const memberOriginals = new Map<number, Uint8Array>();
    const nameOriginals = new Map<number, Uint8Array>();
    for (const slot of input.zoneSlots) {
      // sliceFromReadLog, NOT readLog.get — `get` returns whatever span was
      // recorded at that address, and a wider read landing on the same start
      // address replaces the per-slot entry. That made zone 1's "record" 4096
      // bytes (all eight zones), so writing zone 1 also rewrote zones 2-8 with
      // their pre-edit bytes, and the radio was sent two conflicting writes for
      // the same address. Slicing to the stride is what keeps a record a record.
      const members = sliceFromReadLog(
        input.readLog,
        D890_ADDR.ZONE_CHANNELS + slot * D890_ADDR.ZONE_CHANNELS_STRIDE,
        D890_ADDR.ZONE_CHANNELS_STRIDE
      );
      // ZONE_NAME_READ, not ZONE_NAME_STRIDE: the stride is the spacing between
      // records (0x40), while the read only ever fetches ZONE_NAME_READ bytes of
      // each. Asking for the stride demands bytes that were never read, and
      // `sliceFromReadLog` correctly returns undefined — which surfaced as
      // "its name record was never read" on a codeplug that read perfectly.
      const name = sliceFromReadLog(
        input.readLog,
        D890_ADDR.ZONE_NAMES + slot * D890_ADDR.ZONE_NAME_STRIDE,
        D890_ADDR.ZONE_NAME_READ
      );
      if (members) memberOriginals.set(slot, members);
      if (name) nameOriginals.set(slot, name);
    }
    const zonePlan = planZoneWrite({
      zones: input.zones,
      slotOf: (_z, i) => input.zoneSlots[i] ?? -1,
      memberOriginals,
      nameOriginals,
      originalMask: zoneMask,
    });
    take('zones', D890_ADDR.ZONE_CHANNELS, zonePlan.frames);
    clearedZoneSlots.push(...zonePlan.cleared);
  }

  // ── Everything else that is records-plus-a-mask ──────────────────────────
  //
  // One helper for all of them: pull each record's original out of the read
  // log, pull the mask, and let planMaskedTableWrite recompute it. A table
  // whose mask was never read is skipped rather than planned against a mask we
  // would have had to invent.
  const maskedTable = <T extends { index: number }>(
    region: string,
    spec: D890MaskedTableSpec,
    entries: readonly T[] | undefined,
    encode: (original: Uint8Array, entry: T) => Uint8Array,
    span: typeof planMaskedTableWrite | typeof planSpanTableWrite = planMaskedTableWrite
  ) => {
    if (!entries) return;
    const maskBytes = Math.ceil(Math.ceil(spec.slots / 8) / 0x10) * 0x10;
    const originalMask = sliceFromReadLog(input.readLog, spec.maskAddress, maskBytes);
    if (!originalMask) {
      skipped.push({
        region, address: spec.maskAddress, reason: 'not-read',
        detail: `the ${region} presence mask is not in the read log.`,
      });
      return;
    }
    const originals = new Map<number, Uint8Array>();
    for (const e of entries) {
      const o = sliceFromReadLog(input.readLog, spec.dataAddress + e.index * spec.stride, spec.stride);
      if (o) originals.set(e.index, o);
    }
    const plan = span(spec, { entries, originals, originalMask, encode });
    take(region, spec.dataAddress, plan.frames);
  };

  const T = input.tables ?? {};
  maskedTable('talkgroups', D890_MASKED_TABLES.talkgroups, T.talkgroups,
    applyTalkgroupToRecord, planSpanTableWrite);
  // Scan lists carry their hardware slot (`ScanListDecoded.slot`), so they can
  // be placed back where the radio has them rather than by array position.
  // Mapped onto `index` because that is what the masked-table planner keys on.
  maskedTable(
    'scan lists',
    D890_MASKED_TABLES.scanLists,
    T.scanLists?.map((list) => ({ ...list, index: list.slot })),
    applyScanListToRecord
  );
  maskedTable('RX groups', D890_MASKED_TABLES.rxGroups, T.rxGroups, applyRxGroupToRecord);
  maskedTable('radio IDs', D890_MASKED_TABLES.radioIds, T.radioIds, applyRadioIdToRecord);
  maskedTable('roaming channels', D890_MASKED_TABLES.roamingChannels, T.roamingChannels,
    applyRoamingChannelToRecord);
  maskedTable('AM channels', D890_MASKED_TABLES.amChannels, T.amChannels,
    (o, c) => applyBroadcastToRecord(o, c, 'am'));
  maskedTable('FM channels', D890_MASKED_TABLES.fmChannels, T.fmChannels,
    (o, c) => applyBroadcastToRecord(o, c, 'fm'));
  maskedTable('AM zones', D890_MASKED_TABLES.amZones, T.amZones, applyAmZoneToRecord);
  maskedTable('5-Tone', D890_MASKED_TABLES.fiveTone, T.fiveTone, applyFiveToneToRecord);
  maskedTable('2-Tone', D890_MASKED_TABLES.twoTone, T.twoTone, applyTwoToneToRecord);

  // ── Flat regions: one fixed span each, no mask, no index arithmetic ───────
  const flat = (region: string, spec: { label: string; address: number; size: number },
                encoded: Uint8Array | undefined) => {
    if (!encoded) return;
    const original = sliceFromReadLog(input.readLog, spec.address, spec.size);
    if (!original) {
      skipped.push({
        region, address: spec.address, reason: 'not-read',
        detail: `${region} is not in the read log.`,
      });
      return;
    }
    take(region, spec.address, planFlatRegionWrite(spec, { original, encoded }).frames);
  };

  const R = D890_FLAT_REGIONS;
  if (T.gpsRoaming) {
    const original = sliceFromReadLog(input.readLog, R.gpsRoaming.address, R.gpsRoaming.size);
    if (original) {
      const encoded = Uint8Array.from(original);
      for (const entry of T.gpsRoaming) {
        const at = entry.index * D890_GPS_ROAMING.STRIDE;
        encoded.set(applyGpsRoamingToRecord(original.subarray(at, at + D890_GPS_ROAMING.STRIDE), entry), at);
      }
      flat('GPS roaming', R.gpsRoaming, encoded);
    }
  }
  // Each of these patches its own region's original — the encoders take the
  // bytes the radio gave us, so a region absent from the read log is simply not
  // written rather than reconstructed.
  const patched = <A>(
    region: string,
    spec: { label: string; address: number; size: number },
    value: A | undefined,
    encode: (original: Uint8Array, value: A) => Uint8Array
  ) => {
    if (value === undefined) return;
    const original = sliceFromReadLog(input.readLog, spec.address, spec.size);
    if (!original) {
      skipped.push({
        region, address: spec.address, reason: 'not-read',
        detail: `${region} is not in the read log.`,
      });
      return;
    }
    flat(region, spec, encode(original, value));
  };

  patched('power-on display', R.powerOnDisplay, T.powerOnDisplay, encodePowerOnDisplay);
  patched('settings', R.settings, T.settings, encodeD890Settings);
  patched('APRS', R.aprs, T.aprs, encodeD890AprsSettings);
  patched('emergency settings', R.emergencySettings, T.emergencySettings, applyEmergencySettings);
  patched('emergency contact', R.emergencyContact, T.emergencyContact, applyEmergencyContact);
  patched('zone hidden mask', R.zoneHidden, T.hiddenZoneSlots, applyZoneHiddenMask);
  patched('zone current channel A', R.zoneCurrentChannelA, T.zoneCurrentChannels,
    (o, v) => applyZoneCurrentChannels(o, v.a));
  patched('zone current channel B', R.zoneCurrentChannelB, T.zoneCurrentChannels,
    (o, v) => applyZoneCurrentChannels(o, v.b));

  // Pre-defined SMS: fixed-stride slots with no mask — a slot is empty when its
  // text is. Each is built rather than patched because the slot holds nothing
  // but the message, so there are no unmodelled bytes to preserve.
  if (T.quickMessages) {
    const smsFrames: D890WriteFrame[] = [];
      for (const { index, text } of T.quickMessages) {
        const record = encodePredefinedSms(text);
        // Banked exactly like talkgroups: 20 slots per bank, banks 0x80000
        // apart. Flat `base + i * stride` arithmetic put slot 20 at 0x3182800
        // when it belongs at 0x3200000 — an address that is not an SMS slot at
        // all, and that `assertWritableAddress` would not have refused. The read
        // has always used this helper; only the write had its own copy of the
        // arithmetic, and the copy was wrong.
        const base = predefinedSmsAddress(index);
        for (let off = 0; off < record.length; off += 0x10) {
          smsFrames.push({
            address: base + off,
            data: record.slice(off, off + 0x10),
            what: `SMS ${index + 1}`,
          });
        }
      }
    take('pre-defined SMS', D890_ADDR.PREDEFINED_SMS_DATA, smsFrames);
  }

  // ── Encryption: three separate tables, keyed by (type, slot) ─────────────
  //
  // `entryNumber` is a position in the flattened list the UI shows and is NOT a
  // slot — slot 1 exists in all three tables. Placing keys by it would scatter
  // them across the wrong tables. `id` is the slot and `encryptionType` picks
  // the table, which is exactly why the read carries both.
  //
  // A key's TYPE is never changed here: each key is written to the table it was
  // read from. Converting one is a delete plus a create, and
  // `applyKeySlotToRecord` refuses it outright.
  if (T.encryptionKeys?.length) {
    const byTable: { type: number; kind: 'aes' | 'arc4'; address: number; stride: number }[] = [
      { type: D890_ENCRYPTION_TYPE.AES128, kind: 'aes', address: D890_ADDR.AES_KEY_TABLE, stride: D890_ADDR.AES_KEY_STRIDE },
      { type: D890_ENCRYPTION_TYPE.AES256, kind: 'aes', address: D890_ADDR.AES_KEY_TABLE, stride: D890_ADDR.AES_KEY_STRIDE },
      { type: D890_ENCRYPTION_TYPE.ARC4, kind: 'arc4', address: D890_ADDR.ARC4_KEY_TABLE, stride: D890_ADDR.ARC4_KEY_STRIDE },
    ];
    const keyFrames: D890WriteFrame[] = [];
    for (const key of T.encryptionKeys) {
      const table = byTable.find((t) => t.type === key.encryptionType);
      if (!table) continue; // BASIC lives in its own ID/key pair, handled below.
      const at = table.address + key.id * table.stride;
      const original = sliceFromReadLog(input.readLog, at, table.stride);
      if (!original) continue;
      const record = applyKeySlotToRecord(
        original,
        { slot: key.id, keyId: original[0] ?? 0, keyHex: key.key, empty: false },
        table.kind,
        table.kind
      );
      for (let off = 0; off < record.length; off += 0x10) {
        keyFrames.push({
          address: at + off,
          data: record.slice(off, off + 0x10),
          what: `${table.kind.toUpperCase()} key ${key.id}`,
        });
      }
    }
    // The basic table is a 16-bit ID and a 16-bit key in two separate regions.
    for (const key of T.encryptionKeys) {
      if (key.encryptionType !== D890_ENCRYPTION_TYPE.BASIC) continue;
      const idAt = D890_ADDR.ENCRYPTION_ID_TABLE + key.id * D890_ADDR.ENCRYPTION_ID_STRIDE;
      const keyAt = D890_ADDR.ENCRYPTION_KEY_TABLE + key.id * D890_ADDR.ENCRYPTION_KEY_STRIDE;
      const idOriginal = sliceFromReadLog(input.readLog, idAt, D890_ADDR.ENCRYPTION_ID_STRIDE);
      const keyOriginal = sliceFromReadLog(input.readLog, keyAt, D890_ADDR.ENCRYPTION_KEY_STRIDE);
      if (!idOriginal || !keyOriginal) continue;
      // Both are sub-frame sized, so the surrounding bytes must be carried with
      // them — handing a partial frame to the radio would zero its neighbours.
      const idFrameAt = idAt - (idAt % 0x10);
      const keyFrameAt = keyAt - (keyAt % 0x10);
      const idFrame = sliceFromReadLog(input.readLog, idFrameAt, 0x10);
      const keyFrame = sliceFromReadLog(input.readLog, keyFrameAt, 0x10);
      if (!idFrame || !keyFrame) continue;
      const idOut = Uint8Array.from(idFrame);
      idOut.set(applyEncryptionIdToRecord(idOriginal, key.encryptionId ?? 0), idAt - idFrameAt);
      const keyOut = Uint8Array.from(keyFrame);
      keyOut.set(
        applyEncryptionKeyRefToRecord(keyOriginal, parseInt(key.key, 16) || 0),
        keyAt - keyFrameAt
      );
      keyFrames.push({ address: idFrameAt, data: idOut, what: `encryption ID ${key.id}` });
      keyFrames.push({ address: keyFrameAt, data: keyOut, what: `encryption key ${key.id}` });
    }
    take('encryption', D890_ADDR.AES_KEY_TABLE, keyFrames);
  }

  // ── Everything else we READ but cannot model: written back verbatim ──────
  //
  // This is what "write what we read" means literally, and it is the safest
  // thing available for a region this driver does not understand. The bytes
  // came from this radio moments ago; sending them back changes nothing about
  // its contents while leaving the codeplug whole.
  //
  // It also sidesteps a real trap. The encryption read flattens four separate
  // tables into one list keyed by position, so which table and slot a key came
  // from is gone — writing from that model would put keys back in the wrong
  // places. Verbatim has no such problem: it never interprets the bytes.
  //
  // Two rules keep it honest:
  //   - Only spans this session actually READ. Never invented, never zero-filled.
  //   - Only where nothing else already planned frames. An encoded region wins,
  //     because that is the one carrying the user's edits.
  if (input.writeUnmodelledVerbatim !== false) {
    const planned = new Set<number>();
    for (const f of frames) {
      for (let i = 0; i < f.data.length; i += 1) planned.add(f.address + i);
    }
    const verbatim: D890WriteFrame[] = [];
    for (const run of VENDOR_WRITE_RUNS) {
      for (let off = 0; off < run.bytes; off += 0x10) {
        const address = run.address + off;
        // Whole frames only: a frame half-planned and half-verbatim would mix
        // an edit with a stale original inside one 16-byte write.
        let anyPlanned = false;
        for (let i = 0; i < 0x10; i += 1) if (planned.has(address + i)) { anyPlanned = true; break; }
        if (anyPlanned) continue;
        const original = sliceFromReadLog(input.readLog, address, 0x10);
        if (!original) continue;
        verbatim.push({ address, data: Uint8Array.from(original), what: 'unchanged' });
      }
    }
    take('unmodelled regions (verbatim)', verbatim[0]?.address ?? 0, verbatim);
  }

  // Ascending address order, matching the vendor's own session. Stable, so two
  // plans over the same data produce identical frame sequences — which is what
  // makes a dry run comparable against a capture.
  frames.sort((a, b) => a.address - b.address);

  // No address may be written twice in one session.
  //
  // Two frames for one address means two different opinions about those bytes,
  // and which one survives is the radio's choice, not ours. On 2026-09-03 a
  // zone edit was silently lost exactly this way: an oversized original made
  // zone 1's write cover all eight zones, so the edited zone was written twice
  // — stale first, correct second — and the radio kept the stale one. It was
  // invisible until then because a write-back sends identical bytes both times.
  //
  // Throwing beats de-duplicating: a duplicate means some region's original was
  // the wrong size, and silently keeping one frame would paper over that while
  // still writing whatever else that oversized record covered.
  const seen = new Map<number, string>();
  for (const f of frames) {
    const prior = seen.get(f.address);
    if (prior !== undefined) {
      throw new D890WriteRefusedError(
        `Refusing to write: two frames both target 0x${f.address.toString(16)} ` +
          `("${prior}" and "${f.what}"). One of them is built from an original ` +
          `wider than its record, so writing it would also overwrite its ` +
          `neighbours. This is a planning bug, not a bad codeplug.`
      );
    }
    seen.set(f.address, f.what);
  }

  return {
    frames,
    payloadBytes: frames.reduce((n, f) => n + f.data.length, 0),
    written: written.sort((a, b) => a.address - b.address),
    skipped,
    clearedChannelNumbers: channelPlan.clearedChannelNumbers,
    clearedZoneSlots,
  };
}

/**
 * The 74 address runs the vendor CPS writes, from its own captured session.
 *
 * Kept as data so "does our write cover what the vendor's does?" is a
 * computation rather than an opinion. Sizes are the vendor's, not ours — a run
 * we cover only partially is still a gap, and this is what makes that visible.
 */
export const VENDOR_WRITE_RUNS: readonly { address: number; bytes: number }[] = [
  { address: 0x01000000, bytes: 13056 }, { address: 0x01003d80, bytes: 640 },
  { address: 0x01080000, bytes: 512 },   { address: 0x01083f00, bytes: 256 },
  { address: 0x01100000, bytes: 128 },   { address: 0x01383300, bytes: 256 },
  { address: 0x01f80f00, bytes: 512 },   { address: 0x02000000, bytes: 4096 },
  { address: 0x02080000, bytes: 256 },   { address: 0x02084000, bytes: 32 },
  { address: 0x02084080, bytes: 16 },    { address: 0x02085000, bytes: 128 },
  { address: 0x02100000, bytes: 1024 },  { address: 0x02980000, bytes: 80 },
  { address: 0x02980800, bytes: 144 },   { address: 0x03180000, bytes: 2560 },
  { address: 0x03400000, bytes: 64 },    { address: 0x03402000, bytes: 96 },
  { address: 0x03480000, bytes: 64 },    { address: 0x03481900, bytes: 112 },
  { address: 0x03481a00, bytes: 1104 },  { address: 0x03482000, bytes: 32 },
  { address: 0x03482400, bytes: 64 },    { address: 0x03482800, bytes: 64 },
  { address: 0x03482a00, bytes: 640 },   { address: 0x03482e00, bytes: 48 },
  { address: 0x03483000, bytes: 48 },    { address: 0x03483200, bytes: 1008 },
  { address: 0x03500000, bytes: 512 },   { address: 0x03500400, bytes: 1376 },
  { address: 0x03501000, bytes: 256 },   { address: 0x03501200, bytes: 96 },
  { address: 0x03501280, bytes: 48 },    { address: 0x03501300, bytes: 256 },
  { address: 0x03502000, bytes: 1280 },  { address: 0x03580000, bytes: 20464 },
  { address: 0x03585000, bytes: 64 },    { address: 0x03585100, bytes: 1344 },
  { address: 0x03600000, bytes: 32 },    { address: 0x03600040, bytes: 32 },
  { address: 0x03600080, bytes: 32 },    { address: 0x036000c0, bytes: 32 },
  { address: 0x03600100, bytes: 32 },    { address: 0x03600140, bytes: 32 },
  { address: 0x03600180, bytes: 32 },    { address: 0x036001c0, bytes: 32 },
  { address: 0x03680000, bytes: 256 },   { address: 0x03684000, bytes: 64 },
  { address: 0x03700000, bytes: 5424 },  { address: 0x03703900, bytes: 32 },
  { address: 0x03780000, bytes: 288 },   { address: 0x03780200, bytes: 288 },
  { address: 0x03800000, bytes: 128 },   { address: 0x03800100, bytes: 128 },
  { address: 0x03801000, bytes: 64 },    { address: 0x03880000, bytes: 64 },
  { address: 0x03883fc0, bytes: 128 },   { address: 0x03884200, bytes: 32 },
  { address: 0x03884400, bytes: 16 },    { address: 0x03900000, bytes: 40000 },
  { address: 0x03980000, bytes: 1264 },  { address: 0x03a00000, bytes: 1200 },
  { address: 0x03f00000, bytes: 48 },    { address: 0x04980000, bytes: 128 },
  { address: 0x04980100, bytes: 128 },   { address: 0x04b00000, bytes: 80 },
  { address: 0x04b00200, bytes: 112 },   { address: 0x04b00400, bytes: 3200 },
  { address: 0x04ba0000, bytes: 32 },    { address: 0x04c00000, bytes: 8000 },
  { address: 0x04c80000, bytes: 8000 },  { address: 0x04c82000, bytes: 8000 },
  { address: 0x18000000, bytes: 4000 },  { address: 0x18080000, bytes: 128 },
] as const;

export interface D890WriteCoverage {
  vendorRuns: number;
  runsFullyCovered: number;
  runsPartlyCovered: number;
  runsNotCovered: number;
  vendorBytes: number;
  bytesCovered: number;
  percentOfVendorBytes: number;
  /** Vendor runs this plan does not touch at all, largest first. */
  uncovered: { address: number; bytes: number }[];
}

/**
 * How much of the vendor's write this plan reproduces.
 *
 * The honest counterweight to calling anything a "full codeplug write": until
 * this reports 100%, a NeonPlug write and a vendor write are different
 * operations, and the difference is exactly the regions listed in `uncovered`.
 */
export function describeCoverage(plan: D890CodeplugWritePlan): D890WriteCoverage {
  const touched = new Set<number>();
  for (const f of plan.frames) {
    for (let i = 0; i < f.data.length; i += 1) touched.add(f.address + i);
  }
  let fully = 0, partly = 0, none = 0, bytesCovered = 0;
  const uncovered: { address: number; bytes: number }[] = [];
  for (const run of VENDOR_WRITE_RUNS) {
    let hit = 0;
    for (let i = 0; i < run.bytes; i += 1) if (touched.has(run.address + i)) hit += 1;
    bytesCovered += hit;
    if (hit === run.bytes) fully += 1;
    else if (hit > 0) partly += 1;
    else { none += 1; uncovered.push(run); }
  }
  const vendorBytes = VENDOR_WRITE_RUNS.reduce((n, r) => n + r.bytes, 0);
  return {
    vendorRuns: VENDOR_WRITE_RUNS.length,
    runsFullyCovered: fully,
    runsPartlyCovered: partly,
    runsNotCovered: none,
    vendorBytes,
    bytesCovered,
    percentOfVendorBytes: Math.round((bytesCovered / vendorBytes) * 100),
    uncovered: uncovered.sort((a, b) => b.bytes - a.bytes),
  };
}
