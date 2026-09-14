import { describe, it, expect } from 'vitest';
import { encodeBroadcastScanMask, D890_BROADCAST } from '../../src/radios/d890uv/broadcastChannels';
import type { D890BroadcastChannel } from '../../src/radios/d890uv/broadcastChannels';

/**
 * FM's scan mask is FLAT — one bit per channel index.
 *
 * Deliberately unlike AM's, which is a u32 bitmap per zone over member
 * POSITIONS. The difference decides where each belongs in the UI: an FM channel
 * has exactly one scan state so it is a column on the channel table, while an
 * AM channel's depends on which zone is being scanned, so it lives on the
 * zone's members.
 *
 * Read into `scanAdd` and shown since the driver started; never written until
 * 2026-09-03, and the region sits inside a verbatim preserve run — so an edit
 * was actively overwritten with its pre-edit bytes on every write.
 */
const ch = (index: number, scanAdd?: boolean): D890BroadcastChannel =>
  ({ index, name: `FM${index}`, frequency: 88 + index / 10, scanAdd });

describe('FM scan mask', () => {
  it('sets a bit per channel index, LSB first', () => {
    const out = encodeBroadcastScanMask(new Uint8Array(0x10), [
      ch(0, true), ch(1, false), ch(2, true), ch(9, true),
    ]);
    expect(out[0]).toBe(0b00000101);   // bits 0 and 2
    expect(out[1]).toBe(0b00000010);   // bit 9 -> byte 1 bit 1
  });

  it('clears a bit when scan is turned off', () => {
    const original = new Uint8Array(0x10).fill(0xff);
    const out = encodeBroadcastScanMask(original, [ch(3, false)]);
    expect(out[0]).toBe(0xff & ~(1 << 3));
  });

  it('patches — bits for channels not listed survive', () => {
    // Slots this write does not carry belong to the radio, same rule as the
    // presence masks.
    const original = new Uint8Array(0x10).fill(0xff);
    const out = encodeBroadcastScanMask(original, [ch(0, false)]);
    expect(out[0]).toBe(0xfe);
    expect(Array.from(out.subarray(1))).toEqual(Array.from(original.subarray(1)));
  });

  it('leaves the bit alone when scan state is unknown', () => {
    // `scanAdd` is undefined for AM, where the flag is not a per-channel fact.
    // Writing false would assert something never established.
    const original = new Uint8Array(0x10).fill(0xff);
    expect(Array.from(encodeBroadcastScanMask(original, [ch(0, undefined)])))
      .toEqual(Array.from(original));
  });

  it('ignores an index past the end of the mask', () => {
    const out = encodeBroadcastScanMask(new Uint8Array(0x10), [ch(9999, true)]);
    expect(out.every((b) => b === 0)).toBe(true);
  });

  it('is a different address and shape from the AM scan table', () => {
    expect(D890_BROADCAST.fm.scanMask).toBeDefined();
    expect('scanMask' in D890_BROADCAST.am).toBe(false);
  });
});
