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
import {
  planMaskedTableWrite,
  planSpanTableWrite,
  tableRecordAddress,
  type D890MaskedTableSpec,
} from './writePlan';
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
import { encodePredefinedSms, erasedPredefinedSms, predefinedSmsAddress } from './predefinedSms';
import type { D890EmergencySettings, D890EmergencyContact } from './emergency';
import { D890_GPS_ROAMING, type D890GpsRoamingEntry } from './gpsRoaming';
import type { QuickContact } from '../../models/QuickContact';
import type { RXGroup } from '../../models/RXGroup';
import type { DMRRadioID } from '../../models/DMRRadioID';
import type { EncryptionKey } from '../../models/EncryptionKey';
import type { ScanListDecoded, D890RoamingChannel } from './structures';
import type { D890BroadcastChannel } from './broadcastChannels';
import {
  D890_TALKGROUP_LOCATOR,
  encodeTalkgroupLocator,
} from './talkgroupLocator';
import { encodeStatusMessages, type D890StatusMessage } from './statusMessages';
import { encodeHotKey, type D890HotKey } from './hotKeys';
import {
  D890_ANALOG_ADDRESS_BOOK,
  encodeAnalogContact,
  encodeAnalogSlotTable,
  type D890AnalogContact,
} from './analogAddressBook';
import {
  D890_MDC1200,
  encodeMdc1200Contact,
  encodeMdcSlotTable,
  type D890Mdc1200Contact,
} from './mdc1200';
import { D890_SMS_STORE, encodeSmsStore, type D890SmsEnvelope } from './smsStore';
import {
  D890_DTMF,
  encodeDtmfEncodeList,
  encodeDtmfSettings,
  type D890DtmfSettings,
} from './dtmf';
import type { D890AmZone } from './amZones';
import { D890_AM_ZONES, encodeAmZoneAChannels, encodeAmZoneScan } from './amZones';
import { D890_BROADCAST, encodeBroadcastScanMask } from './broadcastChannels';
import { encodeAutoRepeaterOffsets } from './autoRepeater';
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
    /** Auto-repeater offsets in MHz by slot; null clears a slot. Index is
     *  identity — the autoRepeater1Uhf/Vhf settings select by it. */
    autoRepeaterOffsets?: readonly (number | null)[];
    /** Each band's tuning record — what the receiver is on in VFO mode. Not a
     *  memory: neither has a presence-mask bit, so neither is in a masked table. */
    amVfo?: D890BroadcastChannel | null;
    fmVfo?: D890BroadcastChannel | null;
    /** The radio's own DMR ID ("MastID"). Null means the record is empty, which
     *  is how the radio represents "not used" — it has no separate flag. */
    masterRadioId?: {
      id: import('../../models/DMRRadioID').DMRRadioID;
      overrideAllTxIds: boolean;
    } | null;
    /** Hardware slots of the zones that are hidden. */
    hiddenZoneSlots?: ReadonlySet<number>;
    /** Pre-defined SMS texts keyed by TEXT SLOT (`index`), NOT list position —
     *  hot keys and SMS envelopes point at the slot, so placing by position
     *  would repoint them. Passed with `smsStore`: the chain is what the radio
     *  lists, and a text no envelope names is not a message. */
    quickMessages?: readonly { readonly index: number; readonly text: string }[];
    /** Text slots whose message was deleted, written back ERASED (0xFF) as the
     *  radio's own delete leaves them. Never also in `quickMessages`. */
    clearedQuickMessageSlots?: readonly number[];
    /**
     * Encryption keys as read. Identity is `(encryptionType, id)`: `id` is the
     * hardware slot and `encryptionType` says which of the three tables it
     * belongs to — slot 1 exists three times over. `entryNumber` is only a
     * position in the flattened list and must never be used to place a key.
     */
    encryptionKeys?: readonly EncryptionKey[];
    /**
     * Key slots the read saw that are no longer in the list — written back as
     * EMPTY records.
     *
     * Without this a delete is a silent no-op: the plan writes only the keys it
     * is given, so a removed key's record simply stays on the radio and the
     * user's deletion never happens. Zeroing the key bytes is exactly what makes
     * the parser report a slot as empty.
     */
    clearedEncryptionKeys?: readonly { encryptionType: number; id: number }[];
    /**
     * Status messages, by SLOT. A slot missing from this list has its presence
     * bit cleared and its text left alone — the mask is what the radio reads,
     * so clearing the bit is the deletion.
     */
    statusMessages?: readonly D890StatusMessage[];
    /** All 18 hot keys. Every entry is live regardless of the 0x3701510 mask. */
    hotKeys?: readonly D890HotKey[];
    /**
     * Analog (DTMF) address book, in DISPLAY order — this book COMPACTS, so the
     * write places entry i at slot i and renumbers the slot table to match. The
     * `slot` each contact was read from is deliberately ignored.
     */
    analogContacts?: readonly D890AnalogContact[];
    /** MDC1200 ("QDC") address book. Compacts exactly like the analog book. */
    mdc1200Contacts?: readonly D890Mdc1200Contact[];
    /**
     * SMS store envelopes. Does NOT compact — a deleted message retires its own
     * slot and the survivors stay where they are, which is the opposite of the
     * two address books above.
     */
    smsStore?: readonly D890SmsEnvelope[];
    /** DTMF settings and the 16 encode entries. The encode INDEX is what a
     *  channel references, so the list is written by position, gaps included. */
    dtmf?: { settings: D890DtmfSettings; encodeList: readonly string[] };
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
 * ⚠️ RUN SIZES ARE CONTENT-DEPENDENT — this list is one codeplug's snapshot.
 *
 * FOUND 2026-09-07 by parsing four vendor write captures instead of one. The
 * CPS emitted 74 runs for the codeplug this list came from, 77 for another and
 * 80 for a third: a run grows as the feature behind it gains entries. Adding
 * one analog address-book record took 0x3801000 from 64 to 128 bytes, and AM
 * zones took 0x3880000 from 64 to 1,856.
 *
 * Consequence, and it is staleness rather than corruption: the preserve pass
 * reads exactly these spans, and the planner refuses to invent bytes it never
 * read, so a region larger on the user's radio than in this list is preserved
 * only as far as the declared size and its tail keeps whatever was there. It is
 * not zeroed, and nothing outside is touched — but it is also not the user's
 * data being written back.
 *
 * Every span in the union IS covered by something — either this list or a
 * decoder that reads the region directly — EXCEPT the two MDC1200 regions,
 * which nothing reads at all.
 *
 * Before widening these numbers, note the cost is real: the preserve pass
 * already spends ~8 s of a codeplug read, and a size that does not exist on a
 * given radio is a read that may not answer.
 */
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

