import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  D890_IMAGE,
  imageByteIndex,
  rgbToRgb565,
  rgb565ToRgb,
  encodeD890Image,
  decodeD890Image,
  planImageWrite,
  D890_IMAGE_ADDRESS,
} from '../../src/radios/d890uv/bootImage';
import {
  parsePredefinedSms,
  encodePredefinedSms,
  predefinedSmsAddress,
} from '../../src/radios/d890uv/predefinedSms';
import {
  D890_SATELLITE,
  buildSatelliteTable,
  encodeSatelliteSlot,
  tleFragment1,
  tleFragment2,
  ctcssIndex,
  dcsIndex,
  countDroppedSatellites,
  SATELLITE_BLANK_U32,
  decodeSatelliteTable,
} from '../../src/radios/d890uv/satellite';

/** A real ISS TLE, used because its fragments are checkable by eye. */
const TLE1 = '1 25544U 98067A   24001.50000000  .00016717  00000+0  30777-3 0  9993';
const TLE2 = '2 25544  51.6416 247.4627 0006703 130.5360 325.0288 15.49309239 43163';

describe('DA-7X2 boot / BK image format', () => {
  it('is column-major, which is the easiest thing to get backwards', () => {
    // Stepping x by one moves a whole column (128 pixels x 2 bytes); stepping y
    // by one moves 2 bytes. A row-major reading would swap these, and would
    // still produce a 40960-byte buffer that looks fine until you view it.
    expect(imageByteIndex(0, 0)).toBe(0);
    expect(imageByteIndex(0, 1)).toBe(2);
    expect(imageByteIndex(1, 0)).toBe(256);
    expect(imageByteIndex(159, 127)).toBe(D890_IMAGE.BYTES - 2);
  });

  it('stores the high byte of each pixel first', () => {
    const rgba = new Uint8ClampedArray(4);
    rgba.set([255, 0, 0, 255]); // pure red -> 0xF800
    const buf = encodeD890Image(rgba, 1, 1);
    expect(rgbToRgb565(255, 0, 0)).toBe(0xf800);
    expect(buf[0]).toBe(0xf8);
    expect(buf[1]).toBe(0x00);
  });

  it('round-trips white to white rather than darkening it', () => {
    // RGB565 has 5/6/5 bits, so decode must replicate the high bits into the
    // gap. Zero-filling would turn 255 into 248 and every save/load cycle would
    // dim the picture a little more.
    expect(rgb565ToRgb(0xffff)).toEqual({ r: 255, g: 255, b: 255 });
    expect(rgb565ToRgb(0x0000)).toEqual({ r: 0, g: 0, b: 0 });
  });

  it('produces exactly 40960 bytes from any source size', () => {
    const src = new Uint8ClampedArray(40 * 30 * 4).fill(128);
    expect(encodeD890Image(src, 40, 30).length).toBe(D890_IMAGE.BYTES);
    expect(D890_IMAGE.BYTES).toBe(0xa000);
    expect(D890_IMAGE.FRAMES).toBe(2560);
  });

  it('survives an encode/decode round trip within RGB565 precision', () => {
    const w = 160, h = 128;
    const src = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i += 1) {
      src[i * 4] = (i * 7) & 0xf8;
      src[i * 4 + 1] = (i * 3) & 0xfc;
      src[i * 4 + 2] = (i * 11) & 0xf8;
      src[i * 4 + 3] = 255;
    }
    const back = decodeD890Image(encodeD890Image(src, w, h));
    for (let i = 0; i < w * h; i += 1) {
      expect(Math.abs(back[i * 4] - src[i * 4])).toBeLessThanOrEqual(8);
      expect(Math.abs(back[i * 4 + 1] - src[i * 4 + 1])).toBeLessThanOrEqual(4);
    }
  });

  it('rejects a source buffer too small for its stated size', () => {
    expect(() => encodeD890Image(new Uint8ClampedArray(4), 100, 100)).toThrow(/need/);
  });

  it('plans 2560 frames at the right base for each of the three images', () => {
    const img = new Uint8Array(D890_IMAGE.BYTES);
    for (const kind of ['boot', 'bk1', 'bk2'] as const) {
      const frames = planImageWrite(kind, img);
      expect(frames).toHaveLength(2560);
      expect(frames[0].address).toBe(D890_IMAGE_ADDRESS[kind]);
      expect(frames[2559].address).toBe(D890_IMAGE_ADDRESS[kind] + 0xa000 - 0x10);
      expect(frames.every((f) => f.data.length === 0x10)).toBe(true);
    }
    expect(D890_IMAGE_ADDRESS.boot).toBe(0x3f80000);
    expect(D890_IMAGE_ADDRESS.bk1).toBe(0x4000000);
    expect(D890_IMAGE_ADDRESS.bk2).toBe(0x4080000);
  });

  it('refuses to plan a write from a wrongly sized buffer', () => {
    expect(() => planImageWrite('boot', new Uint8Array(100))).toThrow(/exactly/);
  });
});

