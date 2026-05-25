import { describe, it, expect } from 'vitest';
import { getNextChannelNumber, selectionCardClass } from '../../src/utils/importHelpers';
import type { Channel } from '../../src/models';

function ch(number: number): Channel {
  return { number } as unknown as Channel;
}

describe('getNextChannelNumber', () => {
  it('returns 1 when channel list is empty', () => {
    expect(getNextChannelNumber([])).toBe(1);
  });

  it('returns next sequential number when list is contiguous from 1', () => {
    expect(getNextChannelNumber([ch(1), ch(2), ch(3)])).toBe(4);
  });

  it('returns 1 when lowest slot is free (gap at start)', () => {
    expect(getNextChannelNumber([ch(2), ch(3)])).toBe(1);
  });

  it('fills the first gap in a non-contiguous list', () => {
    expect(getNextChannelNumber([ch(1), ch(3), ch(4)])).toBe(2);
  });

  it('handles a single channel at 1', () => {
    expect(getNextChannelNumber([ch(1)])).toBe(2);
  });

  it('handles channels in unsorted order', () => {
    expect(getNextChannelNumber([ch(3), ch(1), ch(2)])).toBe(4);
  });

  it('handles large gaps — always returns the lowest free slot', () => {
    expect(getNextChannelNumber([ch(1), ch(2), ch(100)])).toBe(3);
  });
});

describe('selectionCardClass', () => {
  it('contains common layout classes in both states', () => {
    const base = 'border rounded p-3 cursor-pointer transition-colors';
    expect(selectionCardClass(true)).toContain(base);
    expect(selectionCardClass(false)).toContain(base);
  });

  it('selected state includes cyan background', () => {
    expect(selectionCardClass(true)).toContain('bg-neon-cyan bg-opacity-10');
  });

  it('unselected state includes reduced opacity border', () => {
    expect(selectionCardClass(false)).toContain('border-opacity-30');
  });

  it('selected and unselected return different strings', () => {
    expect(selectionCardClass(true)).not.toBe(selectionCardClass(false));
  });
});
