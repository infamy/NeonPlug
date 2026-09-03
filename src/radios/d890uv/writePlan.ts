import type { Channel } from '../../models/Channel';
import type { Zone } from '../../models/Zone';
import { D890_ADDR, D890_LIMITS } from './constants';
import { assertWritableAddress } from './framing';
import { channelAddresses, parseChannel } from './structures';
import { NO_TX_FREQUENCY } from '../../services/validation/frequencyValidator';
import {
  applyZoneMembersToRecord,
  applyZoneNameToRecord,
  ZONE_NAME_WRITE_BYTES,
} from './tableWrite';
import {
  applyChannelToRecord,
  channelRecordFrames,
  D890_CHANNEL_RECORD_BYTES,
} from './channelWrite';
import {
  findDanglingReferences,
  type DanglingReference,
  type D890TableCounts,
} from './references';

/**
 * Build — and refuse to build — the frames a channel write would send.
 *
 * **A write always sends every record it plans, changed or not.** There is no
 * "only what changed" mode, deliberately: one existed for a single session, and
 * the sparse write it produced left a radio in a bad state. The evidence for it
 * was a read-back proving the bytes SENT arrived — which never checked whether
 * the regions NOT sent survived. The vendor CPS writes every region every time;
 * until there is evidence this radio tolerates less, so do we.
 *
 * Planning is deliberately separate from sending. A plan is inert: it can be
 * inspected, diffed against what was read, counted, and thrown away. Nothing here
 * touches a radio, and the send step is not in this file.
 *
 * The two hard gates below are the ones that have already bitten this project:
 *
 *   - **Dangling references.** A channel pointing at a scan list or talkgroup that
 *     will not exist on the radio is what produced `SetCommDataByChannelError`.
 *     The check exists in `references.ts` and was never wired to anything.
 *   - **The presence mask must be RECOMPUTED, never echoed.** The vendor CPS
 *     derives masks from the codeplug it is sending rather than copying back what
 *     it read — established from the write-set analysis and visible in the
 *     captured session, where only occupied channel slots are written. A record
 *     written without its mask bit is invisible to the radio; a mask bit with no
 *     record behind it is a dangling reference of a different kind.
 */

export interface D890WriteFrame {
  address: number;
  data: Uint8Array;
  /** What this frame belongs to, for progress and for diagnosing a failure. */
  what: string;
}

export interface D890ChannelWritePlan {
  frames: D890WriteFrame[];
  /** Channel numbers included, in write order. */
  channelNumbers: number[];
  /** The mask this plan writes, for inspection before sending. */
  mask: Uint8Array;
  totalBytes: number;
  /**
   * References into tables this driver does not model. NOT errors — the bytes
   * are preserved untouched — but the write could not verify them either.
   */
  unverifiableReferences: DanglingReference[];
  /**
   * Channels present on the radio that this plan marks ABSENT. Surfaced because
   * clearing a slot is destructive and should never be silent.
   */
  clearedChannelNumbers: number[];
  /**
   * Channels handed in that the plan did not write, with the reason. VFO A and B
   * land here: they are real records at indices 4000/4001 but sit outside the
   * storable range, and silently dropping them was how they previously
   * disappeared from a write.
   */
  skipped: { channelNumber: number; reason: string }[];
}

export class D890WriteRefusedError extends Error {
  constructor(
    message: string,
    readonly dangling: DanglingReference[] = []
  ) {
    super(message);
    this.name = 'D890WriteRefusedError';
  }
}