describe('DA-7X2 satellite table', () => {
  const iss = { name: 'ISS', tleLine1: TLE1, tleLine2: TLE2 };

  it('cuts full TLE lines at the documented offsets, not at character zero', () => {
    // The trap: the machine-readable spec says "truncate to 25", but the radio
    // wants Mid$(line1, 19, 25) — the fetcher does that cut, not the serializer.
    // Truncating a full line instead yields the line number and catalogue number,
    // which is wrong data that still looks plausible in a hex dump.
    expect(tleFragment1(TLE1)).toBe('24001.50000000  .00016717');
    expect(tleFragment1(TLE1)).not.toContain('25544U');
    expect(tleFragment2(TLE2)).toBe(' 51.6416 247.4627 0006703 130.5360 325.0288 15.49309239 4316');
    expect(tleFragment1(TLE1).length).toBeLessThanOrEqual(25);
    expect(tleFragment2(TLE2).length).toBeLessThanOrEqual(60);
  });

  it('passes an already-extracted fragment straight through', () => {
    expect(tleFragment1('24001.50000000  .00016717')).toBe('24001.50000000  .00016717');
  });

  it('writes blank frequencies as 0xFFFFFFFF, not as zero', () => {
    // Zero is a legal frequency; the vendor uses all-ones for "unset".
    const slot = encodeSatelliteSlot(iss);
    expect(Array.from(slot.subarray(96, 100))).toEqual([0xff, 0xff, 0xff, 0xff]);
    expect(SATELLITE_BLANK_U32).toBe(0xffffffff);
  });

  it('writes frequencies little-endian at the mapped offsets', () => {
    const slot = encodeSatelliteSlot({ ...iss, rxFreq1: 0x12345678, txFreq1: 1 });
    expect(Array.from(slot.subarray(96, 100))).toEqual([0x78, 0x56, 0x34, 0x12]);
    expect(Array.from(slot.subarray(100, 104))).toEqual([1, 0, 0, 0]);
  });

  it('leaves bytes 93..95 and 120..511 untouched', () => {
    const slot = encodeSatelliteSlot({ ...iss, rxFreq1: 1, aprsTxFreq: 2, armTxCdt: 3 });
    expect(Array.from(slot.subarray(93, 96))).toEqual([0, 0, 0]);
    expect(slot.subarray(D890_SATELLITE.SLOT_USED_BYTES).every((b) => b === 0)).toBe(true);
  });

  it('resolves the CTCSS tone the vendor CPS can never match', () => {
    // The CPS loops `To ListCount - 2`, so 254.1 silently falls through and the
    // field is left at 0 — which is 62.5, a completely different tone. Raising
    // is the correct behaviour; reproducing the bug would write a wrong tone.
    expect(ctcssIndex('62.5')).toBe(0);
    expect(ctcssIndex('88.5')).toBe(9);
    expect(ctcssIndex('254.1')).toBe(50);
    expect(() => ctcssIndex('123.456')).toThrow(/Unknown/);
  });

  it('reads DCS codes as octal with an inversion offset', () => {
    expect(dcsIndex('D023N')).toBe(19);
    expect(dcsIndex('D023I')).toBe(19 + 512);
    expect(() => dcsIndex('D999N')).toThrow();
  });

  it('drops a satellite with a blank TLE line 1 without consuming a slot', () => {
    const list = [
      { name: 'A', tleLine1: TLE1, tleLine2: TLE2 },
      { name: 'B', tleLine1: '   ', tleLine2: TLE2 },
      { name: 'C', tleLine1: TLE1, tleLine2: TLE2 },
    ];
    expect(countDroppedSatellites(list)).toBe(1);
    const table = buildSatelliteTable(list);
    // 'C' must land in slot 1, not slot 2 — the blank row is not a gap.
    expect(String.fromCharCode(table[0])).toBe('A');
    expect(String.fromCharCode(table[D890_SATELLITE.SLOT_BYTES])).toBe('C');
  });

  it('zero-fills every unused slot, which is data loss by design', () => {
    // The vendor serializer clears through slot 24, so a three-satellite upload
    // erases the other 22. Reproduced deliberately: hiding it would make the
    // radio's contents differ from what the caller was shown.
    const table = buildSatelliteTable([{ name: 'ISS', tleLine1: TLE1, tleLine2: TLE2 }]);
    expect(table.length).toBe(12800);
    expect(table.subarray(D890_SATELLITE.SLOT_BYTES).every((b) => b === 0)).toBe(true);
    expect(D890_SATELLITE.TABLE_BYTES / 0x10).toBe(800);
  });

  it('refuses more satellites than the radio has slots', () => {
    const many = Array.from({ length: 26 }, () => ({ name: 'X', tleLine1: TLE1, tleLine2: TLE2 }));
    expect(() => buildSatelliteTable(many)).toThrow(/25/);
  });
});

