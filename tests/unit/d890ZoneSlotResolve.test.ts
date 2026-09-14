import { describe, it, expect } from 'vitest';
import { resolveZoneSlots } from '../../src/services/d890WriteInput';

/**
 * Zones are placed by IDENTITY, never by position in the list.
 *
 * Position looks like a key right up until the list is edited. On 2026-09-03,
 * deleting zone 2 from an 8-zone codeplug wrote all seven survivors ONE SLOT
 * DOWN — names and members moved together so it looked perfect, while the
 * slot-keyed A/B pointers stayed behind and three ended up past the end of
 * their new zone. Adding a zone was worse: position 8 against 8 staged slots
 * resolved to -1, and the zone was skipped with no record and no mask bit.
 */
const zs = (...ids: string[]) => ids.map((id) => ({ id }));

describe('zone slots resolve by identity', () => {
  const staged = { a: 0, b: 1, c: 2, d: 3 };

  it('keeps every surviving zone on its own slot when one is deleted', () => {
    // 'b' removed — c and d must NOT slide down into 1 and 2.
    expect(resolveZoneSlots(zs('a', 'c', 'd'), staged)).toEqual([0, 2, 3]);
  });

  it('gives a new zone the lowest slot nothing else holds', () => {
    // 1 is free because 'b' is gone; 'new' takes it rather than colliding.
    expect(resolveZoneSlots(zs('a', 'c', 'd', 'new'), staged)).toEqual([0, 2, 3, 1]);
  });

  it('never hands a new zone a slot an existing zone still holds', () => {
    // The bug this guards: allocating while walking would give 'new' slot 1,
    // which 'b' still occupies later in the list.
    const out = resolveZoneSlots(zs('a', 'new', 'b', 'c'), staged);
    expect(out).toEqual([0, 3, 1, 2]);
    expect(new Set(out).size, 'slots must be unique').toBe(out.length);
  });

  it('places several new zones without collision', () => {
    const out = resolveZoneSlots(zs('n1', 'n2', 'n3'), {});
    expect(out).toEqual([0, 1, 2]);
  });

  it('is unchanged when nothing was edited', () => {
    expect(resolveZoneSlots(zs('a', 'b', 'c', 'd'), staged)).toEqual([0, 1, 2, 3]);
  });

  it('handles a codeplug read with gaps in its slots', () => {
    // Empty slots are dropped on read, so staged slots are not contiguous.
    const sparse = { x: 0, y: 4, z: 9 };
    expect(resolveZoneSlots(zs('x', 'y', 'z'), sparse)).toEqual([0, 4, 9]);
    expect(resolveZoneSlots(zs('x', 'y', 'z', 'new'), sparse)).toEqual([0, 4, 9, 1]);
  });
});
