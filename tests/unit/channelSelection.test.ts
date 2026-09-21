import { describe, it, expect } from 'vitest';
import { selectByClick } from '../../src/components/channels/channelSelection';

const shown = [1, 2, 3, 5, 8];
const click = (selected: number[], n: number, how: { shift?: boolean; toggle?: boolean }, anchor: number | null) => {
  const result = selectByClick(new Set(selected), n, { shift: !!how.shift, toggle: !!how.toggle }, shown, anchor);
  return { selected: [...result.selected].sort((a, b) => a - b), anchor: result.anchor };
};

describe('selecting channels by clicking', () => {
  it('selects just the clicked channel on a plain click', () => {
    expect(click([1, 2], 5, {}, 1)).toEqual({ selected: [5], anchor: 5 });
  });

  it('adds or removes one channel with Cmd, Ctrl, Alt or its checkbox', () => {
    expect(click([1], 5, { toggle: true }, 1)).toEqual({ selected: [1, 5], anchor: 5 });
    expect(click([1, 5], 5, { toggle: true }, 1)).toEqual({ selected: [1], anchor: 5 });
  });

  it('selects the shown channels from the last click to this one with Shift', () => {
    expect(click([2], 8, { shift: true }, 2)).toEqual({ selected: [2, 3, 5, 8], anchor: 2 });
    expect(click([8], 1, { shift: true }, 8)).toEqual({ selected: [1, 2, 3, 5, 8], anchor: 8 });
  });

  it('selects only the clicked channel when the last click is no longer shown', () => {
    expect(click([4], 3, { shift: true }, 4)).toEqual({ selected: [3], anchor: 4 });
  });
});
