import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  alignZoneCurrentChannels,
  decodeOccupancyMask,
  parseZone,
} from '../../src/radios/d890uv/structures';
import { D890_ADDR } from '../../src/radios/d890uv/constants';

/**
 * The A/B tables are indexed by hardware zone slot; the zones array has empty
 * slots removed. Getting this wrong shows one zone's current channel against a
 * different zone — and only on radios with a gap in their zone slots, which is
 * exactly the case a densely-packed test codeplug would never catch.
 */
describe('zone current channel alignment', () => {
  it('is the identity when zones fill slots from 0 with no gaps', () => {
    const raw = { a: [3, 1, 4, 1, 5], b: [9, 2, 6, 5, 3] };
    expect(alignZoneCurrentChannels(raw, [0, 1, 2])).toEqual({ a: [3, 1, 4], b: [9, 2, 6] });
  });

  it('follows the slot, not the array position, across a gap', () => {
    // Zones live in slots 0, 3, 7 — the case that makes a naive index wrong.
    const raw = { a: [10, 0, 0, 40, 0, 0, 0, 80], b: [11, 0, 0, 44, 0, 0, 0, 88] };
    expect(alignZoneCurrentChannels(raw, [0, 3, 7])).toEqual({ a: [10, 40, 80], b: [11, 44, 88] });
    // and is NOT what indexing by array position would have given
    expect(alignZoneCurrentChannels(raw, [0, 3, 7]).a).not.toEqual([10, 0, 0]);
  });

  it('reads a missing table entry as 0 rather than undefined', () => {
    // A short read must not put `undefined` into the store, where it would
    // render as an empty cell indistinguishable from position 0.
    const out = alignZoneCurrentChannels({ a: [7], b: [] }, [0, 5]);
    expect(out).toEqual({ a: [7, 0], b: [0, 0] });
  });

  it('returns nothing for a radio with no zones', () => {
    expect(alignZoneCurrentChannels({ a: [1, 2], b: [3, 4] }, [])).toEqual({ a: [], b: [] });
  });
});

describe('zone hidden flag', () => {
  it('is a second mask over the same slots, not a variant of presence', () => {
    // Zone 2 hidden, zones 1 and 3 not. A hidden zone is still PRESENT —
    // conflating the two masks would drop a hidden zone's channels entirely.
    const hide = new Uint8Array(0x20);
    hide[0] = 0b0000_0010;
    const decoded = decodeOccupancyMask(hide, 250);
    expect(decoded[0]).toBe(false);
    expect(decoded[1]).toBe(true);
    expect(decoded[2]).toBe(false);
  });

  it('carries the flag onto the parsed zone', () => {
    const name = new Uint8Array(0x22);
    const members = new Uint8Array(0x40);
    members[0] = 0x00; members[1] = 0x00;   // member: channel 1
    members[2] = 0xff; members[3] = 0xff;   // terminator
    expect(parseZone(name, members, 0, true).hidden).toBe(true);
    expect(parseZone(name, members, 0, false).hidden).toBe(false);
  });

  it('sits immediately after the presence mask, with no gap', () => {
    // 250 zones is 32 bytes of mask, so the two regions are back to back.
    // Pinned because a note transcribed between machines once read this address
    // as 0x3482c28 (an OCR slip), which would leave an 8-byte hole. A wrong
    // address here fails silently — both regions are zeros until a zone is
    // actually hidden — so the invariant is cheaper than the discovery.
    expect(D890_ADDR.ZONE_SET + D890_ADDR.ZONE_SET_SIZE).toBe(D890_ADDR.ZONE_HIDE);
    expect(Math.ceil(250 / 8)).toBe(D890_ADDR.ZONE_HIDE_SIZE);
  });
});

/**
 * The hidden mask as read off a real DA-7X2 (dump of 0x3480000, 2026-08-29),
 * on a radio whose owner confirms no zone is hidden.
 *
 * What this DOES establish: the address holds a clean, well-formed mask rather
 * than erased flash or unrelated data. Its neighbour at 0x3482c00 reads exactly
 * one present zone in the same dump, so the address family is right.
 *
 * What it does NOT establish, and the reason this radio has burned us before:
 * an all-zero read cannot separate "correct address, nothing hidden" from
 * "wrong address that happens to be zeros". Only a radio with a KNOWN hidden
 * zone can do that — one specific bit has to flip. Until then the polarity
 * (set = hidden) is marshaller-derived, not observed.
 */
describe('zone hidden mask, against a real dump', () => {
  const HIDE = new Uint8Array(readFileSync(join(__dirname, '../fixtures/d890uv/zone-hide.bin')));

  it('is a full 32-byte mask, not a short or padded read', () => {
    expect(HIDE.length).toBe(0x20);
  });

  it('reads as no zones hidden, matching the radio it came from', () => {
    expect(decodeOccupancyMask(HIDE, 250).some(Boolean)).toBe(false);
  });

  it('is zeros rather than erased 0xFF', () => {
    // An unused region on this radio reads 0xFF. Zeros mean the vendor wrote
    // this mask, which is weak evidence the address is real — and it is the
    // only evidence an unhidden radio can give.
    expect(HIDE.every((b) => b === 0x00)).toBe(true);
    expect(HIDE.some((b) => b === 0xff)).toBe(false);
  });
});

describe('zone hidden mask, with one zone actually hidden', () => {
  /**
   * Read off the radio 2026-08-31 after hiding exactly one zone from its own
   * menu — zone 1, "Z1 Single", confirmed by name with the radio's owner. The
   * present mask at 0x3482c00 read 0xFF (8 zones); this read 0x01.
   * One bit for one hidden zone is what proves polarity and bit order together
   * — an all-zero mask, which is what two earlier captures held, could prove
   * neither.
   */
  const HIDE = new Uint8Array(
    readFileSync(join(__dirname, '../fixtures/d890uv/zone-hide-one-set.bin'))
  );

  it('reads a SET bit as hidden, not as visible', () => {
    const decoded = decodeOccupancyMask(HIDE, 250);
    expect(decoded.filter(Boolean)).toHaveLength(1);
    expect(decoded[0]).toBe(true);
  });

  it('puts zone 1 in bit 0 — LSB first, like the present mask', () => {
    // If the bit order were reversed, hiding zone 1 would light bit 7 and the
    // UI would flag a different zone entirely.
    expect(HIDE[0]).toBe(0x01);
    expect(decodeOccupancyMask(HIDE, 250)[1]).toBe(false);
  });
});