export interface D890ChannelWriteInput {
  /** The channels to write, as edited. */
  channels: readonly Channel[];
  /**
   * The ORIGINAL 128-byte record for each channel, keyed by channel number.
   *
   * Required. A channel with no original cannot be written — see
   * `applyChannelToRecord` for why building one from scratch is not an option.
   */
  originals: ReadonlyMap<number, Uint8Array>;
  /**
   * The ORIGINAL presence mask read from the radio. REQUIRED.
   *
   * The mask is patched, not rebuilt. A rebuilt mask covers only slots
   * 0..CHANNELS_MAX-1 and writes zeros over everything past them — and the radio
   * uses slots 4000 and 4001 for VFO A and VFO B. Both serial captures show byte
   * 500 of the real mask as 0x03, i.e. both VFO bits set. Rebuilding
   * de-registers them.
   *
   * This also honours the rule the record path already follows and this one did
   * not: never write a 16-byte unit that was not just read back.
   */
  originalMask: Uint8Array;
  /** Entry counts for the tables channels reference. */
  counts: D890TableCounts;
  /**
   * TRANSMIT frequency limits. Optional; when absent, no band check runs.
   *
   * ⚠️ TX ONLY. The receive range is wider and is not the same question — this
   * radio receives 108-136 MHz AM airband and the FM broadcast band, neither of
   * which it can transmit on. Filtering RX against these limits would reject
   * perfectly legal receive-only channels.
   */
  txBandLimits?: { vhfMin: number; vhfMax: number; uhfMin?: number; uhfMax?: number };
  /**
   * Tables on the radio that reference CHANNELS, so the plan can refuse to
   * orphan them.
   *
   * `findDanglingReferences` only checks channel -> table. Nothing checked
   * table -> channel, which is the same failure from the other side: delete
   * channel 50, and zone 3's membership array still lists it. That is
   * structurally what produced `SetCommDataByChannelError`, and CLAUDE.md's
   * write-path invariant 4 requires it for every other radio in this project.
   *
   * Optional only because a caller writing the full channel set clears nothing.
   * If the plan WOULD clear a slot and this is absent, it refuses.
   */
  referencingTables?: D890ReferencingTables;
}

/**
 * Tables that point AT channels — zones and scan lists.
 *
 * Needed so a plan can refuse to clear a channel something still references,
 * rather than leaving a zone pointing at a slot that is no longer there.
 */
export type D890ReferencingTables = readonly {
  kind: 'zone' | 'scan list';
  name: string;
  /** 1-based channel numbers this table refers to. */
  channelNumbers: readonly number[];
}[];

/**
 * Plan a channel write, or throw explaining why it cannot be done safely.
 *
 * Refuses — rather than writing something partly wrong — when:
 *   1. any channel would carry a reference that does not resolve, or
 *   2. any channel lacks its original record.
 *
 * Both are conditions a caller can fix. Neither is a condition to warn about and
 * continue through, because the result on the radio is a codeplug that reads back
 * fine and behaves wrongly.
 */
