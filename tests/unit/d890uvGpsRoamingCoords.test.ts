import { describe, it, expect } from 'vitest';
import {
  decimalToGpsRoamingPosition,
  gpsRoamingPositionToDecimal,
  parseGpsRoamingEntry,
} from '../../src/radios/d890uv/gpsRoaming';

const asLat = (p: ReturnType<typeof decimalToGpsRoamingPosition>) => ({
  degrees: p.degrees,
  minutes: p.minutes,
  minuteFraction: p.minuteFraction,
  south: p.negative,
});

describe('GPS roaming coordinate encoding', () => {
  it('splits a positive coordinate into degrees, minutes and hundredths', () => {
    // 51.5° = 51° 30.00'
    expect(decimalToGpsRoamingPosition(51.5)).toEqual({
      degrees: 51, minutes: 30, minuteFraction: 0, negative: false,
    });
  });

  it('carries the sign in the hemisphere flag, never in the magnitude', () => {
    // Every stored component is an unsigned byte, so a negative degrees value
    // would wrap to 255 on the radio.
    const p = decimalToGpsRoamingPosition(-0.75);
    expect(p.negative).toBe(true);
    expect(p.degrees).toBe(0);
    expect(p.minutes).toBe(45);
  });

  it('carries hundredths into minutes rather than storing 100', () => {
    // 0.0166666° = 0.99999' → rounds to 1.00', not 0 minutes and 100 hundredths.
    const p = decimalToGpsRoamingPosition(0.0166666);
    expect(p.minuteFraction).toBeLessThan(100);
    expect(p).toEqual({ degrees: 0, minutes: 1, minuteFraction: 0, negative: false });
  });

  it('carries minutes into degrees rather than storing 60', () => {
    // 51.99999° is 51° 59.9994' — the rounding pushes minutes to 60, which the
    // radio cannot represent.
    const p = decimalToGpsRoamingPosition(51.99999);
    expect(p.minutes).toBeLessThan(60);
    expect(p).toEqual({ degrees: 52, minutes: 0, minuteFraction: 0, negative: false });
  });

  it('round-trips within the precision the format actually has', () => {
    // Hundredths of a minute is ~18.5 m, so the format cannot hold more than
    // that. The test asserts the format's precision, not an invented one.
    for (const value of [0, 51.4778, -0.0014, 179.9, -89.5, 33.333333]) {
      const back = gpsRoamingPositionToDecimal(asLat(decimalToGpsRoamingPosition(value)));
      expect(Math.abs(back - value)).toBeLessThan(1 / 60 / 100);
    }
  });

  it('keeps every component inside a single unsigned byte', () => {
    for (const value of [-179.99999, 179.99999, 89.99999, -89.99999]) {
      const p = decimalToGpsRoamingPosition(value);
      for (const n of [p.degrees, p.minutes, p.minuteFraction]) {
        expect(n).toBeGreaterThanOrEqual(0);
        expect(n).toBeLessThanOrEqual(255);
      }
    }
  });
});

describe('GPS roaming vacancy', () => {
  const rec = (patch: Record<number, number> = {}) => {
    const b = new Uint8Array(0x20);
    for (const [k, v] of Object.entries(patch)) b[Number(k)] = v;
    return b;
  };

  it('drops a record that MIXES 0x00 and 0xFF', () => {
    // The live failure: ONOFF 0x00 with ZONE 0xFF is neither uniformly erased
    // nor uniformly zeroed, so a uniformity test kept it and the UI showed 32
    // geofences at "255 (no such zone)", 0.00000, 0.00000.
    expect(parseGpsRoamingEntry(rec({ 0x01: 0xff }), 0)).toBeNull();
    expect(parseGpsRoamingEntry(rec({ 0x03: 0xff, 0x05: 0xff }), 0)).toBeNull();
  });

  it('still drops the uniform cases', () => {
    expect(parseGpsRoamingEntry(new Uint8Array(0x20), 0)).toBeNull();
    expect(parseGpsRoamingEntry(new Uint8Array(0x20).fill(0xff), 0)).toBeNull();
  });

  it('keeps a record with any byte that is neither 0x00 nor 0xFF', () => {
    // Enabled, zone 2, 51 degrees north — every one of those is a value a
    // uniformity-or-sentinel test must not discard.
    const entry = parseGpsRoamingEntry(rec({ 0x00: 0x01, 0x01: 0x02, 0x02: 51 }), 4);
    expect(entry).not.toBeNull();
    expect(entry!.enabled).toBe(true);
    expect(entry!.zone).toBe(2);
    expect(entry!.latitude.degrees).toBe(51);
  });
});
