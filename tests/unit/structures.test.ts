import { describe, it, expect } from 'vitest';
import {
  decodeBCDFrequency,
  encodeBCDFrequency,
  decodeCTCSSDCS,
  encodeCTCSSDCS,
} from '../../src/radios/dm32uv/structures';
import { DCS_CODES } from '../../src/utils/ctcssConstants';

// ─── BCD frequency ────────────────────────────────────────────────────────────

describe('decodeBCDFrequency', () => {
  it('throws for fewer than 4 bytes', () => {
    expect(() => decodeBCDFrequency(new Uint8Array([0x00, 0x00, 0x00]))).toThrow('4 bytes');
  });

  it('decodes 146.52 MHz from radio byte order', () => {
    // Bytes stored LSB-first: [0x00, 0x20, 0x65, 0x14] → 14652000 → 146.52 MHz
    expect(decodeBCDFrequency(new Uint8Array([0x00, 0x20, 0x65, 0x14]))).toBeCloseTo(146.52, 4);
  });

  it('decodes 440.000 MHz from radio byte order', () => {
    // [0x00, 0x00, 0x00, 0x44] → 44000000 → 440.000 MHz
    expect(decodeBCDFrequency(new Uint8Array([0x00, 0x00, 0x00, 0x44]))).toBeCloseTo(440.0, 4);
  });

  it('decodes all-zeros as 0.0 MHz', () => {
    expect(decodeBCDFrequency(new Uint8Array([0x00, 0x00, 0x00, 0x00]))).toBe(0);
  });
});

describe('encodeBCDFrequency', () => {
  it('encodes 146.52 MHz to correct byte order', () => {
    expect(encodeBCDFrequency(146.52)).toEqual(new Uint8Array([0x00, 0x20, 0x65, 0x14]));
  });

  it('encodes 440.000 MHz to correct byte order', () => {
    expect(encodeBCDFrequency(440.0)).toEqual(new Uint8Array([0x00, 0x00, 0x00, 0x44]));
  });

  it('always returns exactly 4 bytes', () => {
    expect(encodeBCDFrequency(146.52)).toHaveLength(4);
    expect(encodeBCDFrequency(0)).toHaveLength(4);
  });
});

describe('BCD frequency round-trip', () => {
  const frequencies = [146.52, 440.0, 162.4, 462.5625, 87.5];

  for (const freq of frequencies) {
    it(`round-trips ${freq} MHz`, () => {
      expect(decodeBCDFrequency(encodeBCDFrequency(freq))).toBeCloseTo(freq, 3);
    });
  }
});

// ─── CTCSS/DCS decode ─────────────────────────────────────────────────────────

describe('decodeCTCSSDCS', () => {
  it('returns None for empty buffer', () => {
    expect(decodeCTCSSDCS(new Uint8Array([]))).toEqual({ type: 'None' });
  });

  it('returns None for single byte', () => {
    expect(decodeCTCSSDCS(new Uint8Array([0x00]))).toEqual({ type: 'None' });
  });

  it('returns None for 0xFF 0xFF sentinel', () => {
    expect(decodeCTCSSDCS(new Uint8Array([0xFF, 0xFF]))).toEqual({ type: 'None' });
  });

  it('returns None when decoded CTCSS frequency is zero', () => {
    // Both bytes 0x00: hundreds=tens=ones=decimal=0 → frequency=0 → None
    expect(decodeCTCSSDCS(new Uint8Array([0x00, 0x00]))).toEqual({ type: 'None' });
  });

  it('decodes CTCSS 67.0 Hz', () => {
    // low=0x70 (ones=7, decimal=0), high=0x06 (hundreds=0, tens=6)
    const r = decodeCTCSSDCS(new Uint8Array([0x70, 0x06]));
    expect(r.type).toBe('CTCSS');
    expect(r.value).toBeCloseTo(67.0, 1);
  });

  it('decodes CTCSS 100.0 Hz', () => {
    // low=0x00, high=0x10 (hundreds=1, tens=0)
    const r = decodeCTCSSDCS(new Uint8Array([0x00, 0x10]));
    expect(r.type).toBe('CTCSS');
    expect(r.value).toBeCloseTo(100.0, 1);
  });

  it('decodes CTCSS 127.3 Hz', () => {
    const r = decodeCTCSSDCS(new Uint8Array([0x73, 0x12]));
    expect(r.type).toBe('CTCSS');
    expect(r.value).toBeCloseTo(127.3, 1);
  });

  it('decodes CTCSS 203.5 Hz', () => {
    const r = decodeCTCSSDCS(new Uint8Array([0x35, 0x20]));
    expect(r.type).toBe('CTCSS');
    expect(r.value).toBeCloseTo(203.5, 1);
  });

  it('decodes DCS normal polarity (BCD digits, high byte 0x80-0xBF)', () => {
    // D023N → [0x23, 0x80] per DM32-Protocol-Spec/06-ENCODING.md
    expect(decodeCTCSSDCS(new Uint8Array([0x23, 0x80]))).toEqual({
      type: 'DCS',
      value: 23,
      polarity: 'N',
    });
  });

  it('decodes DCS inverted polarity (high byte >= 0xC0)', () => {
    // D023I → [0x23, 0xC0]
    expect(decodeCTCSSDCS(new Uint8Array([0x23, 0xC0]))).toEqual({
      type: 'DCS',
      value: 23,
      polarity: 'P',
    });
  });

  it('decodes DCS codes >= 100 (hundreds digit in high byte low nibble)', () => {
    // D754N → [0x54, 0x87]
    expect(decodeCTCSSDCS(new Uint8Array([0x54, 0x87]))).toEqual({
      type: 'DCS',
      value: 754,
      polarity: 'N',
    });
  });
});