export function planChannelWrite(input: D890ChannelWriteInput): D890ChannelWritePlan {
  const { channels, originals, originalMask, counts, referencingTables } = input;
  if (!originalMask || originalMask.length < D890_ADDR.CHANNEL_SET_SIZE) {
    throw new D890WriteRefusedError(
      `Refusing to write: the presence mask must be read from the radio first ` +
        `(need ${D890_ADDR.CHANNEL_SET_SIZE} bytes, got ${originalMask?.length ?? 0}). ` +
        `A rebuilt mask would clear the VFO A/B bits at slots 4000-4001.`
    );
  }

  // Gate 1 — references. Checked BEFORE any encoding, so a refusal costs nothing
  // and the message names every problem at once rather than the first one.
  //
  // ⚠️ ONLY 'out-of-range' refuses. A 'table-not-modelled' reference points into
  // a table this driver does not read — 2Tone, 5Tone, DTMF and friends — and
  // real channels carry those routinely. Those bytes are PRESERVED by the patch,
  // never rewritten, so the reference is as valid after the write as before it.
  // Refusing on them would block every write to every real radio while making
  // nothing safer. Out-of-range is different: we model the table, we know how
  // many entries it has, and the channel points past the end.
  const allFindings = findDanglingReferences(channels, counts);
  const dangling = allFindings.filter((d) => d.reason === 'out-of-range');
  if (dangling.length > 0) {
    const lines = dangling
      .slice(0, 8)
      .map(
        (d) =>
          `  channel ${d.channelNumber}: ${d.label} = ${d.value} but ${d.table} has ` +
          `${d.available ?? 'no entries this driver models'}`
      );
    throw new D890WriteRefusedError(
      `Refusing to write: ${dangling.length} channel reference(s) would not resolve on the ` +
        `radio. A channel pointing at something that is not there is what produces ` +
        `SetCommDataByChannelError.\n${lines.join('\n')}` +
        (dangling.length > 8 ? `\n  ... and ${dangling.length - 8} more` : ''),
      dangling
    );
  }

  // Gate 2 — originals, checked only for channels this plan will actually WRITE.
  // A channel outside the storable range is skipped further down, so demanding
  // its original would block every write that includes VFO A/B — which is how
  // `readChannels` hands them over.
  const writable = channels.filter((c) => {
    const i = c.number - 1;
    return (
      i >= 0 &&
      (i < D890_LIMITS.CHANNELS_MAX ||
        i === D890_ADDR.VFO_A_INDEX ||
        i === D890_ADDR.VFO_B_INDEX)
    );
  });
  const missing = writable.filter((c) => !originals.has(c.number)).map((c) => c.number);
  if (missing.length > 0) {
    throw new D890WriteRefusedError(
      `Refusing to write: no original record for channel(s) ${missing.slice(0, 10).join(', ')}` +
        `${missing.length > 10 ? ` and ${missing.length - 10} more` : ''}. ` +
        `Every channel must be read from the radio before it can be written, or the ` +
        `fields this driver does not decode would be overwritten with zeros.`
    );
  }

  const frames: D890WriteFrame[] = [];
  const channelNumbers: number[] = [];
  const occupiedIdx: number[] = [];
  const skipped: { channelNumber: number; reason: string }[] = [];

  for (const channel of channels) {
    // Channel numbers are 1-based; the wire index is 0-based.
    const index = channel.number - 1;
    // VFO A and B arrive as 4001/4002, i.e. wire slots 4000 and 4001. They ARE
    // written — the vendor CPS writes both records in full, 8/8 frames each, in
    // its own programming session.
    //
    // They sit past `CHANNELS_MAX` because that constant counts the STORABLE
    // channels; the VFOs are two extra records after them. Their mask bits are
    // deliberately not touched by the mask loop below, which matches the CPS:
    // its write leaves byte 500 as 0x03, both VFO bits set, even where the
    // records themselves are erased 0xFF.
    const isVfo = index === D890_ADDR.VFO_A_INDEX || index === D890_ADDR.VFO_B_INDEX;
    if (index < 0 || (index >= D890_LIMITS.CHANNELS_MAX && !isVfo)) {
      skipped.push({
        channelNumber: channel.number,
        reason:
          index < 0
            ? 'channel number below 1'
            : `outside the ${D890_LIMITS.CHANNELS_MAX} storable channels`,
      });
      continue;
    }

    const original = originals.get(channel.number)!;
    const record = applyChannelToRecord(original, channel);
    const { primary } = channelAddresses(index);

    // A record goes as all eight frames or not at all — the captured vendor
    // session never writes a channel partially.
    for (const f of channelRecordFrames(primary, record)) {
      frames.push({ ...f, what: `channel ${channel.number}` });
    }
    channelNumbers.push(channel.number);
    // The VFO slots are outside the mask loop's range, so recording them here
    // would be misleading — their bits are preserved, never recomputed.
    if (!isVfo) occupiedIdx.push(index);
  }

  // Gate 3 — the mask is PATCHED, not rebuilt.
  //
  // Only the bits for real channel slots (0..CHANNELS_MAX-1) are set or cleared.
  // Everything above is copied from what the radio gave us, which is what keeps
  // VFO A and VFO B — slots 4000 and 4001, byte 500 bit 0 and bit 1 — registered.
  const mask = Uint8Array.from(originalMask.subarray(0, D890_ADDR.CHANNEL_SET_SIZE));
  const wanted = new Set(occupiedIdx);
  for (let slot = 0; slot < D890_LIMITS.CHANNELS_MAX; slot += 1) {
    const byte = slot >> 3;
    const bit = 1 << (slot & 7);
    if (wanted.has(slot)) mask[byte] |= bit;
    else mask[byte] &= ~bit & 0xff;
  }
  for (let off = 0; off < mask.length; off += 0x10) {
    frames.push({
      address: D890_ADDR.CHANNEL_SET + off,
      data: mask.slice(off, off + 0x10),
      what: 'channel presence mask',
    });
  }

  // Gate 3b — transmit band limits.
  //
  // CLAUDE.md write-path invariant 4 requires this. It REFUSES rather than
  // filtering silently: on this radio a write is a read-modify-write of records
  // the user can see, so quietly dropping one leaves the grid and the radio
  // disagreeing with no explanation.
  //
  // Checked against TX only. The radio's actual TX range is NOT discoverable —
  // it is absent from LocalInfo and from every byte of a full codeplug capture,
  // so these limits are declared per model rather than read from the hardware.
  if (input.txBandLimits) {
    const L = input.txBandLimits;
    const inBand = (mhz: number) =>
      (mhz >= L.vhfMin && mhz <= L.vhfMax) ||
      (L.uhfMin !== undefined && L.uhfMax !== undefined && mhz >= L.uhfMin && mhz <= L.uhfMax);
    // NO_TX_FREQUENCY is a SENTINEL meaning receive-only, not a frequency. It is
    // 1666.666, which is > 0 and outside every band — so a naive `> 0` test
    // rejects every receive-only channel the airport wizard produces. Those are
    // exactly the channels this check must not touch.
    //
    // ⚠️ Only channels whose TX frequency CHANGED are checked.
    //
    // A channel read from the radio and written back unchanged is already on
    // the radio — refusing it protects nothing and makes the write path
    // unusable on any radio that holds such a channel. A real DA-7X2 does:
    // this was found on hardware, where the main channel list carried an
    // airband entry at 118 MHz and an FM broadcast entry at 98.5 MHz, both
    // read FROM the radio, and the gate refused every write outright.
    //
    // What the gate is for is stopping a channel from being GIVEN an
    // out-of-band TX. That is still refused, whether it is a new channel or an
    // edit to an existing one.
    const txChanged = (c: Channel) => {
      const original = originals.get(c.number);
      if (!original) return true;
      const before = parseChannel(original, c.number - 1).channel.txFrequency;
      return Math.abs(before - c.txFrequency) > 1e-6;
    };
    const outOfBand = channels.filter(
      (c) =>
        c.txFrequency > 0 &&
        c.txFrequency !== NO_TX_FREQUENCY &&
        !inBand(c.txFrequency) &&
        txChanged(c)
    );
    if (outOfBand.length > 0) {
      const lines = outOfBand
        .slice(0, 6)
        .map((c) => `  channel ${c.number} "${c.name}": TX ${c.txFrequency} MHz`);
      throw new D890WriteRefusedError(
        `Refusing to write: ${outOfBand.length} channel(s) transmit outside this radio's bands ` +
          `(${L.vhfMin}-${L.vhfMax}` +
          `${L.uhfMin !== undefined ? `, ${L.uhfMin}-${L.uhfMax}` : ''} MHz).\n${lines.join('\n')}` +
          (outOfBand.length > 6 ? `\n  ... and ${outOfBand.length - 6} more` : '') +
          `\nReceive-only frequencies outside these bands are fine — this check is TX only.`
      );
    }
  }

  // Gate 4 — reverse references. Which slots does this plan CLEAR?
  const wantedSet = new Set(occupiedIdx);
  const cleared: number[] = [];
  for (let slot = 0; slot < D890_LIMITS.CHANNELS_MAX; slot += 1) {
    const wasPresent = ((originalMask[slot >> 3] ?? 0) >> (slot & 7)) & 1;
    if (wasPresent && !wantedSet.has(slot)) cleared.push(slot + 1);
  }
  if (cleared.length > 0) {
    if (!referencingTables) {
      throw new D890WriteRefusedError(
        `Refusing to write: this plan would mark ${cleared.length} channel(s) absent ` +
          `(${cleared.slice(0, 8).join(', ')}${cleared.length > 8 ? ', …' : ''}) but was given no ` +
          `zone or scan-list membership to check against. A zone still pointing at a removed ` +
          `channel is the same fault as a channel pointing at a missing table.`
      );
    }
    const orphaning: string[] = [];
    const clearedSet = new Set(cleared);
    for (const t of referencingTables) {
      const hits = t.channelNumbers.filter((n) => clearedSet.has(n));
      if (hits.length > 0) {
        orphaning.push(`  ${t.kind} "${t.name}" references channel(s) ${hits.slice(0, 6).join(', ')}`);
      }
    }
    if (orphaning.length > 0) {
      throw new D890WriteRefusedError(
        `Refusing to write: ${orphaning.length} table(s) reference channels this plan removes.\n` +
          `${orphaning.join('\n')}\n` +
          `Remove those references first, or keep the channels.`
      );
    }
  }

  // Every frame is validated HERE, not at send time. A guarded address that
  // throws mid-session leaves a partial codeplug, and rule 1 forbids reading
  // back to discover what landed. A plan must be safe before the first frame.
  for (const f of frames) {
    assertWritableAddress(f.address);
    if (f.address % 0x10 !== 0) {
      throw new D890WriteRefusedError(`Planned frame at 0x${f.address.toString(16)} is not 16-byte aligned`);
    }
    if (f.data.length !== 0x10) {
      throw new D890WriteRefusedError(`Planned frame at 0x${f.address.toString(16)} is ${f.data.length} bytes, not 16`);
    }
  }
  const seen = new Set<number>();
  for (const f of frames) {
    if (seen.has(f.address)) {
      throw new D890WriteRefusedError(
        `Plan writes 0x${f.address.toString(16)} twice. The vendor never writes an address ` +
          `twice in 8389 frames; a duplicate means two channels claim the same slot.`
      );
    }
    seen.add(f.address);
  }

  return {
    frames,
    channelNumbers,
    mask,
    clearedChannelNumbers: cleared,
    skipped,
    totalBytes: frames.length * 0x10,
    // Surfaced rather than swallowed: these did not block the write, but a caller
    // may want to tell the user which references it could not check.
    unverifiableReferences: allFindings.filter((d) => d.reason === 'table-not-modelled'),
  };
}

