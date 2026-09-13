import { describe, it, expect } from 'vitest';
import {
  parseD890Settings,
  encodeD890Settings,
} from '../../src/radios/d890uv/settingsFormat';
import {
  D890_SETTINGS_FIELDS,
  D890_SETTINGS_BITFIELDS,
  D890_UNMAPPED_BYTES,
} from '../../src/radios/d890uv/settingsMap';

/**
 * The whole 0x160-byte settings region, verbatim from the vendor CPS's
 * programming session — i.e. bytes a real radio accepted.
 *
 * This is the highest-leverage round trip available: one test exercises every
 * mapped field, bitfield, frequency and alert-tone step at once. A settings
 * write is also the one most likely to corrupt something invisibly, because
 * many settings SHARE a byte — an encoder that writes a whole byte from one
 * field's value silently clears its neighbours.
 */
const SETTINGS_REGION =
  '010100000400020005010100000a010201120c13080101010205050205000100' +
    '0000000000000401000101000001020118000100000000020101000800000000' +
    '010000000000010100000000000300000201000000000000005a6202006cdc02' +
    '0085cf00c0800901ffff0000000000000000e8030000e8030000e8030a000a00' +
    '0a000a000a00d0070000d0070000d0070a000a000a000a000a00b80b0000b80b' +
    '0000b80b0a000a000a000a000a00000000000000000502020000000000000b00' +
    '000001000085cf00c0800901005a6202006cdc020000000000ffff0000000000' +
    '00000000000000000000010a02000000ffff00000085cf00c0800901005a6202' +
    '006cdc02010019010100010000000000000000000000b80b0000b80b0000b80b' +
    '0a000a000a000a000a00b80b0000b80b0000b80b0a000a000a000a000a000001' +
    '0000000000000000000000000000000000000000000000000000000000000000';
const bytes = (hex: string) =>
  new Uint8Array((hex.match(/../g) ?? []).map((h) => parseInt(h, 16)));
const hex = (b: Uint8Array) =>
  Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

describe('settings encoder', () => {
  const region = bytes(SETTINGS_REGION);

  it('recovered the whole region from the capture', () => {
    expect(region).toHaveLength(0x160);
  });

  it('round-trips every mapped field at once', () => {
    const settings = parseD890Settings(region);
    expect(settings, 'the region should parse').not.toBeNull();
    expect(hex(encodeD890Settings(region, settings!))).toBe(hex(region));
  });

  it('never writes the unmapped bytes', () => {
    // Their meaning is unknown, so the only safe thing is to hand them back
    // exactly as the radio had them. Proved by asking the encoder to write a
    // region of 0x5a and checking those offsets survive.
    const marked = new Uint8Array(region.length).fill(0x5a);
    const out = encodeD890Settings(marked, parseD890Settings(region)!);
    for (const { offset } of D890_UNMAPPED_BYTES) {
      expect(out[offset], `unmapped byte 0x${offset.toString(16)} was written`).toBe(0x5a);
    }
  });

  it('does not let two settings that share a byte clobber each other', () => {
    // The real hazard. If any two entries write the same offset, the last one
    // wins and silently discards the first — so either no two share an offset,
    // or the encoder must merge them. This asserts which world we are in.
    const offsets = [
      ...D890_SETTINGS_FIELDS.map((f) => f.offset),
      ...D890_SETTINGS_BITFIELDS.map((b) => b.offset),
    ];
    const seen = new Map<number, number>();
    for (const o of offsets) seen.set(o, (seen.get(o) ?? 0) + 1);
    const shared = [...seen.entries()].filter(([, n]) => n > 1).map(([o]) => `0x${o.toString(16)}`);
    expect(shared, `these offsets are written by more than one entry: ${shared.join(', ')}`)
      .toEqual([]);
  });

  it('writes a changed field without disturbing its neighbours', () => {
    const settings = parseD890Settings(region)!;
    const field = D890_SETTINGS_FIELDS.find((f) => typeof settings[f.key] === 'number')!;
    const current = settings[field.key] as number;
    const out = encodeD890Settings(region, { ...settings, [field.key]: (current + 1) & 0xff });
    for (let i = 0; i < region.length; i += 1) {
      if (i === field.offset) continue;
      expect(out[i], `byte 0x${i.toString(16)} moved when only 0x${field.offset.toString(16)} should`)
        .toBe(region[i]);
    }
  });
});