/**
 * 40960 bytes read off a DA-7X2 on 2026-08-30, after the NeonPlug logo was
 * written as the boot image through the vendor CPS.
 *
 * This capture is what turned the image format from "verified from the vendor
 * disassembly" into "verified on hardware". Before it, both image regions read
 * all 0xFF — erased flash, which is exactly as consistent with "never written"
 * as with "wrong address", the same ambiguity AES and ARC4 sat in.
 *
 * Note the radio's copy is horizontally stretched relative to the source: the
 * vendor CPS scales to 160x128 ignoring aspect ratio. That is a property of its
 * WRITE path, not of the decode.
 */
const BOOT = new Uint8Array(readFileSync(join(__dirname, '../fixtures/d890uv/boot-image.bin')));

describe('DA-7X2 boot image, against a real radio', () => {
  const px = (x: number, y: number) => (BOOT[(x * 128 + y) * 2] << 8) | BOOT[(x * 128 + y) * 2 + 1];

  it('is column-major, proved by where the black bars landed', () => {
    // The source was a square logo fitted into 160x128, leaving black bars down
    // the left and right. Column-major puts those at the start and end of the
    // buffer; row-major would scatter them across every row. Measured on this
    // capture: ~99% / ~93% black in the outer 16 columns, against ~63% for a
    // row-major reading — not a close call.
    const blackFrac = (x0: number, x1: number) => {
      let black = 0, total = 0;
      for (let x = x0; x < x1; x += 1) for (let y = 0; y < 128; y += 1) { total += 1; if (px(x, y) === 0) black += 1; }
      return black / total;
    };
    expect(blackFrac(0, 16)).toBeGreaterThan(0.9);
    expect(blackFrac(144, 160)).toBeGreaterThan(0.9);
    // and the middle is emphatically not black
    expect(blackFrac(64, 96)).toBeLessThan(0.7);
  });

  it('is big-endian, proved by a colour only one order can produce', () => {
    // The logo's signature pink is 0xF9AE = rgb(248,52,112). Read little-endian
    // the same bytes give 0xAEF9 = rgb(168,220,200), a pale green that appears
    // nowhere in the artwork. Black is byte-palindromic and proves nothing here,
    // which is why this checks a saturated colour instead.
    const counts = new Map<number, number>();
    for (let x = 0; x < 160; x += 1) for (let y = 0; y < 128; y += 1) {
      const p = px(x, y);
      if (p !== 0) counts.set(p, (counts.get(p) ?? 0) + 1);
    }
    const [dominant] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    const r = ((dominant >> 11) & 0x1f) << 3;
    const g = ((dominant >> 5) & 0x3f) << 2;
    const b = (dominant & 0x1f) << 3;
    expect(r).toBeGreaterThan(200); // strong red channel
    expect(g).toBeLessThan(120);    // weak green — pink, not the LE pale green
    expect(b).toBeGreaterThan(60);
  });

  it('decodes and re-encodes the radio bytes with no loss at all', () => {
    // Packing isolated from resampling: decode the radio's own buffer and pack
    // it straight back. Byte-identical means the RGB565 pack/unpack pair and the
    // column-major index are exactly right — any stride, order or bit-replication
    // error would show up here immediately.
    const rgba = decodeD890Image(BOOT);
    const again = encodeD890Image(rgba, D890_IMAGE.WIDTH, D890_IMAGE.HEIGHT);
    expect(Array.from(again)).toEqual(Array.from(BOOT));
  });

  it('is a full-size image that is not uniform', () => {
    // Guards against a regression where a blank or short read would still pass
    // the structural tests above.
    expect(BOOT.length).toBe(D890_IMAGE.BYTES);
    expect(new Set(BOOT).size).toBeGreaterThan(20);
  });
});