/** Records per plan, for a progress display that counts what a user recognises. */
export function planRecordCount(plan: D890ChannelWritePlan): number {
  return plan.channelNumbers.length;
}

export { D890_CHANNEL_RECORD_BYTES };

/**
 * Geometry of a table that is stored as fixed-stride records plus a presence
 * mask. Six of this radio's tables have exactly this shape.
 */
export interface D890MaskedTableSpec {
  /** Shown in frame labels and refusal messages, so it reads as a thing a user recognises. */
  label: string;
  dataAddress: number;
  maskAddress: number;
  stride: number;
  slots: number;
  /**
   * True when a SET bit means the slot is EMPTY. The talkgroup mask is
   * inverted; the AM, AM-zone, 5-Tone and 2-Tone masks are not. Getting this
   * backwards yields either an empty table or every slot occupied, so it is
   * always passed explicitly rather than defaulted at a call site.
   */
  maskInverted?: boolean;
}

export interface D890MaskedTableWritePlan {
  frames: D890WriteFrame[];
  /** The mask this plan writes, for inspection before sending. */
  mask: Uint8Array;
  /** Slot indices written, in write order. */
  written: number[];
  /**
   * Slots the radio currently has that this plan marks ABSENT. Clearing a slot
   * is destructive, so it is surfaced rather than done quietly.
   */
  cleared: number[];
  /** Entries handed in that the plan did not write, with the reason. */
  skipped: { index: number; reason: string }[];
}

