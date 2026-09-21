import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { VENDOR_WRITE_RUNS } from '../../src/radios/d890uv/codeplugWrite';

/**
 * `VENDOR_WRITE_RUNS` against the vendor's own write, captured from the wire.
 *
 * The fixture is not derived from the source it checks: it was produced by
 * parsing `WriteTo7x2.txt` — a capture of the OEM CPS writing a full codeplug —
 * with `tools/parse-serial-capture.mjs --writes`. So this is an independent
 * oracle rather than a restatement.
 *
 * Why it matters more than it looks: the preserve pass reads exactly these runs
 * so a write can put back regions this driver does not model. A run missing
 * from the list is a region a NeonPlug write leaves stale or zeroed — silent,
 * and only visible on the radio afterwards.
 */
const fixture = JSON.parse(
  readFileSync(new URL('../fixtures/d890uv/vendor-write-runs.json', import.meta.url), 'utf8')
) as { runs: [string, number][]; frames: number };

describe('DA-7X2 vendor write runs', () => {
  const captured = new Map(fixture.runs.map(([a, s]) => [parseInt(a, 16), s]));
  const ours = new Map(VENDOR_WRITE_RUNS.map((r) => [r.address, r.bytes]));

  it('covers every run the vendor CPS actually writes', () => {
    const missing = [...captured.keys()]
      .filter((a) => !ours.has(a))
      .map((a) => `0x${a.toString(16)}`);
    expect(missing, 'regions the CPS writes that our preserve pass would miss').toEqual([]);
  });

  it('invents no run the vendor never writes', () => {
    const extra = [...ours.keys()]
      .filter((a) => !captured.has(a))
      .map((a) => `0x${a.toString(16)}`);
    expect(extra).toEqual([]);
  });

  it('agrees on the length of every run', () => {
    const bad = [...captured.entries()]
      .filter(([a, size]) => ours.get(a) !== size)
      .map(([a, size]) => `0x${a.toString(16)}: capture ${size}, ours ${ours.get(a)}`);
    expect(bad).toEqual([]);
  });

  it('is the whole capture, not a subset of it', () => {
    expect(captured.size).toBe(74);
    const total = [...captured.values()].reduce((a, b) => a + b, 0);
    // 8,389 frames of 16 bytes, less the partial final frame of each run.
    expect(total).toBeGreaterThan(74 * 16);
    expect(fixture.frames).toBe(8389);
  });
});
