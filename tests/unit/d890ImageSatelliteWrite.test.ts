import { describe, it, expect } from 'vitest';
import {
  encodeD890Image,
  decodeD890Image,
  D890_IMAGE,
} from '../../src/radios/d890uv/bootImage';
import {
  encodeSatelliteSlot,
  buildSatelliteTable,
  decodeSatelliteTable,
  D890_SATELLITE,
} from '../../src/radios/d890uv/satellite';

/**
 * Pictures and the satellite table.
 *
 * ⚠️ **Weaker evidence than every other encoder test here.** Neither region
 * appears in the vendor CPS's codeplug write — pictures are read on demand and
 * satellites live behind its Tools menu — so there are no captured bytes to
 * compare against. These are self-consistency round trips: encode, decode, and
 * check the model survives. They prove the pair are inverses of each other,
 * NOT that either matches what the radio expects.
 *
 * Said out loud because the distinction matters on a write path: a matched pair
 * of wrong functions round-trips perfectly.
 */

describe('boot / background image codec', () => {
  const rgba = (w: number, h: number) => {
    const out = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i += 1) {
      // Values chosen to survive RGB565 exactly: 5/6/5 bits means the low bits
      // of an 8-bit channel are lost, so a naive gradient would fail the round
      // trip for reasons that have nothing to do with the encoder.
      out[i * 4] = (i % 32) * 8;
      out[i * 4 + 1] = (i % 64) * 4;
      out[i * 4 + 2] = ((i >> 3) % 32) * 8;
      out[i * 4 + 3] = 255;
    }
    return out;
  };

  it('produces exactly the bytes one picture region holds', () => {
    const out = encodeD890Image(rgba(D890_IMAGE.WIDTH, D890_IMAGE.HEIGHT), D890_IMAGE.WIDTH, D890_IMAGE.HEIGHT);
    expect(out).toHaveLength(D890_IMAGE.BYTES);
    // 40,960 bytes at 16 per frame — the write is 2,560 frames per picture,
    // which is why these are not part of a codeplug read or write.
    expect(D890_IMAGE.BYTES / 0x10).toBe(D890_IMAGE.FRAMES);
  });

  it('encode and decode are inverses for RGB565-exact colours', () => {
    const source = rgba(D890_IMAGE.WIDTH, D890_IMAGE.HEIGHT);
    const encoded = encodeD890Image(source, D890_IMAGE.WIDTH, D890_IMAGE.HEIGHT);
    const decoded = decodeD890Image(encoded);
    const reencoded = encodeD890Image(decoded, D890_IMAGE.WIDTH, D890_IMAGE.HEIGHT);
    expect(Array.from(reencoded)).toEqual(Array.from(encoded));
  });

  it('refuses a source with no pixels', () => {
    expect(() => encodeD890Image(new Uint8ClampedArray(0), 0, 0)).toThrow();
  });

  it('refuses a source shorter than its stated dimensions', () => {
    expect(() => encodeD890Image(new Uint8ClampedArray(16), 160, 128)).toThrow();
  });
});

describe('satellite table', () => {
  const sat = (name: string) => ({
    name,
    tleLine1: '1 25544U 98067A   24001.00000000  .00016717  00000-0  10270-3 0  9002',
    tleLine2: '2 25544  51.6416 247.4627 0006703 130.5360 325.0288 15.49815350 12345',
    rxFreq1: 145_800_000,
    txFreq1: 437_800_000,
  });

  it('builds a table of exactly the right size', () => {
    expect(buildSatelliteTable([sat('ISS')])).toHaveLength(D890_SATELLITE.TABLE_BYTES);
  });

  it('round-trips name and TLE fragments through the table', () => {
    const table = buildSatelliteTable([sat('ISS'), sat('AO-91')]);
    const decoded = decodeSatelliteTable(table);
    expect(decoded.map((d) => d.name)).toEqual(['ISS', 'AO-91']);
    for (const d of decoded) {
      expect(d.tleFragment1.length).toBeGreaterThan(0);
      expect(d.rxFreq1).toBe(145_800_000);
      expect(d.txFreq1).toBe(437_800_000);
    }
  });

  it('drops satellites with no TLE rather than writing empty slots', () => {
    const blank = { ...sat('EMPTY'), tleLine1: '   ' };
    expect(decodeSatelliteTable(buildSatelliteTable([sat('ISS'), blank]))).toHaveLength(1);
  });

  it('refuses more satellites than the radio holds', () => {
    const many = Array.from({ length: D890_SATELLITE.SLOTS + 1 }, (_, i) => sat(`S${i}`));
    expect(() => buildSatelliteTable(many)).toThrow(/holds 25 satellites/);
  });

  it('leaves bytes 93-95 zero, as the vendor serializer does', () => {
    const slot = encodeSatelliteSlot(sat('ISS'));
    expect([slot[93], slot[94], slot[95]]).toEqual([0, 0, 0]);
  });

  it('writes only the bytes the vendor writes, not the whole 512-byte slot', () => {
    // Only bytes 0..119 carry data; 120..511 stay zero. That is also why the
    // READ can fetch 128 bytes per slot instead of 512.
    const slot = encodeSatelliteSlot(sat('ISS'));
    expect(slot).toHaveLength(D890_SATELLITE.SLOT_BYTES);
    for (let i = D890_SATELLITE.SLOT_USED_BYTES; i < slot.length; i += 1) {
      expect(slot[i], `byte ${i} should be zero`).toBe(0);
    }
  });
});