/**
 * Lay a record down on 16-byte frame boundaries, seeding each frame from the
 * read log so bytes the record does not own survive untouched.
 *
 * Writes are always whole frames, and a record is under no obligation to start
 * on one or to be a multiple of 16 — the encryption key record is 0x28 bytes and
 * every odd slot starts 8 bytes into a frame. Hand-rolling that at the call site
 * is what produced `offset is out of bounds`: a 40-byte record was copied into a
 * single 16-byte frame.
 *
 * Records are ACCUMULATED, not emitted one at a time: the encryption ID stride
 * is 2, so eight IDs share a frame, and consecutive key records straddle one.
 * Emitting a frame per record made each a fresh copy of the pre-edit bytes, so
 * the last one to land silently dropped every earlier edit to that frame — the
 * duplicate-address trap that a read-back cannot show you. The plan's own
 * duplicate-frame guard caught it on hardware 2026-09-10.
 *
 * A span the read never covered applies nothing, rather than inventing bytes.
 */
function frameOverlay(readLog: ReadonlyMap<number, Uint8Array>) {
  const frames = new Map<number, { data: Uint8Array; what: string }>();
  return {
    /**
     * Apply one record. Returns false if the read never covered its span, in
     * which case nothing is applied.
     */
    apply(address: number, record: Uint8Array, what: string): boolean {
      const first = address - (address % 0x10);
      const last = address + record.length - 1;
      const touched: { at: number; data: Uint8Array; what: string }[] = [];
      for (let frameAt = first; frameAt <= last; frameAt += 0x10) {
        let slot = frames.get(frameAt);
        if (!slot) {
          const base = sliceFromReadLog(readLog, frameAt, 0x10);
          if (!base) return false;
          slot = { data: Uint8Array.from(base), what };
        }
        touched.push({ at: frameAt, data: slot.data, what: slot.what });
      }
      for (const t of touched) {
        for (let i = 0; i < 0x10; i += 1) {
          const at = t.at + i;
          if (at >= address && at < address + record.length) t.data[i] = record[at - address]!;
        }
        frames.set(t.at, { data: t.data, what: t.what === what ? what : `${t.what} + ${what}` });
      }
      return true;
    },
    emit(): D890WriteFrame[] {
      return [...frames.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([address, { data, what }]) => ({ address, data, what }));
    },
  };
}

/**
 * The HARDWARE SLOT of an encryption key, from the model's 1-based `id`.
 *
 * Every encryption parser returns `slot: index + 1` — `parseEncryptionSlot`,
 * `parseAesKeySlot`, `parseArc4KeySlot` — and the reader pushes that straight
 * into `id`, which is why the UI shows "AES 1" and "Code 1" for the keys living
 * in hardware slot 0. The write used `id` as the slot directly, so every key was
 * planned ONE SLOT TOO HIGH: on the reference radio the plan wrote key 1's bytes
 * into slot 1 and key 2's into slot 2, shifting the whole table up and leaving
 * the real slot 0 untouched. Visible in all four tables at once.
 *
 * Caught by diffing the plan against the read on an UNMODIFIED codeplug, where
 * every frame must match — 2026-09-10. A read-back would have agreed with
 * itself, because the shifted keys are what the radio would then hold.
 */
