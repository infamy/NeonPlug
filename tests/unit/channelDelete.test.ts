import { describe, it, expect } from 'vitest';
import { describeChannelDelete } from '../../src/services/channelDelete';

const list = (n: number) => Array.from({ length: n }, (_, i) => ({ number: i + 1 }));

describe('what a channel delete says it does', () => {
  it('names the channels that move up after one delete', () => {
    expect(describeChannelDelete(list(312), [5])).toBe('Channels 6–312 move up one, and zones and scan lists follow.');
    expect(describeChannelDelete(list(3), [2])).toBe('Channel 3 moves up one, and zones and scan lists follow.');
  });

  it('says nothing moves when the last channels go', () => {
    expect(describeChannelDelete(list(10), [10])).toBe('');
    expect(describeChannelDelete(list(10), [9, 10])).toBe('');
  });

  it('counts from the first channel deleted, leaving out the others being deleted', () => {
    expect(describeChannelDelete(list(10), [7, 3])).toBe('Channels 4–10 move up, and zones and scan lists follow.');
  });

  it('says how many of them the search is hiding', () => {
    expect(describeChannelDelete(list(10), [9, 10], 1)).toBe('1 of them is hidden by the search.');
    expect(describeChannelDelete(list(10), [2, 3], 2)).toBe(
      'Channels 4–10 move up, and zones and scan lists follow. 2 of them are hidden by the search.'
    );
  });
});
