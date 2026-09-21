import { describe, it, expect } from 'vitest';
import { channelListPreview } from '../../src/components/ui/pickerItems';

const names = new Map([
  [1, 'Local Rptr'],
  [2, 'Simplex'],
  [3, 'Airport'],
  [4, 'Marine'],
]);

describe("a zone's or scan list's channels in its row", () => {
  it('names the first few channels and counts the rest', () => {
    expect(channelListPreview([1, 2, 3, 4], names)).toBe('1 Local Rptr, 2 Simplex, 3 Airport +1 more');
    expect(channelListPreview([2, 1], names)).toBe('2 Simplex, 1 Local Rptr');
  });

  it('shows the number alone for a channel that no longer exists', () => {
    expect(channelListPreview([9, 1], names)).toBe('9, 1 Local Rptr');
  });
});
