import { describe, it, expect } from 'vitest';
import {
  decodeBCDFrequency,
  encodeBCDFrequency,
  decodeCTCSSDCS,
  encodeCTCSSDCS,
} from '../../src/radios/dm32uv/structures';

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

  it('decodes DCS normal polarity (high=0x80, code in low byte)', () => {
    // code 23 decimal, high=0x80 → DCS, not inverted
    expect(decodeCTCSSDCS(new Uint8Array([0x17, 0x80]))).toEqual({
      type: 'DCS',
      value: 23,
      polarity: 'N',
    });
  });

  it('decodes DCS inverted polarity (high >= 0xC0)', () => {
    // code 23, high=0xC0 → DCS, inverted
    expect(decodeCTCSSDCS(new Uint8Array([0x17, 0xC0]))).toEqual({
      type: 'DCS',
      value: 23,
      polarity: 'P',
    });
  });

  it('decodes DCS codes > 255 using high nibble of high byte', () => {
    // high=0x81: DCS (>=0x80), not inverted (<0xC0), highNibble=0x01 → code=(1<<8)|0x2C=300
    expect(decodeCTCSSDCS(new Uint8Array([0x2C, 0x81]))).toEqual({
      type: 'DCS',
      value: 300,
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

  it('encodes DCS normal polarity as [code, 0x80]', () => {
    expect(encodeCTCSSDCS({ type: 'DCS', value: 23, polarity: 'N' })).toEqual(
      new Uint8Array([0x17, 0x80])
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

  it('DCS normal polarity round-trips for codes ≤ 255', () => {
    const input = { type: 'DCS' as const, value: 23, polarity: 'N' as const };
    expect(decodeCTCSSDCS(encodeCTCSSDCS(input))).toEqual(input);
  });

  // Known encoder bug: encodeCTCSSDCS uses polarityBit=0x01 for inverted ('P'), producing
  // high byte 0x81. But decodeCTCSSDCS expects high >= 0xC0 for inverted and reads
  // bit 0 of the high byte as part of the code's highNibble. The round-trip is broken:
  // encode({type:'DCS', value:23, polarity:'P'}) → [0x17, 0x81]
  // decode([0x17, 0x81]) → {type:'DCS', value:279, polarity:'N'}  ← wrong value and polarity
  // This test locks in the current broken behaviour so any future fix is a deliberate change.
  it('DCS inverted polarity does NOT round-trip (known encoder bug)', () => {
    const input = { type: 'DCS' as const, value: 23, polarity: 'P' as const };
    const roundTripped = decodeCTCSSDCS(encodeCTCSSDCS(input));
    expect(roundTripped).not.toEqual(input);
  });
});