/**
 * Plan a write for a mask-plus-records table.
 *
 * This is `planChannelWrite`'s shape generalised, and it keeps that function's
 * two hard rules because both were learned the hard way:
 *
 * **1. Records are patched, never built.** Every entry must have the original
 * the radio gave us. A write frame is 16 bytes where most fields are 1-4, so a
 * record built from zero would send zeros over everything this driver does not
 * model.
 *
 * **2. The mask is PATCHED, not rebuilt.** Only bits for slots this table
 * actually has are touched; everything above is copied from what the radio
 * gave us. On the channel table that is what keeps VFO A/B registered at slots
 * 4000-4001. The same rule is applied here even where no such tenant is known,
 * because "no tenant is known" and "no tenant exists" are different claims and
 * only one of them is evidence. A mask read is 16-byte aligned and therefore
 * routinely wider than the table — the 5-Tone mask covers 128 bits for 100
 * slots — so rebuilding would zero 28 bits nobody has ever looked at.
 *
 * A record written without its mask bit is invisible to the radio; a mask bit
 * with no record behind it points at whatever was there before.
 */
export function planMaskedTableWrite<T extends { index: number }>(
  spec: D890MaskedTableSpec,
  input: {
    entries: readonly T[];
    /** The ORIGINAL record for each slot index. Required — see rule 1. */
    originals: ReadonlyMap<number, Uint8Array>;
    /** The ORIGINAL mask read from the radio. Required — see rule 2. */
    originalMask: Uint8Array;
    encode: (original: Uint8Array, entry: T) => Uint8Array;
  }
): D890MaskedTableWritePlan {
  const { entries, originals, originalMask, encode } = input;
  const maskBytes = Math.ceil(spec.slots / 8);

  if (!originalMask || originalMask.length < maskBytes) {
    throw new D890WriteRefusedError(
      `Refusing to write ${spec.label}: its presence mask must be read from the radio ` +
        `first (need ${maskBytes} bytes, got ${originalMask?.length ?? 0}). ` +
        `A rebuilt mask would clear bits this driver does not model.`
    );
  }

  // A record can only be written frame-by-frame if its records START on a
  // 16-byte boundary. The talkgroup stride is 0xc8, so record 1 begins at
  // 0x3a000c8 and every frame after the first would be unaligned — which
  // `buildWriteCommand` refuses. Such tables need `planSpanTableWrite`, which
  // is what the vendor does: one contiguous run of aligned frames across the
  // whole table, ignoring record boundaries.
  if (spec.stride % 0x10 !== 0) {
    throw new D890WriteRefusedError(
      `Refusing to write ${spec.label}: its ${spec.stride}-byte stride is not ` +
        `16-byte aligned, so records after the first do not start on a frame ` +
        `boundary. Use planSpanTableWrite for this table.`
    );
  }

  const frames: D890WriteFrame[] = [];
  const written: number[] = [];
  const skipped: { index: number; reason: string }[] = [];

  for (const entry of entries) {
    if (entry.index < 0 || entry.index >= spec.slots) {
      skipped.push({
        index: entry.index,
        reason: `outside the ${spec.slots} slots ${spec.label} holds`,
      });
      continue;
    }
    const original = originals.get(entry.index);
    if (!original) {
      throw new D890WriteRefusedError(
        `Refusing to write ${spec.label} slot ${entry.index}: it was never read from the ` +
          `radio. Every record must be read before it is written, or the fields this ` +
          `driver does not decode would be overwritten with zeros.`
      );
    }
    const record = encode(original, entry);
    if (record.length !== spec.stride) {
      throw new D890WriteRefusedError(
        `Refusing to write ${spec.label} slot ${entry.index}: encoder returned ` +
          `${record.length} bytes, expected ${spec.stride}.`
      );
    }
    const base = spec.dataAddress + entry.index * spec.stride;
    for (let off = 0; off < record.length; off += 0x10) {
      frames.push({
        address: base + off,
        data: record.slice(off, off + 0x10),
        what: `${spec.label} ${entry.index + 1}`,
      });
    }
    written.push(entry.index);
  }

  // Rule 2 — patch, never rebuild.
  const mask = Uint8Array.from(originalMask);
  const wanted = new Set(written);
  const cleared: number[] = [];
  for (let slot = 0; slot < spec.slots; slot += 1) {
    const byte = slot >> 3;
    const bit = 1 << (slot & 7);
    const wasPresent = spec.maskInverted
      ? ((mask[byte] ?? 0) & bit) === 0
      : ((mask[byte] ?? 0) & bit) !== 0;
    const present = wanted.has(slot);
    if (wasPresent && !present) cleared.push(slot);
    // An inverted mask stores "empty", so presence flips which way the bit goes.
    const setBit = spec.maskInverted ? !present : present;
    if (setBit) mask[byte] = (mask[byte] ?? 0) | bit;
    else mask[byte] = (mask[byte] ?? 0) & ~bit & 0xff;
  }

  // The mask goes as whole 16-byte frames, like every other write.
  const maskSpan = Math.ceil(maskBytes / 0x10) * 0x10;
  for (let off = 0; off < maskSpan; off += 0x10) {
    frames.push({
      address: spec.maskAddress + off,
      data: mask.slice(off, off + 0x10),
      what: `${spec.label} presence mask`,
    });
  }

  return { frames, mask, written, cleared, skipped };
}

