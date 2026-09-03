import { describe, it, expect } from 'vitest';
import {
  parseD890AprsSettings,
  encodeD890AprsSettings,
} from '../../src/radios/d890uv/aprs';

/**
 * The APRS region, verbatim from the vendor CPS's programming session - real
 * callsigns and all (APAT51 to BG6LKK).
 *
 * Only about 0x50 of this region's 0x100 bytes are decoded, so the preservation
 * property carries more weight here than anywhere else: over half of what a
 * write sends is bytes this driver cannot read.
 */
const APRS_REGION =
  '00000000003c0000130028000101220c49006c32000041504154353100424736' +
    '4c4b4b0857494445312d3100000000000000000000000000002f260096000000' +
    'a20fa20fa20fa20fa20fa20fa20fa20f00000000000000000000000000000000' +
    '0000000000000000000000000000000000000000000000000000000000000000' +
    '0000000000000000000000000000000000000000000000000000000000000000' +
    '0000000000000000000000000000000000000000000000000000000000000000' +
    '0000000000000000000000000000000000000000000000000000000000000000' +
    '0000000000000000000000000000000000000000000000000000000000000000';

const bytes = (hex: string) =>
  new Uint8Array((hex.match(/../g) ?? []).map((h) => parseInt(h, 16)));
const hex = (b: Uint8Array) =>
  Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

describe('APRS settings encoder', () => {
  const region = bytes(APRS_REGION);

  it('reads the callsigns the radio was given', () => {
    const aprs = parseD890AprsSettings(region)!;
    expect(aprs.destinationCall).toBe('APAT51');
    expect(aprs.sourceCall).toBe('BG6LKK');
  });

  it('round-trips the vendor region', () => {
    const aprs = parseD890AprsSettings(region)!;
    expect(hex(encodeD890AprsSettings(region, aprs))).toBe(hex(region));
  });

  it('preserves the half of the region it cannot decode', () => {
    const marked = new Uint8Array(0x100).fill(0x5a);
    const out = encodeD890AprsSettings(marked, parseD890AprsSettings(region)!);
    for (let i = 0x50; i < 0x100; i += 1) {
      expect(out[i], `byte 0x${i.toString(16)} was written`).toBe(0x5a);
    }
  });

  it('divides by the same factor the parser multiplies by', () => {
    // txDelayMs is stored x20 and prewaveMs x10, both on a single observation.
    // A round trip holds either way; what is unproven is whether the
    // millisecond figure is right. Never change one side alone.
    const aprs = parseD890AprsSettings(region)!;
    const out = encodeD890AprsSettings(region, { ...aprs, txDelayMs: 1200, prewaveMs: 1500 });
    expect(out[0x05]).toBe(60);
    expect(out[0x3c]).toBe(150);
    const back = parseD890AprsSettings(out)!;
    expect(back.txDelayMs).toBe(1200);
    expect(back.prewaveMs).toBe(1500);
  });

  it('writes a shorter callsign without leaving the old tail', () => {
    const aprs = parseD890AprsSettings(region)!;
    const out = encodeD890AprsSettings(region, { ...aprs, sourceCall: 'M0ABC' });
    expect(parseD890AprsSettings(out)!.sourceCall).toBe('M0ABC');
  });

  it('never writes a byte the reader would refuse to read back', () => {
    // fixedAscii stops at anything outside printable ASCII, so writing one
    // would truncate the field on the next read.
    const aprs = parseD890AprsSettings(region)!;
    const out = encodeD890AprsSettings(region, { ...aprs, digipeaterPath: 'WIDE1-1' });
    expect(parseD890AprsSettings(out)!.digipeaterPath).toBe('WIDE1-1');
  });

  it('writes the no-channel sentinel for an unset upload slot', () => {
    const aprs = parseD890AprsSettings(region)!;
    const out = encodeD890AprsSettings(region, {
      ...aprs,
      digitalUploadChannels: [null, null, null, null, null, null, null, null],
    });
    expect(parseD890AprsSettings(out)!.digitalUploadChannels.every((c) => c === null)).toBe(true);
  });

  it('refuses a region too short to patch', () => {
    const aprs = parseD890AprsSettings(region)!;
    expect(() => encodeD890AprsSettings(new Uint8Array(8), aprs)).toThrow();
  });
});