describe('DA-7X2 image fit modes', () => {
  /** A 200x100 source: left half red, right half blue. Aspect 2.0 vs the frame's 1.25. */
  const wide = (() => {
    const w = 200, h = 100;
    const buf = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 4;
      if (x < w / 2) { buf[i] = 255; } else { buf[i + 2] = 255; }
      buf[i + 3] = 255;
    }
    return { buf, w, h };
  })();

  const px = (b: Uint8Array, x: number, y: number) =>
    (b[(x * 128 + y) * 2] << 8) | b[(x * 128 + y) * 2 + 1];

  it('defaults to cover: fills the frame, crops the overflow, no distortion', () => {
    const out = encodeD890Image(wide.buf, wide.w, wide.h);
    // A 2.0-aspect source cropped to 1.25 keeps the middle 62.5% of its width,
    // centred — so both halves survive and the seam stays in the middle.
    expect(px(out, 5, 64)).toBe(rgbToRgb565(255, 0, 0));
    expect(px(out, 154, 64)).toBe(rgbToRgb565(0, 0, 255));
    // no padding anywhere: every pixel came from the source
    let padded = 0;
    for (let x = 0; x < 160; x += 1) for (let y = 0; y < 128; y += 1) if (px(out, x, y) === 0) padded += 1;
    expect(padded).toBe(0);
  });

  it('contain: keeps the whole image and pads, rather than cropping it', () => {
    const out = encodeD890Image(wide.buf, wide.w, wide.h, { fit: 'contain' });
    // 2.0 aspect into a 1.25 frame letterboxes top and bottom.
    expect(px(out, 80, 2)).toBe(0);
    expect(px(out, 80, 125)).toBe(0);
    expect(px(out, 5, 64)).toBe(rgbToRgb565(255, 0, 0));
    expect(px(out, 154, 64)).toBe(rgbToRgb565(0, 0, 255));
  });

  it('contain honours a background colour instead of always black', () => {
    const out = encodeD890Image(wide.buf, wide.w, wide.h, {
      fit: 'contain',
      background: { r: 0, g: 255, b: 0 },
    });
    expect(px(out, 80, 2)).toBe(rgbToRgb565(0, 255, 0));
  });

  it('stretch reproduces the vendor CPS, distortion included', () => {
    // Kept only so a codeplug can be made byte-compatible with the OEM output.
    // It is not the default precisely because it squashes the picture — which is
    // exactly what happened to the logo written to the radio on 2026-08-30.
    const out = encodeD890Image(wide.buf, wide.w, wide.h, { fit: 'stretch' });
    expect(px(out, 5, 64)).toBe(rgbToRgb565(255, 0, 0));
    expect(px(out, 154, 64)).toBe(rgbToRgb565(0, 0, 255));
    // the seam sits at the midpoint because the full width was squashed in
    expect(px(out, 79, 64)).toBe(rgbToRgb565(255, 0, 0));
    expect(px(out, 80, 64)).toBe(rgbToRgb565(0, 0, 255));
  });

  it('focusX moves what a cover crop keeps', () => {
    // The crop is 125 source-px wide against a 100px red half, so no focus value
    // isolates one colour — the honest signal is the PROPORTION that survives.
    // Left-biased keeps 100/125 = 80% red; centred 50%; right-biased 25/125 = 20%.
    const redFraction = (focusX: number) => {
      const out = encodeD890Image(wide.buf, wide.w, wide.h, { fit: 'cover', focusX });
      let red = 0;
      for (let x = 0; x < 160; x += 1) if (px(out, x, 64) === rgbToRgb565(255, 0, 0)) red += 1;
      return red / 160;
    };
    expect(redFraction(0)).toBeCloseTo(0.8, 1);
    expect(redFraction(0.5)).toBeCloseTo(0.5, 1);
    expect(redFraction(1)).toBeCloseTo(0.2, 1);
  });

  it('leaves a source already at 160x128 untouched in every mode', () => {
    // Same aspect means no crop and no pad, so all three modes must agree and
    // the round trip must stay exact — this is what makes the boot-image
    // fixture's identity test meaningful.
    const rgba = decodeD890Image(BOOT);
    for (const fit of ['cover', 'contain', 'stretch'] as const) {
      expect(Array.from(encodeD890Image(rgba, 160, 128, { fit }))).toEqual(Array.from(BOOT));
    }
  });
});

