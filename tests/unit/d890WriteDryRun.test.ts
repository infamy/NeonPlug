import { describe, it, expect } from 'vitest';
import {
  dryRunWrite,
  renderWriteLog,
  summarizeWriteRuns,
} from '../../src/radios/d890uv/writeDryRun';
import type { D890WriteFrame } from '../../src/radios/d890uv/writePlan';
import {
  D890_FORBIDDEN_UNIT_OFFSETS,
  D890_FORBIDDEN_WRITE_ADDRESS,
  D890_FLASH_MARKER_STRIDE,
} from '../../src/radios/d890uv/constants';

const bytes = (hex: string) =>
  new Uint8Array((hex.match(/../g) ?? []).map((h) => parseInt(h, 16)));

/**
 * The first two frames of the vendor CPS's real programming session, verbatim
 * from `WriteTo7x2.txt` — request and the radio's bare `06` reply.
 *
 * A dry run has to reproduce this exactly. If it does, the only thing left
 * between a dry run and a real write is the port.
 */
const VENDOR_LOG_HEAD = `[00/00/0000 00:00:00] Written data (COM3)
    57 01 00 00 00 10 14 50 12 50 14 50 12 50 10 00   W......P.P.P.P..
    00 00 00 00 00 00 ad 06                           ......­.
[00/00/0000 00:00:00] Read data (COM3)
    06                                                .`;

const FRAMES: D890WriteFrame[] = [
  { address: 0x01000000, data: bytes('14501250145012501000000000000000'), what: 'channel 1' },
  { address: 0x01000010, data: bytes('26050000000000000000000000000000'), what: 'channel 1' },
];

describe('write dry run', () => {
  it('produces the vendor CPS frame bytes, ACK and all', () => {
    const rendered = renderWriteLog(FRAMES, { limit: 1 });
    // Compare the hex column only — the ASCII column is cosmetic and the vendor
    // log renders high bytes with a codepage we do not reproduce.
    const hexOf = (text: string) =>
      text
        .split('\n')
        .filter((l) => l.startsWith('    '))
        .map((l) => l.trim().split(/\s{2,}/)[0])
        .join(' ');
    expect(hexOf(rendered)).toBe(hexOf(VENDOR_LOG_HEAD));
  });

  it('counts frames, payload and wire bytes separately', () => {
    const run = dryRunWrite(FRAMES);
    expect(run.frames).toBe(2);
    expect(run.payloadBytes).toBe(32);
    // 24 bytes on the wire per 16 stored — a write costs half again its payload.
    expect(run.wireBytes).toBe(48);
  });

  it('coalesces contiguous frames into runs, like a capture analysis', () => {
    expect(summarizeWriteRuns(FRAMES)).toEqual([
      { address: 0x01000000, bytes: 32, what: ['channel 1'] },
    ]);
  });

  it('splits a run at a gap', () => {
    const gapped: D890WriteFrame[] = [
      FRAMES[0],
      { address: 0x02000000, data: bytes('00'.repeat(16)), what: 'zone 1' },
    ];
    expect(summarizeWriteRuns(gapped).map((r) => r.address)).toEqual([0x01000000, 0x02000000]);
  });

  it('estimates wire time from BYTES, because the link is byte-limited', () => {
    const big: D890WriteFrame[] = Array.from({ length: 8389 }, (_, i) => ({
      address: 0x01000000 + i * 16,
      data: new Uint8Array(16),
      what: 'bulk',
    }));
    const run = dryRunWrite(big);
    // The vendor's real session: 8,389 frames, 134,224 payload bytes.
    expect(run.payloadBytes).toBe(134_224);
    expect(run.estimatedSeconds).toBeGreaterThan(15);
    expect(run.estimatedSeconds).toBeLessThan(30);
  });

  it('refuses a guarded flash-management offset before anything is sent', () => {
    // This is what a dry run is FOR: the refusal happens with no port open.
    // These offsets repeat at EVERY stride, so check one well away from zero —
    // a guard that only fired at the first would pass a naive test and miss
    // every real occurrence.
    for (const offset of D890_FORBIDDEN_UNIT_OFFSETS) {
      const address = D890_FLASH_MARKER_STRIDE * 4 + offset;
      const bad: D890WriteFrame[] = [
        { address, data: new Uint8Array(16), what: 'should never happen' },
      ];
      expect(
        () => dryRunWrite(bad),
        `0x${address.toString(16)} was not refused`
      ).toThrow();
    }
  });

  it('refuses the single forbidden address', () => {
    const bad: D890WriteFrame[] = [
      { address: D890_FORBIDDEN_WRITE_ADDRESS, data: new Uint8Array(16), what: 'nope' },
    ];
    expect(() => dryRunWrite(bad)).toThrow();
  });

  it('refuses an unaligned address before anything is sent', () => {
    const bad: D890WriteFrame[] = [
      { address: 0x01000001, data: new Uint8Array(16), what: 'misaligned' },
    ];
    expect(() => dryRunWrite(bad)).toThrow();
  });
});
