import { describe, it, expect } from 'vitest';
import { lowestFreeSlot } from '../../src/utils/lowestFreeSlot';

describe('lowestFreeSlot', () => {
  it('reuses a hole rather than appending past it', () => {
    // The bug this exists for: radio IDs in slots 0, 1 and 3 are three entries,
    // so `length` would hand out slot 3 and overwrite the one already there —
    // and slot 2 would stay empty forever.
    expect(lowestFreeSlot([0, 1, 3], 64)).toBe(2);
  });

  it('returns 0 for an empty table', () => {
    expect(lowestFreeSlot([], 64)).toBe(0);
  });

  it('reuses slot 0 when that is the hole', () => {
    // The measured scan list case: slot 0 deleted, slot 1 still occupied.
    expect(lowestFreeSlot([1], 100)).toBe(0);
  });

  it('appends after a contiguous run', () => {
    expect(lowestFreeSlot([0, 1, 2], 64)).toBe(3);
  });

  it('returns undefined when full, rather than a slot past the end', () => {
    expect(lowestFreeSlot([0, 1, 2], 3)).toBeUndefined();
  });

  it('ignores slots at or beyond the limit', () => {
    expect(lowestFreeSlot([99, 100], 4)).toBe(0);
  });

  it('accepts a Set as well as an array', () => {
    expect(lowestFreeSlot(new Set([0, 2]), 8)).toBe(1);
  });
});
