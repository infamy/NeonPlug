import { describe, it, expect } from 'vitest';
import { describeChannelDelete } from '../../src/services/channelDelete';

const list = (n: number) => Array.from({ length: n }, (_, i) => ({ number: i + 1 }));
const numbered = (...numbers: number[]) => numbers.map((number) => ({ number }));

describe('what a channel delete says it does', () => {
  it('names the channels that move up after one delete', () => {
    expect(describeChannelDelete(list(312), [5])).toBe('Channels 6–312 move up one, and zones and scan lists follow.');
    expect(describeChannelDelete(list(3), [2])).toBe('Channel 3 moves up one, and zones and scan lists follow.');
  });

  it('says nothing moves when the last channels go', () => {
    expect(describeChannelDelete(list(10), [10])).toBe('');
    expect(describeChannelDelete(list(10), [9, 10])).toBe('');
  });

  it('says where a run of channels lands when it moves by more than one', () => {
    expect(describeChannelDelete(list(10), [5, 6])).toBe('Channels 7–10 become 5–8, and zones and scan lists follow.');
    expect(describeChannelDelete(numbered(1, 2, 3, 10), [3])).toBe(
      'Channel 10 becomes 3, and zones and scan lists follow.'
    );
  });

  it('gives the ends when channels move by different amounts, as they do across gaps', () => {
    expect(describeChannelDelete(list(10), [7, 3])).toBe(
      '6 channels get new numbers, from 4 becoming 3 to 10 becoming 8, and zones and scan lists follow.'
    );
    const withGap = [...list(20), ...numbered(100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110)];
    expect(describeChannelDelete(withGap, [5])).toBe(
      '26 channels get new numbers, from 6 becoming 5 to 110 becoming 30, and zones and scan lists follow.'
    );
  });

  it('leaves VFO rows out of it', () => {
    expect(describeChannelDelete(numbered(1, 2, 3, 4001, 4002), [1])).toBe(
      'Channels 2–3 move up one, and zones and scan lists follow.'
    );
  });

  it('says how many of them the search is hiding', () => {
    expect(describeChannelDelete(list(10), [9, 10], 1)).toBe('1 of them is hidden by the search.');
    expect(describeChannelDelete(list(10), [2, 3], 2)).toBe(
      'Channels 4–10 become 2–8, and zones and scan lists follow. 2 of them are hidden by the search.'
    );
  });
});
