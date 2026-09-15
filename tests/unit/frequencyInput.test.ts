import { describe, it, expect } from 'vitest';
import { parseFrequencyInput } from '../../src/utils/frequencyInput';

const read = (text: string) => {
  const parsed = parseFrequencyInput(text);
  return parsed.ok ? parsed.mhz : `error: ${parsed.error}`;
};

describe('reading a typed frequency', () => {
  it('reads MHz, with a decimal point or a decimal comma', () => {
    expect(read('145.500')).toBe(145.5);
    expect(read('145,500')).toBe(145.5);
    expect(read(' 446.00625 ')).toBe(446.00625);
  });

  it('reads a number too big to be MHz as kHz or Hz', () => {
    expect(read('146520')).toBe(146.52);
    expect(read('146520000')).toBe(146.52);
    expect(read('146,520,000')).toBe(146.52);
  });

  it('takes the unit when one is typed', () => {
    expect(read('146.52 MHz')).toBe(146.52);
    expect(read('146520kHz')).toBe(146.52);
    expect(read('146520000 Hz')).toBe(146.52);
  });

  it('says what is wrong rather than guessing', () => {
    expect(read('')).toBe('error: Enter a frequency in MHz.');
    expect(read('abc')).toBe('error: "abc" is not a frequency.');
    expect(read('0')).toBe('error: A frequency must be above 0.');
    expect(parseFrequencyInput('-146.52').ok).toBe(false);
    expect(parseFrequencyInput('1296 MHz').ok).toBe(false);
  });
});
