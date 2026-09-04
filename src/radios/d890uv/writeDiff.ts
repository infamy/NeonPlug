/**
 * Compare a write plan against the read it came from — the offline sanity check.
 *
 * "We write what we read" is a claim about bytes, so it can be checked as one.
 * Plan a write from an UNMODIFIED codeplug and every frame should be identical
 * to what the radio just sent us. Any difference is one of exactly three things:
 *
 *   1. a real encoder bug — it writes a field wrong;
 *   2. a lossy decode — the model cannot represent what the wire held, so the
 *      re-encode cannot reproduce it (`.trim()` on names, `fixedAscii` stopping
 *      at the first non-printable byte, `frequency: null` collapsing three wire
 *      states into one, RX-group members being compacted);
 *   3. a deliberate normalisation we can name and defend.
 *
 * All three are worth seeing before a radio is involved. The third is rare; the
 * audits on 2026-09-02 suggest most differences will be the second, and those
 * are the dangerous ones because they are silent and survive round-trip tests.
 *
 * Nothing here opens a port or sends anything.
 */

import type { D890WriteFrame } from './writePlan';
import { sliceFromReadLog } from './codeplugWrite';

/** One frame that would go to the radio holding something other than what came back. */
export interface D890FrameDiff {
  address: number;
  what: string;
  /** Byte offsets within the 16-byte frame that differ. */
  offsets: number[];
  read: Uint8Array;
  planned: Uint8Array;
}

export interface D890WriteDiffRegion {
  what: string;
  frames: number;
  identical: number;
  differing: number;
  /** Frames whose address never appeared in the read log. */
  unread: number;
  /** Total bytes that differ across the region. */
  bytesChanged: number;
}

export interface D890WriteDiff {
  totalFrames: number;
  identicalFrames: number;
  differingFrames: number;
  unreadFrames: number;
  bytesChanged: number;
  regions: D890WriteDiffRegion[];
  diffs: D890FrameDiff[];
}

/**
 * Diff every frame in a plan against the bytes the read log holds there.
 *
 * `unread` is counted separately from `differing` on purpose: a frame whose
 * address was never read cannot be compared, and calling that "identical" would
 * make an unverifiable write look verified.
 */
export function diffPlanAgainstRead(
  frames: readonly D890WriteFrame[],
  readLog: ReadonlyMap<number, Uint8Array>,
  options?: { maxDiffs?: number }
): D890WriteDiff {
  const maxDiffs = options?.maxDiffs ?? 500;
  const byRegion = new Map<string, D890WriteDiffRegion>();
  const diffs: D890FrameDiff[] = [];
  let identicalFrames = 0;
  let differingFrames = 0;
  let unreadFrames = 0;
  let bytesChanged = 0;

  for (const frame of frames) {
    const region =
      byRegion.get(frame.what) ??
      { what: frame.what, frames: 0, identical: 0, differing: 0, unread: 0, bytesChanged: 0 };
    byRegion.set(frame.what, region);
    region.frames += 1;

    const read = sliceFromReadLog(readLog, frame.address, frame.data.length);
    if (!read) {
      region.unread += 1;
      unreadFrames += 1;
      continue;
    }

    const offsets: number[] = [];
    for (let i = 0; i < frame.data.length; i += 1) {
      if (read[i] !== frame.data[i]) offsets.push(i);
    }
    if (offsets.length === 0) {
      region.identical += 1;
      identicalFrames += 1;
      continue;
    }
    region.differing += 1;
    region.bytesChanged += offsets.length;
    differingFrames += 1;
    bytesChanged += offsets.length;
    if (diffs.length < maxDiffs) {
      diffs.push({
        address: frame.address,
        what: frame.what,
        offsets,
        read: Uint8Array.from(read),
        planned: Uint8Array.from(frame.data),
      });
    }
  }

  return {
    totalFrames: frames.length,
    identicalFrames,
    differingFrames,
    unreadFrames,
    bytesChanged,
    regions: [...byRegion.values()].sort((a, b) => b.differing - a.differing),
    diffs,
  };
}

const hex = (b: Uint8Array) => [...b].map((v) => v.toString(16).padStart(2, '0')).join(' ');
const addr = (a: number) => `0x${a.toString(16).padStart(7, '0')}`;

/** The diff as a plain-text report, for saving next to the codeplug. */
export function renderWriteDiff(diff: D890WriteDiff, header?: string): string {
  const out: string[] = [];
  if (header) out.push(header, '');
  out.push('=== WRITE DRY RUN — planned bytes vs bytes read ===', '');
  out.push(`frames planned      ${diff.totalFrames}`);
  out.push(`identical to read   ${diff.identicalFrames}`);
  out.push(`differing           ${diff.differingFrames}`);
  out.push(`never read          ${diff.unreadFrames}`);
  out.push(`bytes changed       ${diff.bytesChanged}`);
  out.push('');
  out.push(
    diff.differingFrames === 0 && diff.unreadFrames === 0
      ? 'Every planned frame matches what the radio sent. An unmodified codeplug\n' +
        'would be written back byte for byte.'
      : 'Differences below. On an UNMODIFIED codeplug every one of these is a bug\n' +
        'or a lossy decode — nothing should change if nothing was edited.'
  );
  out.push('');

  out.push('--- by region ---');
  const pad = Math.max(...diff.regions.map((r) => r.what.length), 6);
  for (const r of diff.regions) {
    out.push(
      `${r.what.padEnd(pad)}  frames ${String(r.frames).padStart(5)}` +
        `  same ${String(r.identical).padStart(5)}` +
        `  diff ${String(r.differing).padStart(5)}` +
        `  unread ${String(r.unread).padStart(5)}` +
        `  bytes ${String(r.bytesChanged).padStart(5)}`
    );
  }
  out.push('');

  if (diff.diffs.length > 0) {
    out.push('--- differing frames ---');
    for (const d of diff.diffs) {
      out.push(`${addr(d.address)}  ${d.what}   offsets ${d.offsets.join(',')}`);
      out.push(`  read    ${hex(d.read)}`);
      out.push(`  planned ${hex(d.planned)}`);
    }
    if (diff.differingFrames > diff.diffs.length) {
      out.push('', `… ${diff.differingFrames - diff.diffs.length} more differing frames not listed.`);
    }
  }
  return out.join('\n');
}
