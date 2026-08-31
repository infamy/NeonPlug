import { describe, it, expect } from 'vitest';
import { alignZoneCurrentChannels } from '../../src/radios/d890uv/structures';

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