describe('DA-7X2 satellite decode', () => {
  it('treats an all-zero slot as absent, not as a nameless satellite', () => {
    // The vendor serializer actively zero-fills unused slots, so all-zero is
    // what "no satellite" looks like. Decoding it as a record would invent 25
    // blank satellites on every read.
    const table = buildSatelliteTable([
      { name: 'ISS', tleLine1: TLE1, tleLine2: TLE2, rxFreq1: 14550000 },
    ]);
    const back = decodeSatelliteTable(table);
    expect(back).toHaveLength(1);
    expect(back[0].slot).toBe(1);
    expect(back[0].name).toBe('ISS');
    expect(back[0].rxFreq1).toBe(14550000);
  });

  it('round-trips the TLE fragments the radio actually stores', () => {
    const table = buildSatelliteTable([{ name: 'ISS', tleLine1: TLE1, tleLine2: TLE2 }]);
    const [rec] = decodeSatelliteTable(table);
    expect(rec.tleFragment1).toBe('24001.50000000  .00016717');
    expect(rec.tleFragment2).toBe(' 51.6416 247.4627 0006703 130.5360 325.0288 15.49309239 4316');
  });

  it('reports an unset frequency as null rather than 4294967295', () => {
    const table = buildSatelliteTable([{ name: 'X', tleLine1: TLE1, tleLine2: TLE2 }]);
    const [rec] = decodeSatelliteTable(table);
    expect(rec.rxFreq1).toBeNull();
    expect(rec.txFreq1).toBeNull();
    expect(rec.aprsTxFreq).toBeNull();
  });
});

