import type { Channel } from '../../models/Channel';
import { D890_ADDR, D890_LIMITS } from './constants';
import { assertWritableAddress } from './framing';
import { channelAddresses } from './structures';
import { NO_TX_FREQUENCY } from '../../services/validation/frequencyValidator';
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
  referencingTables?: readonly {
    kind: 'zone' | 'scan list';
    name: string;
    /** 1-based channel numbers this table refers to. */
    channelNumbers: readonly number[];
  }[];
}

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
  const writable = channels.filter(
    (c) => c.number - 1 >= 0 && c.number - 1 < D890_LIMITS.CHANNELS_MAX
  );
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
    if (index < 0 || index >= D890_LIMITS.CHANNELS_MAX) {
      // VFO A and B arrive here as 4001/4002. They ARE real records, but they
      // sit past the storable range and this planner does not write them.
      // Recorded rather than dropped — their mask bits are preserved separately.
      skipped.push({
        channelNumber: channel.number,
        reason:
          index >= D890_LIMITS.CHANNELS_MAX
            ? `outside the ${D890_LIMITS.CHANNELS_MAX} storable channels (VFO records are not written)`
            : 'channel number below 1',
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
    occupiedIdx.push(index);
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
    const outOfBand = channels.filter(
      (c) => c.txFrequency > 0 && c.txFrequency !== NO_TX_FREQUENCY && !inBand(c.txFrequency)
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
