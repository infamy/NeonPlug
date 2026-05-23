import { describe, it, expect } from 'vitest';
import { mergeOverlappingChannels, getChannelFrequencyKey, getChannelFullKey } from '../../src/services/channelMerger';
import { createDefaultChannel } from '../../src/utils/channelHelpers';

function ch(number: number, rx: number, tx: number, name = `CH${number}`) {
  return createDefaultChannel({ number, rxFrequency: rx, txFrequency: tx, name });
}

describe('mergeOverlappingChannels', () => {
  it('passes through unique-frequency channels unchanged in count', () => {
    const { mergedChannels } = mergeOverlappingChannels([[ch(1, 146.52, 146.52), ch(2, 147.0, 147.6)]]);
    expect(mergedChannels).toHaveLength(2);
  });

  it('deduplicates channels with identical rx+tx frequencies', () => {
    const set1 = [ch(1, 146.52, 146.52)];
    const set2 = [ch(2, 146.52, 146.52)];
    const { mergedChannels } = mergeOverlappingChannels([set1, set2]);
    expect(mergedChannels).toHaveLength(1);
  });

  it('assigns sequential numbers starting from startChannelNumber', () => {
    const channels = [ch(1, 146.52, 146.52), ch(2, 147.0, 147.6)];
    const { mergedChannels } = mergeOverlappingChannels([channels], 10);
    expect(mergedChannels[0].number).toBe(10);
    expect(mergedChannels[1].number).toBe(11);
  });

  it('maps original channel numbers to merged numbers', () => {
    const set1 = [ch(1, 146.52, 146.52)];
    const set2 = [ch(5, 146.52, 146.52)];
    const { channelMapping } = mergeOverlappingChannels([set1, set2], 1);
    expect(channelMapping.get(1)).toBe(1);
    expect(channelMapping.get(5)).toBe(1);
  });

  it('handles multiple channel sets without cross-contamination', () => {
    const set1 = [ch(1, 146.52, 146.52), ch(2, 151.625, 151.625)];
    const set2 = [ch(1, 462.5625, 467.5625)];
    const { mergedChannels } = mergeOverlappingChannels([set1, set2]);
    expect(mergedChannels).toHaveLength(3);
  });

  it('returns empty array for empty input', () => {
    const { mergedChannels, channelMapping } = mergeOverlappingChannels([]);
    expect(mergedChannels).toHaveLength(0);
    expect(channelMapping.size).toBe(0);
  });

  it('defaults startChannelNumber to 1', () => {
    const { mergedChannels } = mergeOverlappingChannels([[ch(99, 146.52, 146.52)]]);
    expect(mergedChannels[0].number).toBe(1);
  });
});

describe('getChannelFrequencyKey', () => {
  it('formats rx and tx with 4 decimal places', () => {
    const key = getChannelFrequencyKey(ch(1, 146.52, 146.52));
    expect(key).toBe('146.5200-146.5200');
  });

  it('produces the same key for channels with identical frequencies', () => {
    const a = ch(1, 147.0, 147.6);
    const b = ch(2, 147.0, 147.6);
    expect(getChannelFrequencyKey(a)).toBe(getChannelFrequencyKey(b));
  });
});

describe('getChannelFullKey', () => {
  it('includes both frequency and name', () => {
    const key = getChannelFullKey(ch(1, 146.52, 146.52, 'TestCh'));
    expect(key).toContain('146.5200');
    expect(key).toContain('TestCh');
  });
});
