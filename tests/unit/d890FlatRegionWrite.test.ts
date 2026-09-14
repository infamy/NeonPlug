import { describe, it, expect } from 'vitest';
import {
  planFlatRegionWrite,
  D890_FLAT_REGIONS,
  ZONE_CURRENT_CHANNEL_BYTES,
} from '../../src/radios/d890uv/flatRegionWrite';
import { D890WriteRefusedError } from '../../src/radios/d890uv/writePlan';

/**
 * The flat regions — one fixed span each, no mask, no record index.
 *
 * Two things are worth testing here and nothing else really is. The frames must
 * land on the right addresses with the right 16 bytes, because a write that is
 * off by one frame writes the neighbouring region and the radio ACKs it. And
 * Every frame in a span is sent; `changedFrames` is reporting only —
 * an edit silently, too many puts frames on the wire that buy nothing on a link
 * with no retry.
 */

const spec = { label: 'test region', address: 0x03500000 };
const span = (fill: number, bytes = 0x40) => new Uint8Array(bytes).fill(fill);

describe('frames', () => {
  it('covers the span with 16-byte frames at consecutive addresses', () => {
    const plan = planFlatRegionWrite(spec, { original: span(0x11), encoded: span(0x22) });
    expect(plan.totalFrames).toBe(4);
    expect(plan.frames.map((f) => f.address)).toEqual([
      0x03500000, 0x03500010, 0x03500020, 0x03500030,
    ]);
    for (const f of plan.frames) {
      expect(f.data).toHaveLength(16);
      // The ENCODED bytes reach the radio. Sending the original back would be a
      // write that appears to work and changes nothing.
      expect(Array.from(f.data)).toEqual(new Array(16).fill(0x22));
      expect(f.what).toBe('test region');
    }
  });

  it('carries the encoded bytes frame by frame, in order', () => {
    const original = span(0x00, 0x30);
    const encoded = Uint8Array.from(original.map((_, i) => i));
    const plan = planFlatRegionWrite(spec, { original, encoded });
    const rejoined = new Uint8Array(0x30);
    plan.frames.forEach((f, i) => rejoined.set(f.data, i * 16));
    expect(Array.from(rejoined)).toEqual(Array.from(encoded));
  });

  it('copies the bytes rather than aliasing the caller\'s buffer', () => {
    // A plan is built, inspected and only then sent. If a frame were a view, a
    // caller still patching its buffer would silently change what gets written.
    const encoded = span(0x22);
    const plan = planFlatRegionWrite(spec, { original: span(0x11), encoded });
    encoded.fill(0xee);
    expect(plan.frames[0].data[0]).toBe(0x22);
  });
});

describe('every frame in the span is sent', () => {
  /**
   * There is no "only changed frames" mode, deliberately. One existed briefly;
   * the sparse write it enabled left a radio in a bad state, and the evidence
   * for it — a read-back of the bytes that WERE sent — never checked the
   * regions that were not. The vendor CPS writes every region every time.
   *
   * `changedFrames` survives as REPORTING only, so a plan can say how much of
   * what it sends actually differs.
   */
  it('emits the whole span even when nothing changed', () => {
    const original = span(0x5a);
    const plan = planFlatRegionWrite(spec, { original, encoded: span(0x5a) });
    expect(plan.frames).toHaveLength(plan.totalFrames);
    expect(plan.changedFrames).toBe(0);
  });

  it('still emits the whole span when one mid-span byte differs', () => {
    const original = span(0x5a);
    const encoded = span(0x5a);
    encoded[35] = 0x99;
    const plan = planFlatRegionWrite(spec, { original, encoded });
    expect(plan.frames).toHaveLength(plan.totalFrames);
    // ...and reports that exactly one frame's worth of it is different.
    expect(plan.changedFrames).toBe(1);
  });

  it('counts scattered changes without dropping any frame', () => {
    const original = span(0x5a);
    const encoded = span(0x5a);
    encoded[0] = 1;
    encoded[encoded.length - 1] = 2;
    const plan = planFlatRegionWrite(spec, { original, encoded });
    expect(plan.frames).toHaveLength(plan.totalFrames);
    expect(plan.changedFrames).toBe(2);
  });

  it('offers no way to ask for a partial write', () => {
    const input = { original: span(0x5a), encoded: span(0x5a) } as Record<string, unknown>;
    expect('onlyChangedFrames' in input).toBe(false);
  });
});

