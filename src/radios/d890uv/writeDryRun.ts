/**
 * Render a write plan as bytes-on-the-wire, WITHOUT a radio.
 *
 * The point is that this radio's write path can be validated offline almost
 * completely. We have the vendor CPS's own serial capture of it programming a
 * DA-7X2 (`WriteTo7x2.txt`, 8,389 frames), so "is our write correct?" can be
 * asked as "does our frame sequence match the vendor's?" — a diff, not an
 * experiment on hardware that reboots when a write goes wrong.
 *
 * Everything here goes through `buildWriteCommand`, so a dry run exercises the
 * real frame builder, the real checksum and the real address guards. A dry run
 * that produces a frame is a promise that the same bytes would be sent; a dry
 * run that throws is a write that would have been refused.
 *
 * Nothing in this file opens a port.
 */

import { buildWriteCommand } from './framing';
import { D890_CMD } from './constants';
import type { D890WriteFrame } from './writePlan';

/** One contiguous span of addresses the plan would write. */
export interface D890WriteRun {
  address: number;
  bytes: number;
  /** What the frames in this run belong to, deduplicated. */
  what: string[];
}

export interface D890WriteDryRun {
  frames: number;
  /** Payload bytes — what reaches the radio's memory, excluding framing. */
  payloadBytes: number;
  /** Bytes actually put on the wire, framing included. */
  wireBytes: number;
  runs: D890WriteRun[];
  /**
   * Estimated seconds on the wire.
   *
   * The link is byte-limited at ~10 KB/s — measured at both 16 and 240 bytes
   * per frame, which differed by 7% — so this counts wire bytes rather than
   * frames. Writes are always 16-byte payloads (the vendor never negotiates a
   * larger one), which is why a write of N bytes costs half again as much as
   * reading it: 24 bytes on the wire per 16 stored.
   */
  estimatedSeconds: number;
}

/** Measured this session: ~11 KB/s of payload, plus ~0.144 ms per frame. */
const BYTES_PER_SECOND = 11062;
const SECONDS_PER_FRAME = 0.000144;

/**
 * Collapse frames into contiguous runs, the same shape a capture analysis
 * produces — so a plan can be compared with the vendor's 74 runs directly.
 */
export function summarizeWriteRuns(frames: readonly D890WriteFrame[]): D890WriteRun[] {
  const runs: D890WriteRun[] = [];
  for (const frame of frames) {
    const last = runs[runs.length - 1];
    if (last && frame.address === last.address + last.bytes) {
      last.bytes += frame.data.length;
      if (!last.what.includes(frame.what)) last.what.push(frame.what);
    } else {
      runs.push({ address: frame.address, bytes: frame.data.length, what: [frame.what] });
    }
  }
  return runs;
}

/**
 * Build every frame the plan would send and report what it adds up to.
 *
 * Throws if any frame would be refused — an unaligned address, a wrong payload
 * length, or one of the guarded flash-management offsets. Finding that here
 * rather than mid-write is the entire point.
 */
export function dryRunWrite(frames: readonly D890WriteFrame[]): D890WriteDryRun {
  let wireBytes = 0;
  for (const frame of frames) {
    // Not kept — this is the validation, and holding 8,000 command buffers to
    // count them would be the only reason to.
    wireBytes += buildWriteCommand(frame.address, frame.data).length;
  }
  const payloadBytes = frames.reduce((sum, f) => sum + f.data.length, 0);
  return {
    frames: frames.length,
    payloadBytes,
    wireBytes,
    runs: summarizeWriteRuns(frames),
    estimatedSeconds: wireBytes / BYTES_PER_SECOND + frames.length * SECONDS_PER_FRAME,
  };
}

/**
 * Render frames in the vendor CPS's own serial-log format.
 *
 * Deliberately byte-identical in shape to `WriteTo7x2.txt` so the two can be
 * put side by side — same `Written data` header, same two-column hex, same
 * 16-byte rows. `timestamp` is a parameter so the output is deterministic and
 * a diff shows only real differences.
 */
export function renderWriteLog(
  frames: readonly D890WriteFrame[],
  options: { timestamp?: string; port?: string; limit?: number } = {}
): string {
  const { timestamp = '[00/00/0000 00:00:00]', port = 'COM3', limit } = options;
  const shown = limit === undefined ? frames : frames.slice(0, limit);
  const lines: string[] = [];

  for (const frame of shown) {
    const cmd = buildWriteCommand(frame.address, frame.data);
    lines.push(`${timestamp} Written data (${port})`);
    for (let i = 0; i < cmd.length; i += 16) {
      const row = cmd.subarray(i, i + 16);
      const hex = Array.from(row, (b) => b.toString(16).padStart(2, '0')).join(' ');
      const ascii = Array.from(row, (b) => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : '.')).join('');
      lines.push(`    ${hex.padEnd(48)}  ${ascii}`);
    }
    // The radio answers every write with a bare ACK.
    lines.push(`${timestamp} Read data (${port})`);
    lines.push(`    ${D890_CMD.ACK.toString(16).padStart(2, '0').padEnd(48)}  .`);
  }

  if (limit !== undefined && frames.length > limit) {
    lines.push(`... ${frames.length - limit} more frames not shown`);
  }
  return lines.join('\n');
}
