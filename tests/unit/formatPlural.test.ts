import { describe, it, expect } from 'vitest';
import { formatPlural } from '../../src/utils/formatPlural';

describe('formatPlural', () => {
  it('returns singular form when count is 1', () => {
    expect(formatPlural(1, 'channel')).toBe('channel');
  });

  it('returns plural form when count is 0', () => {
    expect(formatPlural(0, 'channel')).toBe('channels');
  });

  it('returns plural form when count is 2', () => {
    expect(formatPlural(2, 'channel')).toBe('channels');
  });

  it('returns plural form for large counts', () => {
    expect(formatPlural(100, 'contact')).toBe('contacts');
  });

  it('appends s for default plural', () => {
    expect(formatPlural(3, 'zone')).toBe('zones');
    expect(formatPlural(3, 'scan list')).toBe('scan lists');
  });

  it('uses custom plural when provided and count is not 1', () => {
    expect(formatPlural(2, 'country', 'countries')).toBe('countries');
    expect(formatPlural(0, 'country', 'countries')).toBe('countries');
  });

  it('returns singular when count is 1 even with custom plural', () => {
    expect(formatPlural(1, 'country', 'countries')).toBe('country');
  });

  it('works with negative counts as non-singular', () => {
    expect(formatPlural(-1, 'channel')).toBe('channels');
  });
});
