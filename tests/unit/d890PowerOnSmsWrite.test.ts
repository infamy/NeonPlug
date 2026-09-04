import { describe, it, expect } from 'vitest';
import {
  parsePowerOnDisplay,
  encodePowerOnDisplay,
  D890_POWER_ON,
} from '../../src/radios/d890uv/powerOnDisplay';
import {
  parsePredefinedSms,
  encodePredefinedSms,
} from '../../src/radios/d890uv/predefinedSms';

/**
 * The power-on span and one pre-defined SMS slot, verbatim from the vendor
 * CPS's programming session.
 *
 * The power-on span is the one place on this radio where a single region uses
 * TWO encodings: the two greeting lines are UTF-16LE and the password is plain
 * ASCII. The captured bytes settle it — "WELCOME" / "ANYTONE" wide, and
 * "12345678" one byte per character. Writing the password wide would give the
 * radio a password with a NUL between every character: accepted by the write,
 * and then the user cannot unlock their radio.
 */
const POWER_ON =
  '570045004c0043004f004d004500000000000000000000000000000000000000' +
    '41004e00590054004f004e004500000000000000000000000000000000000000' +
    '3132333435363738000000000000000000000000000000000000000000000000';

const SMS_SLOT =
  '480065006c006c006f0021000000000000000000000000000000000000000000' +
    '0000000000000000000000000000000000000000000000000000000000000000' +
    '0000000000000000000000000000000000000000000000000000000000000000';
const bytes = (hex: string) =>
  new Uint8Array((hex.match(/../g) ?? []).map((h) => parseInt(h, 16)));
const hex = (b: Uint8Array) =>
  Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

describe('power-on display encoder', () => {
  it('reads what the radio was actually given', () => {
    const d = parsePowerOnDisplay(bytes(POWER_ON));
    expect(d.line1).toBe('WELCOME');
    expect(d.line2).toBe('ANYTONE');
    expect(d.password).toBe('12345678');
  });

  it('round-trips the vendor span', () => {
    const original = bytes(POWER_ON);
    expect(hex(encodePowerOnDisplay(original, parsePowerOnDisplay(original)))).toBe(hex(original));
  });

  it('writes the password as ASCII, not wide characters', () => {
    const original = bytes(POWER_ON);
    const out = encodePowerOnDisplay(original, {
      ...parsePowerOnDisplay(original),
      password: 'AB',
    });
    // One byte per character. Wide would give 41 00 42 00.
    expect([out[0x40], out[0x41], out[0x42]]).toEqual([0x41, 0x42, 0x00]);
  });

  it('writes the greeting lines as wide characters', () => {
    const original = bytes(POWER_ON);
    const out = encodePowerOnDisplay(original, {
      ...parsePowerOnDisplay(original),
      line1: 'AB',
    });
    expect([out[0x00], out[0x01], out[0x02], out[0x03]]).toEqual([0x41, 0x00, 0x42, 0x00]);
  });

  it('clears the tail so a shortened line does not keep its old text', () => {
    const original = bytes(POWER_ON);
    const out = encodePowerOnDisplay(original, {
      ...parsePowerOnDisplay(original),
      line1: 'HI',
    });
    expect(parsePowerOnDisplay(out).line1).toBe('HI');
    // And line 2 is untouched by a line 1 edit.
    expect(parsePowerOnDisplay(out).line2).toBe('ANYTONE');
  });

  it('clips a line to what the field holds', () => {
    const original = bytes(POWER_ON);
    const out = encodePowerOnDisplay(original, {
      ...parsePowerOnDisplay(original),
      line1: 'X'.repeat(60),
    });
    expect(parsePowerOnDisplay(out).line1.length).toBeLessThanOrEqual(D890_POWER_ON.TEXT_CHARS);
  });

  it('refuses a span too short to patch', () => {
    expect(() =>
      encodePowerOnDisplay(new Uint8Array(8), { line1: 'a', line2: 'b', password: 'c' })
    ).toThrow();
  });
});

describe('pre-defined SMS encoder', () => {
  it('round-trips the vendor slot', () => {
    const original = bytes(SMS_SLOT);
    const text = parsePredefinedSms(original);
    expect(text).toBe('Hello!');
    // encodePredefinedSms builds a fresh slot rather than patching — the slot
    // is nothing but the message, so there are no unmodelled bytes to keep.
    const out = encodePredefinedSms(text!);
    expect(hex(out.subarray(0, 0x60))).toBe(hex(original.subarray(0, 0x60)));
  });

  it('round-trips through the parser for a changed message', () => {
    expect(parsePredefinedSms(encodePredefinedSms('On my way'))).toBe('On my way');
  });
});