// ─── CTCSS/DCS encode ─────────────────────────────────────────────────────────

describe('encodeCTCSSDCS', () => {
  it('encodes None to [0x00, 0x00]', () => {
    expect(encodeCTCSSDCS({ type: 'None' })).toEqual(new Uint8Array([0x00, 0x00]));
  });

  it('encodes None with explicit undefined value to [0x00, 0x00]', () => {
    expect(encodeCTCSSDCS({ type: 'None', value: undefined })).toEqual(new Uint8Array([0x00, 0x00]));
  });

  it('encodes CTCSS 67.0 Hz', () => {
    expect(encodeCTCSSDCS({ type: 'CTCSS', value: 67.0 })).toEqual(new Uint8Array([0x70, 0x06]));
  });

  it('encodes CTCSS 100.0 Hz', () => {
    expect(encodeCTCSSDCS({ type: 'CTCSS', value: 100.0 })).toEqual(new Uint8Array([0x00, 0x10]));
  });

  it('encodes CTCSS 127.3 Hz', () => {
    expect(encodeCTCSSDCS({ type: 'CTCSS', value: 127.3 })).toEqual(new Uint8Array([0x73, 0x12]));
  });

  it('encodes CTCSS 203.5 Hz', () => {
    expect(encodeCTCSSDCS({ type: 'CTCSS', value: 203.5 })).toEqual(new Uint8Array([0x35, 0x20]));
  });

  it('encodes DCS normal polarity as BCD digits with 0x80 base', () => {
    // D023N → [0x23, 0x80] per DM32-Protocol-Spec/06-ENCODING.md
    expect(encodeCTCSSDCS({ type: 'DCS', value: 23, polarity: 'N' })).toEqual(
      new Uint8Array([0x23, 0x80])
    );
  });

  it('encodes DCS inverted polarity with 0xC0 base and hundreds digit', () => {
    // D754I → [0x54, 0xC7]
    expect(encodeCTCSSDCS({ type: 'DCS', value: 754, polarity: 'P' })).toEqual(
      new Uint8Array([0x54, 0xC7])
    );
  });

  it('always returns exactly 2 bytes', () => {
    expect(encodeCTCSSDCS({ type: 'None' })).toHaveLength(2);
    expect(encodeCTCSSDCS({ type: 'CTCSS', value: 100 })).toHaveLength(2);
    expect(encodeCTCSSDCS({ type: 'DCS', value: 23, polarity: 'N' })).toHaveLength(2);
  });
});

// ─── CTCSS/DCS round-trips ────────────────────────────────────────────────────

describe('CTCSS/DCS round-trip', () => {
  it('None round-trips through encode → decode', () => {
    expect(decodeCTCSSDCS(encodeCTCSSDCS({ type: 'None' }))).toEqual({ type: 'None' });
  });

  const ctcssTones = [67.0, 100.0, 127.3, 203.5];

  for (const tone of ctcssTones) {
    it(`CTCSS ${tone} Hz round-trips`, () => {
      const decoded = decodeCTCSSDCS(encodeCTCSSDCS({ type: 'CTCSS', value: tone }));
      expect(decoded.type).toBe('CTCSS');
      expect(decoded.value).toBeCloseTo(tone, 1);
    });
  }

  for (const polarity of ['N', 'P'] as const) {
    it(`every standard DCS code round-trips with polarity ${polarity}`, () => {
      for (const code of DCS_CODES) {
        const input = { type: 'DCS' as const, value: code, polarity };
        expect(decodeCTCSSDCS(encodeCTCSSDCS(input))).toEqual(input);
      }
    });
  }
});
