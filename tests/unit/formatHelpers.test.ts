import { describe, it, expect } from 'vitest';
import { formatAddress, formatBytes, clamp } from '../../src/utils/formatHelpers';

describe('formatAddress', () => {
  it('returns N/A when address is undefined', () => {
    expect(formatAddress(undefined)).toBe('N/A');
    expect(formatAddress()).toBe('N/A');
  });

  it('formats zero as six-digit hex', () => {
    expect(formatAddress(0)).toBe('0x000000');
  });

  it('pads short addresses to six digits', () => {
    expect(formatAddress(0x42)).toBe('0x000042');
    expect(formatAddress(0x1234)).toBe('0x001234');
  });

  it('formats a full six-digit address', () => {
    expect(formatAddress(0xABCDEF)).toBe('0xABCDEF');
  });

  it('uses uppercase hex digits', () => {
    expect(formatAddress(0xabcdef)).toBe('0xABCDEF');
  });

  it('formats max safe 24-bit address', () => {
    expect(formatAddress(0xFFFFFF)).toBe('0xFFFFFF');
  });
});

describe('formatBytes', () => {
  it('returns "0 B" for zero bytes', () => {
    expect(formatBytes(0)).toBe('0 B');
  });

  it('formats bytes under 1 KB', () => {
    expect(formatBytes(1)).toBe('1.0 B');
    expect(formatBytes(512)).toBe('512.0 B');
    expect(formatBytes(1023)).toBe('1023.0 B');
  });

  it('formats exactly 1 KB', () => {
    expect(formatBytes(1024)).toBe('1.0 KB');
  });

  it('formats kilobytes', () => {
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(2048)).toBe('2.0 KB');
  });

  it('formats megabytes', () => {
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB');
    expect(formatBytes(1024 * 1024 * 1.5)).toBe('1.5 MB');
  });

  it('formats gigabytes', () => {
    expect(formatBytes(1024 * 1024 * 1024)).toBe('1.0 GB');
  });
});

describe('clamp', () => {
  it('returns the value when within range', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(0, 0, 10)).toBe(0);
    expect(clamp(10, 0, 10)).toBe(10);
  });

  it('clamps to min when value is below range', () => {
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(-100, 0, 10)).toBe(0);
  });

  it('clamps to max when value is above range', () => {
    expect(clamp(11, 0, 10)).toBe(10);
    expect(clamp(1000, 0, 10)).toBe(10);
  });

  it('works with negative ranges', () => {
    expect(clamp(-5, -10, -1)).toBe(-5);
    expect(clamp(0, -10, -1)).toBe(-1);
    expect(clamp(-20, -10, -1)).toBe(-10);
  });

  it('works when min equals max', () => {
    expect(clamp(5, 3, 3)).toBe(3);
    expect(clamp(0, 3, 3)).toBe(3);
  });
});