/**
 * Plan a write for a table whose records do NOT start on frame boundaries.
 *
 * The talkgroup stride is 0xc8, so record 1 begins at 0x3a000c8 — eight bytes
 * into a frame. There is no way to write that record without also writing parts
 * of its neighbours, so the vendor writes the table as one contiguous run of
 * aligned frames and lets the record boundaries fall where they may. Its own
 * session does exactly that: 75 frames covering 0x3a00000-0x3a004b0, six
 * 200-byte records, every address 16-aligned and every frame contiguous.
 *
 * That means **every record the span touches must have been read**, including
 * ones the user did not edit — a frame that straddles two records carries both.
 * This refuses rather than filling a gap with zeros, because the bytes it
 * cannot account for belong to a talkgroup someone is using.
 */
export function planSpanTableWrite<T extends { index: number }>(
  spec: D890MaskedTableSpec,
  input: {
    entries: readonly T[];
    originals: ReadonlyMap<number, Uint8Array>;
    originalMask: Uint8Array;
    encode: (original: Uint8Array, entry: T) => Uint8Array;
  }
): D890MaskedTableWritePlan {
  const { entries, originals, originalMask, encode } = input;
  const maskBytes = Math.ceil(spec.slots / 8);
  if (!originalMask || originalMask.length < maskBytes) {
    throw new D890WriteRefusedError(
      `Refusing to write ${spec.label}: its presence mask must be read from the radio ` +
        `first (need ${maskBytes} bytes, got ${originalMask?.length ?? 0}).`
    );
  }

  const inRange = entries.filter((e) => e.index >= 0 && e.index < spec.slots);
  const skipped = entries
    .filter((e) => e.index < 0 || e.index >= spec.slots)
    .map((e) => ({ index: e.index, reason: `outside the ${spec.slots} slots ${spec.label} holds` }));

  const frames: D890WriteFrame[] = [];
  const written = inRange.map((e) => e.index).sort((a, b) => a - b);

  if (written.length > 0) {
    const first = written[0];
    const last = written[written.length - 1];
    // Align the span outwards to frame boundaries.
    const spanStart = Math.floor((first * spec.stride) / 0x10) * 0x10;
    const spanEnd = Math.ceil(((last + 1) * spec.stride) / 0x10) * 0x10;

    // Every record overlapping the span has to be present, or its bytes would
    // be invented.
    const firstNeeded = Math.floor(spanStart / spec.stride);
    const lastNeeded = Math.ceil(spanEnd / spec.stride) - 1;
    const missing: number[] = [];
    for (let i = firstNeeded; i <= lastNeeded && i < spec.slots; i += 1) {
      if (!originals.has(i)) missing.push(i);
    }
    if (missing.length > 0) {
      throw new D890WriteRefusedError(
        `Refusing to write ${spec.label}: records ${missing.slice(0, 10).join(', ')}` +
          `${missing.length > 10 ? ` and ${missing.length - 10} more` : ''} were never read, ` +
          `but the write spans them. This table's records do not start on frame ` +
          `boundaries, so a frame carries bytes from more than one record.`
      );
    }

    // Build the span from the originals, then patch the edited records in.
    const span = new Uint8Array(spanEnd - spanStart);
    // A record at either end may hang outside the span — the first one starts
    // before it (the span was aligned DOWN to a frame boundary) and the last
    // may run past it. Copy only the overlapping part of each.
    const copyInto = (src: Uint8Array, at: number) => {
      const from = Math.max(0, -at);
      const to = Math.min(src.length, span.length - at);
      if (to > from) span.set(src.subarray(from, to), at + from);
    };
    for (let i = firstNeeded; i <= lastNeeded && i < spec.slots; i += 1) {
      copyInto(originals.get(i)!, i * spec.stride - spanStart);
    }
    for (const entry of inRange) {
      const record = encode(originals.get(entry.index)!, entry);
      if (record.length !== spec.stride) {
        throw new D890WriteRefusedError(
          `Refusing to write ${spec.label} slot ${entry.index}: encoder returned ` +
            `${record.length} bytes, expected ${spec.stride}.`
        );
      }
      copyInto(record, entry.index * spec.stride - spanStart);
    }

    for (let off = 0; off < span.length; off += 0x10) {
      frames.push({
        address: spec.dataAddress + spanStart + off,
        data: span.slice(off, off + 0x10),
        what: `${spec.label}s ${first + 1}-${last + 1}`,
      });
    }
  }

  // Same mask rules as the per-record planner.
  const mask = Uint8Array.from(originalMask);
  const wanted = new Set(written);
  const cleared: number[] = [];
  for (let slot = 0; slot < spec.slots; slot += 1) {
    const byte = slot >> 3;
    const bit = 1 << (slot & 7);
    const wasPresent = spec.maskInverted
      ? ((mask[byte] ?? 0) & bit) === 0
      : ((mask[byte] ?? 0) & bit) !== 0;
    const present = wanted.has(slot);
    if (wasPresent && !present) cleared.push(slot);
    const setBit = spec.maskInverted ? !present : present;
    if (setBit) mask[byte] = (mask[byte] ?? 0) | bit;
    else mask[byte] = (mask[byte] ?? 0) & ~bit & 0xff;
  }
  const maskSpan = Math.ceil(maskBytes / 0x10) * 0x10;
  for (let off = 0; off < maskSpan; off += 0x10) {
    frames.push({
      address: spec.maskAddress + off,
      data: mask.slice(off, off + 0x10),
      what: `${spec.label} presence mask`,
    });
  }

  return { frames, mask, written, cleared, skipped };
}