function encryptionSlot(id: number, label: string): number {
  const slot = id - 1;
  if (!Number.isInteger(slot) || slot < 0 || slot >= D890_ADDR.ENCRYPTION_SLOTS) {
    throw new D890WriteRefusedError(
      `Refusing to write ${label}: id ${id} is not one of the ` +
        `${D890_ADDR.ENCRYPTION_SLOTS} slots this radio holds (ids are 1-based).`
    );
  }
  return slot;
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
    // Originals for every slot the plan could TOUCH, not just the edited ones.
    //
    // `planSpanTableWrite` writes one aligned span per bank, and this table's
    // records do not start on frame boundaries — the talkgroup stride is 0xC8,
    // so a frame routinely carries bytes from two records. It therefore demands
    // an original for every record the span covers, including neighbours nobody
    // edited, and refuses rather than filling a gap with zeros.
    //
    // Supplying only the edited entries made that refusal unreachable in
    // practice and guaranteed on first use: the very first talkgroup write
    // planned would fail claiming its own neighbour was never read. This path
    // had never run, because the table was never passed to the plan at all.
    //
    // ±1 around the range covers the frame-alignment overhang at each end.
    const bankSize = spec.bank?.size ?? spec.slots;
    const wanted = new Set<number>();
    for (const e of entries) {
      const bank = Math.floor(e.index / bankSize);
      wanted.add(e.index);
      for (const neighbour of [e.index - 1, e.index + 1]) {
        // Never cross a bank boundary: the record on the other side is half a
        // megabyte away and shares no frame with this one.
        if (neighbour < 0 || neighbour >= spec.slots) continue;
        if (Math.floor(neighbour / bankSize) !== bank) continue;
        wanted.add(neighbour);
      }
    }
    const originals = new Map<number, Uint8Array>();
    for (const slot of wanted) {
      // `tableRecordAddress`, NOT flat arithmetic: for a banked table the two
      // diverge above the first bank, and the flat answer is an address the
      // radio never uses — so every original above slot 999 came back
      // undefined and the write refused for the wrong reason.
      const o = sliceFromReadLog(input.readLog, tableRecordAddress(spec, slot), spec.stride);
      if (o) originals.set(slot, o);
    }
    const plan = span(spec, { entries, originals, originalMask, encode });
    take(region, spec.dataAddress, plan.frames);
  };

  const T = input.tables ?? {};
  maskedTable('talkgroups', D890_MASKED_TABLES.talkgroups, T.talkgroups,
    applyTalkgroupToRecord, planSpanTableWrite);

  // ── The talk group LOCATOR, at 0x3900000 ────────────────────────────────
  //
  // 40,000 bytes, one u32 per slot, and the radio uses it to FIND a record:
  //
  //     record = 0x3A00000 + (V / 1000) * 0x80000 + (V % 1000) * 0xC8
  //
  // BUILT, not patched, and written in full whenever talk groups are — which is
  // exactly what the vendor does: the same capture that writes 1,200 bytes of
  // records writes all 40,000 bytes of this. Every byte is determined by the
  // presence set, so there is nothing of the radio's own to preserve, and a
  // stale entry for a slot that is no longer present points the radio at a
  // record that is no longer there.
  //
  // ⚠️ V is the SLOT INDEX, never a packed 0..N-1. With contiguous talk groups
  // the two coincide, which is why every capture looks like an identity table
  // and why this was safe to leave unwired while only EDITS were possible. A
  // delete puts a hole in the mask and they diverge immediately.
  if (T.talkgroups) {
    const address = D890_TALKGROUP_LOCATOR.ADDRESS;
    const size = D890_TALKGROUP_LOCATOR.SLOTS * D890_TALKGROUP_LOCATOR.STRIDE;
    const slots = T.talkgroups
      .map((t) => t.index)
      .filter((i) => i >= 0 && i < D890_TALKGROUP_LOCATOR.SLOTS);
    const encoded = encodeTalkgroupLocator(slots);
    // Built from the presence set, so unlike every other region here it does
    // not need an original — but it still must not be written into a span the
    // session never read, or a partial write would leave half a table.
    if (sliceFromReadLog(input.readLog, address, size)) {
      take('talk group locator', address,
        Array.from({ length: Math.ceil(size / 0x10) }, (_, i) => ({
          address: address + i * 0x10,
          data: encoded.slice(i * 0x10, (i + 1) * 0x10),
          what: 'talk group locator',
        })));
    } else {
      skipped.push({
        region: 'talk group locator', address, reason: 'not-read',
        detail: 'the locator table is not in the read log, so a write cannot be planned ' +
          'without leaving it inconsistent with the presence mask.',
      });
    }
  }
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
  // The radio's own DMR ID. Byte-for-byte a Radio ID record, so it reuses that
  // encoder rather than duplicating the BCD/UTF-16 handling.
  if (T.masterRadioId) {
    const address = D890_ADDR.MASTER_ID_DATA;
    const original = sliceFromReadLog(input.readLog, address, D890_ADDR.MASTER_ID_SIZE);
    if (original) {
      // The ID/name reuse the Radio ID encoder. The override flag is this
      // record's own byte with no counterpart in a Radio ID — all four regular
      // records carry 0 there — so it is set separately.
      const encoded = applyRadioIdToRecord(original, T.masterRadioId.id);
      encoded[D890_ADDR.MASTER_ID_OVERRIDE_TX_AT] = T.masterRadioId.overrideAllTxIds ? 1 : 0;
      take('master radio ID', address,
        Array.from({ length: Math.ceil(encoded.length / 0x10) }, (_, i) => ({
          address: address + i * 0x10,
          data: encoded.slice(i * 0x10, (i + 1) * 0x10),
          what: 'master radio ID',
        })));
    } else {
      skipped.push({
        region: 'master radio ID', address, reason: 'not-read',
        detail: 'the master radio ID record is not in the read log.',
      });
    }
  }

  // The two VFO tuning records. Written like any other broadcast record, but
  // individually rather than through a masked table — they have no presence bit
  // and no slot, so there is no mask to plan alongside them.
  for (const [label, band, entry] of [
    ['AM VFO', 'am', T.amVfo],
    ['FM VFO', 'fm', T.fmVfo],
  ] as const) {
    if (!entry) continue;
    const address = D890_BROADCAST[band].vfo;
    const original = sliceFromReadLog(input.readLog, address, D890_BROADCAST[band].stride);
    if (!original) {
      skipped.push({ region: label, address, reason: 'not-read',
        detail: `${label} is not in the read log.` });
      continue;
    }
    const encoded = applyBroadcastToRecord(original, entry, band);
    take(label, address, Array.from({ length: Math.ceil(encoded.length / 0x10) }, (_, i) => ({
      address: address + i * 0x10,
      data: encoded.slice(i * 0x10, (i + 1) * 0x10),
      what: label,
    })));
  }

  if (T.autoRepeaterOffsets) {
    const address = D890_ADDR.AUTO_REPEATER_DATA;
    const original = sliceFromReadLog(input.readLog, address, D890_ADDR.AUTO_REPEATER_READ);
    if (original) {
      const encoded = encodeAutoRepeaterOffsets(original, T.autoRepeaterOffsets);
      take('auto-repeater offsets', address,
        Array.from({ length: Math.ceil(encoded.length / 0x10) }, (_, i) => ({
          address: address + i * 0x10,
          data: encoded.slice(i * 0x10, (i + 1) * 0x10),
          what: 'auto-repeater offsets',
        })));
    } else {
      skipped.push({ region: 'auto-repeater offsets', address, reason: 'not-read',
        detail: 'the auto-repeater table is not in the read log.' });
    }
  }

  maskedTable('AM zones', D890_MASKED_TABLES.amZones, T.amZones, applyAmZoneToRecord);

  // FM's scan mask is flat — one bit per channel index — and lives at its own
  // address inside a verbatim preserve run. Planning it explicitly is what
  // stops the verbatim pass from writing the pre-edit bytes back over an edit.
  if (T.fmChannels && 'scanMask' in D890_BROADCAST.fm) {
    const address = D890_BROADCAST.fm.scanMask;
    const original = sliceFromReadLog(input.readLog, address, 0x10);
    if (original) {
      take('FM scan mask', address, [{
        address,
        data: encodeBroadcastScanMask(original, T.fmChannels),
        what: 'FM scan mask',
      }]);
    } else {
      skipped.push({
        region: 'FM scan mask', address, reason: 'not-read',
        detail: 'the FM scan mask is not in the read log.',
      });
    }
  }

  // A Channel and the per-zone scan bitmaps sit OUTSIDE the zone records, in
  // the AM mask block. Both are patched from the read rather than rebuilt: they
  // are indexed by zone slot, and a rebuild would clear the slots belonging to
  // zones this write does not carry.
  //
  // Until 2026-09-03 neither was read or written at all, so every NeonPlug
  // write left them erased and the radio fell back to member 0 for every zone —
  // which is what made one AM channel appear as the active one everywhere.
  if (T.amZones) {
    for (const [label, address, encode] of [
      ['AM zone A channel', D890_AM_ZONES.A_CHANNEL_TABLE, encodeAmZoneAChannels],
      ['AM zone scan', D890_AM_ZONES.SCAN_TABLE, encodeAmZoneScan],
    ] as const) {
      const original = sliceFromReadLog(input.readLog, address, 0x10);
      if (!original) {
        skipped.push({
          region: label, address, reason: 'not-read',
          detail: `${label} is not in the read log.`,
        });
        continue;
      }
      const encoded = encode(original, T.amZones);
      take(label, address, [{ address, data: encoded, what: label }]);
    }
  }
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

  // ── Hot-key region: the status messages AND all 18 hot keys, one span ────
  //
  // 0x3700000..0x3701530 holds both tables. They are patched into ONE buffer
  // and emitted once, because two plans over the same span would hit the
  // duplicate-address guard below — and without that guard the second would
  // quietly carry the first's pre-edit bytes.
  //
  // The whole span is written rather than only the changed frames, and that
  // costs nothing: 0x3700000/5424 is a vendor write run, so the verbatim pass
  // already sends all 339 frames on every write. This only changes what is IN
  // them.
  if (T.statusMessages || T.hotKeys) {
    // 0x1510, NOT the full 0x1530 the reader fetches. The frame at 0x3701510 is
    // deliberately left out because it belongs to another table: it is
    // `D890_ADDR.RX_GROUP_SET`, the receive group presence mask, confirmed on
    // hardware 2026-09-10. Planning it here would collide with
    // `maskedTable('RX groups', ...)` — two frames at one address, which the
    // guard at the end of this function refuses outright.
    //
    // Nothing is lost. There is no hot key mask to write (all 18 entries are
    // live and `encodeHotKey` writes them), and the status message mask is one
    // frame lower at 0x3701500, so both encoders stay in bounds.
    const spec = { label: 'hot keys / status messages', address: 0x3700000, size: 0x1510 };
    const original = sliceFromReadLog(input.readLog, spec.address, spec.size);
    if (!original) {
      skipped.push({
        region: spec.label, address: spec.address, reason: 'not-read',
        detail: 'the hot-key region is not in the read log.',
      });
    } else {
      let encoded: Uint8Array = Uint8Array.from(original);
      if (T.statusMessages) encoded = encodeStatusMessages(encoded, T.statusMessages);
      for (const key of T.hotKeys ?? []) encoded = encodeHotKey(encoded, key.slot, key);
      flat(spec.label, spec, encoded);
    }
  }

  // ── The two address books, which both COMPACT ────────────────────────────
  //
  // Entry i is written to slot i and the slot table is rebuilt to match, so a
  // delete renumbers the survivors. That is measured behaviour on the analog
  // book (2026-09-08) and the same shape on MDC. It is the OPPOSITE of the SMS
  // store below, and having these two backwards is the single most likely bug
  // in this section — which is why each has its own round-trip test.
  //
  // A record for a slot the read never covered is built from zeros. That is
  // safe for exactly these two encoders because each writes every byte of the
  // record it models — do not generalise it to a record with unmodelled bytes.
  const addressBook = <C>(
    label: string,
    contacts: readonly C[],
    layout: { base: number; stride: number; slotTable: number; highTable: number },
    encode: (original: Uint8Array, offset: number, contact: C) => Uint8Array,
    slotTable: (occupied: readonly number[]) => [Uint8Array, Uint8Array]
  ) => {
    const recordFrames: D890WriteFrame[] = [];
    contacts.forEach((contact, slot) => {
      const at = layout.base + slot * layout.stride;
      const original =
        sliceFromReadLog(input.readLog, at, layout.stride) ?? new Uint8Array(layout.stride);
      const encoded = encode(original, 0, contact);
      for (let off = 0; off < layout.stride; off += 0x10) {
        recordFrames.push({
          address: at + off,
          data: encoded.slice(off, off + 0x10),
          what: `${label} ${slot}`,
        });
      }
    });
    take(label, layout.base, recordFrames);

    // Both halves. The high half is all zeros here because no index reaches
    // 256, but a present slot left at 0xFF would be index 0xFF00 + n — not a
    // slot that exists — so it has to be emitted, not skipped.
    const [low, high] = slotTable(contacts.map((_, i) => i));
    for (const [tableLabel, address, data] of [
      [`${label} slot table`, layout.slotTable, low],
      [`${label} slot table (high)`, layout.highTable, high],
    ] as const) {
      const tableFrames: D890WriteFrame[] = [];
      for (let off = 0; off < data.length; off += 0x10) {
        tableFrames.push({
          address: address + off,
          data: data.slice(off, off + 0x10),
          what: tableLabel,
        });
      }
      take(tableLabel, address, tableFrames);
    }
  };

  if (T.analogContacts) {
    addressBook(
      'analog contact',
      T.analogContacts,
      {
        base: D890_ANALOG_ADDRESS_BOOK.BASE,
        stride: D890_ANALOG_ADDRESS_BOOK.STRIDE,
        slotTable: D890_ANALOG_ADDRESS_BOOK.SLOT_TABLE,
        highTable: D890_ANALOG_ADDRESS_BOOK.SECOND_TABLE,
      },
      encodeAnalogContact,
      encodeAnalogSlotTable
    );
  }

  if (T.mdc1200Contacts) {
    addressBook(
      'MDC1200 contact',
      T.mdc1200Contacts,
      {
        base: D890_MDC1200.CONTACTS,
        stride: D890_MDC1200.STRIDE,
        slotTable: D890_MDC1200.CONTACTS_SLOT_TABLE,
        highTable: D890_MDC1200.CONTACTS_SLOT_TABLE + 0x100,
      },
      encodeMdc1200Contact,
      encodeMdcSlotTable
    );
  }

  // ── SMS store: a linked list that does NOT compact ───────────────────────
  //
  // Only the CHANGED envelope frames are sent, unlike the hot-key region above.
  // The vendor's own run here is 80 bytes — five envelopes — so planning all
  // 1,600 would write twenty times what the vendor ever does to a region whose
  // chain semantics we have only just decoded. A delete touches the previous
  // envelope's `next` byte and its own valid byte, and that is what goes out.
  if (T.smsStore) {
    const S = D890_SMS_STORE;
    const envelopeBytes = S.SLOTS * S.STRIDE;
    const originalEnvelopes = sliceFromReadLog(input.readLog, S.ENVELOPES, envelopeBytes);
    const originalTail = sliceFromReadLog(input.readLog, S.VALID, 0x90);
    if (!originalEnvelopes || !originalTail) {
      skipped.push({
        region: 'SMS store', address: S.ENVELOPES, reason: 'not-read',
        detail: 'the SMS envelopes or the valid/head table are not in the read log.',
      });
    } else {
      const { envelopes, valid, head } = encodeSmsStore(originalEnvelopes, T.smsStore);
      const envelopeFrames = framesForChanges(
        input.readLog, S.ENVELOPES, originalEnvelopes, envelopes, 'SMS envelope'
      );
      if (envelopeFrames) take('SMS envelopes', S.ENVELOPES, envelopeFrames);

      // The valid table and the head byte are 0x80 apart inside one 144-byte
      // vendor run, so they go out together as that whole run.
      const tail = Uint8Array.from(originalTail);
      tail.set(valid, 0);
      tail[S.HEAD - S.VALID] = head;
      flat('SMS valid table and head', { label: 'SMS valid table and head', address: S.VALID, size: 0x90 }, tail);
    }
  }

  // ── DTMF: a patched settings block and a BUILT encode list ───────────────
  //
  // The settings are patched because +0x01, +0x0c and +0x0d still have no
  // meaning and must survive untouched. The encode list is built, because the
  // index is what a channel references — an empty entry writes 0xFF rather than
  // being skipped, or every channel pointing past it would be repointed.
  if (T.dtmf) {
    patched(
      'DTMF settings',
      { label: 'DTMF settings', address: D890_DTMF.SETTINGS, size: D890_DTMF.SETTINGS_BYTES },
      T.dtmf.settings,
      encodeDtmfSettings
    );
    const encodeAddress = D890_DTMF.ENCODE;
    const encodeBytes = D890_DTMF.ENCODE_SLOTS * D890_DTMF.ENCODE_STRIDE;
    if (sliceFromReadLog(input.readLog, encodeAddress, encodeBytes)) {
      flat(
        'DTMF encode list',
        { label: 'DTMF encode list', address: encodeAddress, size: encodeBytes },
        encodeDtmfEncodeList(T.dtmf.encodeList)
      );
    } else {
      skipped.push({
        region: 'DTMF encode list', address: encodeAddress, reason: 'not-read',
        detail: 'the DTMF encode list is not in the read log.',
      });
    }
  }

  // Pre-defined SMS texts. Each is built rather than patched: the slot holds
  // nothing but the message, and the build reproduces the vendor's records byte
  // for byte (text, NUL, zeros). WHICH slots are messages is not decided here —
  // that is the SMS store chain above, and the two arrive together from
  // `d890QuickMessages`. A deleted message's slot goes out ERASED, the way the
  // radio's own delete leaves it.
  if (T.quickMessages || T.clearedQuickMessageSlots?.length) {
    const smsFrames: D890WriteFrame[] = [];
    const place = (index: number, record: Uint8Array, what: string) => {
      if (!Number.isInteger(index) || index < 0 || index >= D890_ADDR.PREDEFINED_SMS_MAX) {
        throw new D890WriteRefusedError(
          `Refusing to write: pre-defined SMS slot ${index} is outside ` +
            `0-${D890_ADDR.PREDEFINED_SMS_MAX - 1}.`
        );
      }
      // Banked exactly like talkgroups: 20 slots per bank, banks 0x80000
      // apart. Flat `base + i * stride` arithmetic put slot 20 at 0x3182800
      // when it belongs at 0x3200000 — an address that is not an SMS slot at
      // all, and that `assertWritableAddress` would not have refused. The read
      // has always used this helper; only the write had its own copy of the
      // arithmetic, and the copy was wrong.
      const base = predefinedSmsAddress(index);
      for (let off = 0; off < record.length; off += 0x10) {
        smsFrames.push({ address: base + off, data: record.slice(off, off + 0x10), what });
      }
    };
    for (const { index, text } of T.quickMessages ?? []) {
      place(index, encodePredefinedSms(text), `SMS ${index + 1}`);
    }
    for (const index of T.clearedQuickMessageSlots ?? []) {
      place(index, erasedPredefinedSms(), `SMS ${index + 1} (deleted)`);
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
  if (T.encryptionKeys?.length || T.clearedEncryptionKeys?.length) {
    const byTable: { type: number; kind: 'aes' | 'arc4'; address: number; stride: number }[] = [
      { type: D890_ENCRYPTION_TYPE.AES128, kind: 'aes', address: D890_ADDR.AES_KEY_TABLE, stride: D890_ADDR.AES_KEY_STRIDE },
      { type: D890_ENCRYPTION_TYPE.AES256, kind: 'aes', address: D890_ADDR.AES_KEY_TABLE, stride: D890_ADDR.AES_KEY_STRIDE },
      { type: D890_ENCRYPTION_TYPE.ARC4, kind: 'arc4', address: D890_ADDR.ARC4_KEY_TABLE, stride: D890_ADDR.ARC4_KEY_STRIDE },
    ];
    const keyFrames: D890WriteFrame[] = [];
    for (const key of T.encryptionKeys ?? []) {
      const table = byTable.find((t) => t.type === key.encryptionType);
      if (!table) continue; // BASIC lives in its own ID/key pair, handled below.
      const at = table.address + encryptionSlot(key.id, `${table.kind.toUpperCase()} key ${key.id}`) * table.stride;
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
    // Deleted keys: the same records, written EMPTY. A slot the user removed
    // has to be actively zeroed — writing only the surviving keys leaves the
    // deleted one exactly where it was.
    for (const gone of T.clearedEncryptionKeys ?? []) {
      const table = byTable.find((t) => t.type === gone.encryptionType);
      if (!table) continue; // BASIC is cleared below, with its own pair.
      const at = table.address + encryptionSlot(gone.id, `cleared ${table.kind.toUpperCase()} key ${gone.id}`) * table.stride;
      const original = sliceFromReadLog(input.readLog, at, table.stride);
      if (!original) continue;
      const record = applyKeySlotToRecord(
        original,
        { slot: gone.id, keyId: original[0] ?? 0, keyHex: '', empty: true },
        table.kind,
        table.kind
      );
      for (let off = 0; off < record.length; off += 0x10) {
        keyFrames.push({
          address: at + off,
          data: record.slice(off, off + 0x10),
          what: `${table.kind.toUpperCase()} key ${gone.id} (cleared)`,
        });
      }
    }

    // The basic table is a 16-bit ID and a 16-bit key in two separate regions.
    // Both are accumulated rather than emitted per key: their records share
    // frames with their neighbours, so one frame per record would have each key
    // overwrite the last one's edit.
    const basic = frameOverlay(input.readLog);
    for (const key of T.encryptionKeys ?? []) {
      if (key.encryptionType !== D890_ENCRYPTION_TYPE.BASIC) continue;
      const slot = encryptionSlot(key.id, `encryption code ${key.id}`);
      const idAt = D890_ADDR.ENCRYPTION_ID_TABLE + slot * D890_ADDR.ENCRYPTION_ID_STRIDE;
      const keyAt = D890_ADDR.ENCRYPTION_KEY_TABLE + slot * D890_ADDR.ENCRYPTION_KEY_STRIDE;
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
      // Overlay onto WHOLE frames from the read log. The ID really is sub-frame
      // sized (2 bytes) but the key record is 0x28 — only +0x10/+0x11 of it
      // carry the key, yet the encoder patches and returns all 40 bytes. Copying
      // that into a single 16-byte frame threw `offset is out of bounds` and
      // took the entire plan with it, so no write could be built at all on a
      // radio with a BASIC key. Caught by the dry run on hardware 2026-09-10.
      basic.apply(
        idAt,
        applyEncryptionIdToRecord(idOriginal, key.encryptionId ?? 0),
        `encryption ID ${key.id}`
      );
      basic.apply(
        keyAt,
        applyEncryptionKeyRefToRecord(keyOriginal, parseInt(key.key, 16) || 0),
        `encryption key ${key.id}`
      );
    }
    keyFrames.push(...basic.emit());
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

    // ── Driven by the READ LOG, not by VENDOR_WRITE_RUNS ─────────────────────
    //
    // This used to walk the vendor's captured run list. That list is the CPS's
    // own write session, which made it look authoritative — but it was captured
    // from a radio holding SIX talk groups, so it says `0x3A00000, 1200 bytes`.
    // On a radio holding 1,010, we wrote back six records and the rest had
    // nothing to restore them. 994 talk groups were destroyed on 2026-09-09
    // exactly this way, and an audit of that radio found 227,032 of the 369,920
    // bytes we had READ — 61% — would never have been written back.
    //
    // The vendor is not doing something different in kind. Its write is
    // CONTENT-SIZED: in the same capture it writes the talk group locator at
    // its full fixed 40,000 bytes and the presence mask at its full 1,264,
    // because those are fixed tables — and 1,200 bytes of RECORDS, because that
    // radio had six. Freezing all 74 lengths turned a content-sized rule into a
    // fixed one.
    //
    // The read log is that same rule derived from THIS radio: the readers fetch
    // what the presence masks say is occupied, so whatever is in the log is
    // what the radio holds. Writing all of it back is what the CPS does.
    //
    // Every byte is one the radio gave us this session, so this cannot corrupt:
    // the worst case is writing back a byte that was already there.
    // Assembled byte by byte, STITCHING ACROSS SPANS.
    //
    // `sliceFromReadLog` needs one span to cover all 16 bytes, and read spans
    // do not line up with the 16-byte write grid: the talkgroup stride is 0xC8,
    // so a frame routinely straddles two records. Using it here silently
    // dropped 8,080 bytes of a 1,010-talkgroup read — frames that were fully
    // read, just not by a single request. Skipping those is the same fault in
    // miniature as the one this change exists to fix.
    //
    // A frame is emitted only when all 16 bytes are accounted for. Partial
    // frames are dropped, never padded: the bytes we did not read are the bytes
    // we must not invent.
    const filled = new Map<number, { data: Uint8Array; seen: Uint8Array; have: number }>();
    for (const [start, bytes] of input.readLog) {
      for (let i = 0; i < bytes.length; i += 1) {
        const at = start + i;
        const frameAt = at - (at % 0x10);
        let slot = filled.get(frameAt);
        if (!slot) {
          slot = { data: new Uint8Array(0x10), seen: new Uint8Array(0x10), have: 0 };
          filled.set(frameAt, slot);
        }
        const off = at - frameAt;
        // Overlapping reads return the same bytes for the same address, so each
        // position is counted once and `have` stays a true completeness count.
        if (!slot.seen[off]) {
          slot.seen[off] = 1;
          slot.have += 1;
        }
        slot.data[off] = bytes[i]!;
      }
    }

    // Regions the driver must NEVER write, whatever is in the read log.
    //
    // Widening the preserve pass from "what the vendor writes" to "everything
    // we read" is what fixes the under-write — and it opens the opposite
    // failure: writing somewhere we have no business writing. `Local info` is
    // the radio identifying itself and is flagged `neverWrite`; today it never
    // reaches the log because `negotiateReadLength` uses `readChunk`, which
    // does not log, but that is an accident of which method reads it and not a
    // guarantee. Enforce the flag here, where the frames are actually made.
    const isForbidden = (at: number) =>
      NEVER_WRITE_RANGES.some((r) => at + 0x10 > r.from && at < r.to);

    const verbatim: D890WriteFrame[] = [];
    for (const address of [...filled.keys()].sort((a, b) => a - b)) {
      const slot = filled.get(address)!;
      if (slot.have !== 0x10) continue;
      if (isForbidden(address)) continue;
      // Whole frames only: a frame half-planned and half-verbatim would mix
      // an edit with a stale original inside one 16-byte write.
      let anyPlanned = false;
      for (let i = 0; i < 0x10; i += 1) if (planned.has(address + i)) { anyPlanned = true; break; }
      if (anyPlanned) continue;
      verbatim.push({ address, data: slot.data, what: 'unchanged' });
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
/**
 * Address ranges this driver must NEVER write, whatever a read log holds.
 *
 * Declared from `constants` rather than derived from `D890_MEMORY_MAP` on
 * purpose: importing the memory map here pulls its entire annotated table into
 * the main bundle (+67 KB measured), and the deployed page IS the offline app.
 *
 * ⚠️ `tests/unit/d890PreserveReadLog.test.ts` asserts this covers every region
 * `recordLayout.ts` flags `neverWrite`, so the two cannot drift — add one there
 * without adding it here and the suite fails.
 */
const NEVER_WRITE_RANGES: readonly { from: number; to: number }[] = [
  { from: D890_ADDR.LOCAL_INFO, to: D890_ADDR.LOCAL_INFO + D890_ADDR.LOCAL_INFO_SIZE },
];

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
  /**
   * Bytes this session READ that the plan would not write back.
   *
   * ⚠️ THE NUMBER THAT MATTERS on a radio that erases a block when written.
   * `percentOfVendorBytes` measures us against a capture from someone else's
   * radio and read 102% while 61% of what we had read was being dropped — it
   * cannot see this class of fault at all, because the vendor runs are the very
   * thing that was too small.
   *
   * Must be 0. Anything above it is data the radio gave us and would not get
   * back.
   */
  bytesReadNotWritten: number;
  /** Where those bytes are, by 0x80000 block, largest first. */
  readNotWrittenByBlock: { block: number; bytes: number }[];
}

/**
 * How much of the vendor's write this plan reproduces.
 *
 * The honest counterweight to calling anything a "full codeplug write": until
 * this reports 100%, a NeonPlug write and a vendor write are different
 * operations, and the difference is exactly the regions listed in `uncovered`.
 */
export function describeCoverage(
  plan: D890CodeplugWritePlan,
  /** The session's read log. Without it `bytesReadNotWritten` reports 0, which
   *  is honest — there is nothing to compare against — but it is the whole
   *  point of this report, so pass it. */
  readLog?: ReadonlyMap<number, Uint8Array>
): D890WriteCoverage {
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

  // What we read and would not put back. Counted per byte rather than per run,
  // because the failure is partial runs: 1,200 bytes of a 202,000-byte table
  // looks like a covered run and is a destroyed one.
  let bytesReadNotWritten = 0;
  const byBlock = new Map<number, number>();
  for (const [start, bytes] of readLog ?? []) {
    for (let i = 0; i < bytes.length; i += 1) {
      const at = start + i;
      if (touched.has(at)) continue;
      bytesReadNotWritten += 1;
      const block = Math.floor(at / 0x80000) * 0x80000;
      byBlock.set(block, (byBlock.get(block) ?? 0) + 1);
    }
  }

  return {
    vendorRuns: VENDOR_WRITE_RUNS.length,
    runsFullyCovered: fully,
    runsPartlyCovered: partly,
    runsNotCovered: none,
    vendorBytes,
    bytesCovered,
    percentOfVendorBytes: Math.round((bytesCovered / vendorBytes) * 100),
    uncovered: uncovered.sort((a, b) => b.bytes - a.bytes),
    bytesReadNotWritten,
    readNotWrittenByBlock: [...byBlock]
      .map(([block, bytes]) => ({ block, bytes }))
      .sort((a, b) => b.bytes - a.bytes),
  };
}
