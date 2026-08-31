import type { Channel } from '../../models/Channel';
import { D890_ADDR, D890_LIMITS } from './constants';
import { assertWritableAddress } from './framing';
import { channelAddresses } from './structures';
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
  const { channels, originals, originalMask, counts } = input;
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

  // Gate 2 — originals. A missing one means we would have to invent 128 bytes.
  const missing = channels.filter((c) => !originals.has(c.number)).map((c) => c.number);
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

  for (const channel of channels) {
    // Channel numbers are 1-based; the wire index is 0-based.
    const index = channel.number - 1;
    if (index < 0 || index >= D890_LIMITS.CHANNELS_MAX) continue;

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