/**
 * Plan a zone write.
 *
 * A zone is TWO records in two different regions — membership at
 * `ZONE_CHANNELS` and the name at `ZONE_NAMES` — sharing ONE presence mask.
 * Planning them separately is the bug this function exists to prevent: a rename
 * that lands without its members, or members without their name, leaves the
 * radio showing a zone that is half of two different ones.
 *
 * Zones are matched to hardware SLOTS by `slotOf`. That indirection is not
 * decoration: empty slots are dropped when zones are read, so a zone's position
 * in the array is NOT its slot as soon as one in the middle is empty. Writing
 * by array position would silently move every later zone.
 */
export function planZoneWrite(input: {
  zones: readonly Zone[];
  /** Hardware slot for each zone, by array position — from `rawZoneIndices`. */
  slotOf: (zone: Zone, position: number) => number;
  /** ORIGINAL membership record per slot. Required: records are patched. */
  memberOriginals: ReadonlyMap<number, Uint8Array>;
  /** ORIGINAL name record per slot. Required for the same reason. */
  nameOriginals: ReadonlyMap<number, Uint8Array>;
  /** The ORIGINAL zone presence mask. Patched, never rebuilt. */
  originalMask: Uint8Array;
}): D890MaskedTableWritePlan {
  const { zones, slotOf, memberOriginals, nameOriginals, originalMask } = input;

  const frames: D890WriteFrame[] = [];
  const written: number[] = [];
  const skipped: { index: number; reason: string }[] = [];

  const emit = (address: number, record: Uint8Array, what: string) => {
    for (let off = 0; off < record.length; off += 0x10) {
      frames.push({ address: address + off, data: record.slice(off, off + 0x10), what });
    }
  };

  zones.forEach((zone, position) => {
    const slot = slotOf(zone, position);
    if (slot < 0 || slot >= D890_LIMITS.ZONES_MAX) {
      skipped.push({ index: slot, reason: `outside the ${D890_LIMITS.ZONES_MAX} zone slots` });
      return;
    }
    const members = memberOriginals.get(slot);
    const name = nameOriginals.get(slot);
    if (!members || !name) {
      throw new D890WriteRefusedError(
        `Refusing to write zone "${zone.name}" (slot ${slot}): its ` +
          `${!members ? 'membership' : 'name'} record was never read. Both records are ` +
          `patched, not built, so both must come from the radio.`
      );
    }

    emit(
      D890_ADDR.ZONE_CHANNELS + slot * D890_ADDR.ZONE_CHANNELS_STRIDE,
      applyZoneMembersToRecord(members, zone),
      `zone ${slot + 1} members`
    );
    // The name record is written at the vendor's 32-byte width, not the 0x30
    // the READ fetches — a read is 16-byte aligned and therefore wider than the
    // field. See ZONE_NAME_WRITE_BYTES.
    emit(
      D890_ADDR.ZONE_NAMES + slot * D890_ADDR.ZONE_NAME_STRIDE,
      applyZoneNameToRecord(name.subarray(0, ZONE_NAME_WRITE_BYTES), zone),
      `zone ${slot + 1} name`
    );
    written.push(slot);
  });

  // One mask for both records — patched, never rebuilt, so bits above the zone
  // count stay as the radio had them.
  const mask = Uint8Array.from(originalMask);
  const wanted = new Set(written);
  const cleared: number[] = [];
  for (let slot = 0; slot < D890_LIMITS.ZONES_MAX; slot += 1) {
    const byte = slot >> 3;
    const bit = 1 << (slot & 7);
    if (((mask[byte] ?? 0) & bit) !== 0 && !wanted.has(slot)) cleared.push(slot);
    if (wanted.has(slot)) mask[byte] = (mask[byte] ?? 0) | bit;
    else mask[byte] = (mask[byte] ?? 0) & ~bit & 0xff;
  }
  for (let off = 0; off < D890_ADDR.ZONE_SET_SIZE; off += 0x10) {
    frames.push({
      address: D890_ADDR.ZONE_SET + off,
      data: mask.slice(off, off + 0x10),
      what: 'zone presence mask',
    });
  }

  return { frames, mask, written, cleared, skipped };
}