describe('refusals', () => {
  it('refuses when the encoded span is a different length from the original', () => {
    expect(() =>
      planFlatRegionWrite(spec, { original: span(0x00, 0x40), encoded: span(0x00, 0x30) })
    ).toThrow(D890WriteRefusedError);
    expect(() =>
      planFlatRegionWrite(spec, { original: span(0x00, 0x40), encoded: span(0x00, 0x30) })
    ).toThrow(/not the same region/);
  });

  it('refuses a span that is not a whole number of frames', () => {
    expect(() =>
      planFlatRegionWrite(spec, { original: span(0x00, 0x18), encoded: span(0x00, 0x18) })
    ).toThrow(/not a whole number of 16-byte frames/);
  });

  it('refuses an unaligned region address', () => {
    expect(() =>
      planFlatRegionWrite(
        { label: 'test region', address: 0x03500008 },
        { original: span(0x00), encoded: span(0x00) }
      )
    ).toThrow(/not 16-byte aligned/);
  });

  it('refuses on geometry before it looks at the bytes', () => {
    // An unaligned region is unwritable whether or not anything in it changed,
    // so the refusal must not depend on the data.
    expect(() =>
      planFlatRegionWrite(
        { label: 'test region', address: 0x03500004 },
        { original: span(0x5a), encoded: span(0x5a) }
      )
    ).toThrow(D890WriteRefusedError);
  });
});

describe('the real region geometry', () => {
  it('is writable frame by frame, every entry', () => {
    for (const [name, region] of Object.entries(D890_FLAT_REGIONS)) {
      expect(region.address % 0x10, `${name} starts unaligned`).toBe(0);
      expect(region.size % 0x10, `${name} is not a whole number of frames`).toBe(0);
      expect(region.size, `${name} has no bytes`).toBeGreaterThan(0);
    }
  });

  it('takes every address from the read path, not a second copy', () => {
    // A write that disagrees with the read about where a region lives would look
    // consistent on a read-back while the radio held something else.
    expect(D890_FLAT_REGIONS.settings.address).toBe(0x3500000);
    expect(D890_FLAT_REGIONS.aprs.address).toBe(0x3501000);
    expect(D890_FLAT_REGIONS.gpsRoaming.address).toBe(0x3502000);
    expect(D890_FLAT_REGIONS.zoneCurrentChannelA.address).toBe(0x3500400);
    expect(D890_FLAT_REGIONS.zoneCurrentChannelB.address).toBe(0x3500600);
    expect(D890_FLAT_REGIONS.zoneHidden.address).toBe(0x3482c20);
    expect(D890_FLAT_REGIONS.powerOnDisplay.address).toBe(0x3500900);
    expect(D890_FLAT_REGIONS.emergencySettings.address).toBe(0x3483000);
    expect(D890_FLAT_REGIONS.emergencyContact.address).toBe(0x3482e00);
  });

  it('rounds the zone A/B arrays UP to a whole frame', () => {
    // 250 zones x u16 = 500 bytes, which is 31.25 frames. The read already asks
    // for 512, so writing 512 keeps the read, the encoder and the write talking
    // about the same span; the 12 bytes past the array ride through untouched.
    expect(ZONE_CURRENT_CHANNEL_BYTES).toBe(512);
    expect(D890_FLAT_REGIONS.zoneCurrentChannelA.size).toBe(ZONE_CURRENT_CHANNEL_BYTES);
    expect(D890_FLAT_REGIONS.zoneCurrentChannelB.size).toBe(ZONE_CURRENT_CHANNEL_BYTES);
  });

  it('keeps the regions from overlapping each other', () => {
    // Four of them sit in the same 0x35000xx neighbourhood: settings, the two
    // zone arrays and the power-on span. A size that overran would have one
    // write silently clobbering the region after it.
    const sorted = Object.entries(D890_FLAT_REGIONS).sort(
      ([, a], [, b]) => a.address - b.address
    );
    for (let i = 1; i < sorted.length; i += 1) {
      const [prevName, prev] = sorted[i - 1];
      const [name, region] = sorted[i];
      expect(prev.address + prev.size, `${prevName} runs into ${name}`).toBeLessThanOrEqual(
        region.address
      );
    }
  });

  it('plans a real region end to end', () => {
    const region = D890_FLAT_REGIONS.powerOnDisplay;
    const original = new Uint8Array(region.size);
    const encoded = Uint8Array.from(original);
    encoded[0x20] = 0x41; // first character of line 2
    const plan = planFlatRegionWrite(region, { original, encoded });
    expect(plan.totalFrames).toBe(6); // 0x60 / 0x10
    // The WHOLE span goes, not just the frame holding the edit.
    expect(plan.frames).toHaveLength(6);
    expect(plan.frames.map((f) => f.address)).toEqual(
      [0, 1, 2, 3, 4, 5].map((i) => region.address + i * 0x10)
    );
    expect(plan.changedFrames).toBe(1);
    expect(plan.frames[0].what).toBe('power-on display');
  });
});