describe('DA-7X2 pre-defined SMS', () => {
  const utf16 = (s: string, fill = 0x00) => {
    const b = new Uint8Array(0x200).fill(fill);
    for (let i = 0; i < s.length; i += 1) {
      b[i * 2] = s.charCodeAt(i) & 0xff;
      b[i * 2 + 1] = (s.charCodeAt(i) >> 8) & 0xff;
    }
    if (fill !== 0x00) { b[s.length * 2] = 0; b[s.length * 2 + 1] = 0; }
    return b;
  };

  it('decodes the factory defaults the radio actually returned', () => {
    // Real bytes: 48 00 65 00 6C 00 6C 00 6F 00 21 00 00 00 -> "Hello!"
    const hello = new Uint8Array(0x200);
    hello.set([0x48, 0x00, 0x65, 0x00, 0x6c, 0x00, 0x6c, 0x00, 0x6f, 0x00, 0x21, 0x00]);
    expect(parsePredefinedSms(hello)).toBe('Hello!');
    expect(parsePredefinedSms(utf16('Happy every day!'))).toBe('Happy every day!');
  });

  it('treats an 0xFF-filled slot as empty, not as 256 replacement characters', () => {
    // THE trap on this radio, and the third region to spring it: unused slots
    // are erased flash, not zeroes. Stopping only at NUL turns an empty slot
    // into a 256-character string of U+FFFF that looks like a corrupt message.
    const erased = new Uint8Array(0x200).fill(0xff);
    expect(parsePredefinedSms(erased)).toBeNull();
    // and a real message in an otherwise 0xFF slot still terminates correctly
    expect(parsePredefinedSms(utf16('Welcome!', 0xff))).toBe('Welcome!');
  });

  it('distinguishes an empty slot from an empty string', () => {
    expect(parsePredefinedSms(new Uint8Array(0x200))).toBeNull();
  });

  it('banks twenty slots at a time, 0x80000 apart', () => {
    expect(predefinedSmsAddress(0)).toBe(0x3180000);
    expect(predefinedSmsAddress(1)).toBe(0x3180200);
    expect(predefinedSmsAddress(19)).toBe(0x3180000 + 19 * 0x200);
    // slot 20 starts the next bank, NOT 0x3180000 + 20*0x200
    expect(predefinedSmsAddress(20)).toBe(0x3200000);
    expect(predefinedSmsAddress(21)).toBe(0x3200200);
  });

  it('round-trips text through the encoder', () => {
    const enc = encodePredefinedSms('Thank you!');
    expect(parsePredefinedSms(enc)).toBe('Thank you!');
    expect(enc.length).toBe(0x200);
  });

  it('clips at the vendor limit rather than overflowing the slot', () => {
    const long = 'x'.repeat(300);
    expect(parsePredefinedSms(encodePredefinedSms(long))!.length).toBe(200);
  });
});

describe('pre-defined SMS length', () => {
  it('clips at 200 characters, not at the slot size', () => {
    // The slot holds 256 characters (0x200 bytes, two per character), but the
    // vendor's own SMSData DDL caps the field at 200. Writing 255 to a radio
    // that expects 200 is the failure with teeth; the cost of the other error
    // is 55 unusable characters. So the encoder takes the smaller number.
    const enc = encodePredefinedSms('x'.repeat(400));
    expect(parsePredefinedSms(enc)!.length).toBe(200);
    // and the text is still NUL-terminated inside the slot
    expect(enc[200 * 2]).toBe(0);
    expect(enc.length).toBe(0x200);
  });

  it('leaves room for a terminator even at the maximum', () => {
    // 200 characters is 400 bytes of a 512-byte slot, so the terminator always
    // fits. This would fail if the limit were ever raised to the structural 256.
    const enc = encodePredefinedSms('y'.repeat(200));
    expect(enc.length - 200 * 2).toBeGreaterThanOrEqual(2);
  });
});
