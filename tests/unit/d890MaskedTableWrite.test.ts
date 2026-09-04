import { describe, it, expect } from 'vitest';
import {
  planMaskedTableWrite,
  planSpanTableWrite,
  D890WriteRefusedError,
} from '../../src/radios/d890uv/writePlan';
import { D890_MASKED_TABLES } from '../../src/radios/d890uv/tableWrite';
import { decodeOccupancyMask, occupiedIndices } from '../../src/radios/d890uv/structures';

/**
 * Mask recomputation, which is the half of a write that decides whether the
 * radio can SEE what was written.
 *
 * A record written without its mask bit is invisible; a mask bit with no record
 * points at whatever was there before. Neither shows up as an error — the radio
 * ACKs the write either way — so both are caught here or not at all.
 */

const spec = {
  label: 'test table',
  dataAddress: 0x03880000,
  maskAddress: 0x03884200,
  stride: 0x40,
  slots: 8,
};

type Entry = { index: number; value: number };
const encode = (original: Uint8Array, e: Entry) => {
  const rec = Uint8Array.from(original);
  rec[0] = e.value;
  return rec;
};
const originalsFor = (indices: number[]) =>
  new Map(indices.map((i) => [i, new Uint8Array(spec.stride).fill(0xa5)]));

describe('mask recomputation', () => {
  it('sets a bit for every slot written and clears the rest', () => {
    const mask = new Uint8Array(16);
    const plan = planMaskedTableWrite(spec, {
      entries: [{ index: 0, value: 1 }, { index: 3, value: 2 }],
      originals: originalsFor([0, 3]),
      originalMask: mask,
      encode,
    });
    expect(occupiedIndices(decodeOccupancyMask(plan.mask, spec.slots))).toEqual([0, 3]);
  });

  it('reports slots it is clearing rather than doing it silently', () => {
    // The radio has 0,1,2; the plan keeps only 0. Losing 1 and 2 is destructive
    // and the caller has to be able to say so before sending.
    const mask = new Uint8Array(16);
    mask[0] = 0b0000_0111;
    const plan = planMaskedTableWrite(spec, {
      entries: [{ index: 0, value: 1 }],
      originals: originalsFor([0]),
      originalMask: mask,
      encode,
    });
    expect(plan.cleared).toEqual([1, 2]);
  });

  it('leaves bits ABOVE the table untouched', () => {
    // A mask read is 16-byte aligned and routinely wider than the table — 128
    // bits for 100 5-Tone slots. Rebuilding would zero bits nobody has looked
    // at. On the channel table the same rule is what keeps VFO A/B registered.
    const mask = new Uint8Array(16).fill(0xff);
    const plan = planMaskedTableWrite(spec, {
      entries: [{ index: 0, value: 1 }],
      originals: originalsFor([0]),
      originalMask: mask,
      encode,
    });
    // Slots 0-7 are byte 0; everything above must survive verbatim.
    expect(plan.mask[0]).toBe(0b0000_0001);
    for (let i = 1; i < 16; i += 1) expect(plan.mask[i], `byte ${i}`).toBe(0xff);
  });

  it('honours an INVERTED mask, where a set bit means empty', () => {
    // The talkgroup mask is inverted. Getting this backwards yields either an
    // empty contact list or 10,000 phantom contacts.
    const inverted = { ...spec, maskInverted: true };
    const mask = new Uint8Array(16).fill(0xff); // all empty
    const plan = planMaskedTableWrite(inverted, {
      entries: [{ index: 2, value: 1 }],
      originals: originalsFor([2]),
      originalMask: mask,
      encode,
    });
    // Slot 2 is now occupied, so its bit must be CLEAR.
    expect(plan.mask[0] & 0b0000_0100).toBe(0);
    // And every other slot in that byte stays set, i.e. still empty.
    expect(plan.mask[0]).toBe(0xff & ~0b0000_0100);
    expect(occupiedIndices(decodeOccupancyMask(plan.mask, inverted.slots, true))).toEqual([2]);
  });

  it('does not treat an inverted slot as newly cleared when it was already empty', () => {
    const inverted = { ...spec, maskInverted: true };
    const plan = planMaskedTableWrite(inverted, {
      entries: [{ index: 0, value: 1 }],
      originals: originalsFor([0]),
      originalMask: new Uint8Array(16).fill(0xff),
      encode,
    });
    expect(plan.cleared).toEqual([]);
  });
});

describe('mask write refusals', () => {
  it('refuses when the mask was never read', () => {
    expect(() =>
      planMaskedTableWrite(spec, {
        entries: [{ index: 0, value: 1 }],
        originals: originalsFor([0]),
        originalMask: new Uint8Array(0),
        encode,
      })
    ).toThrow(D890WriteRefusedError);
  });

  it('refuses a record that was never read from the radio', () => {
    expect(() =>
      planMaskedTableWrite(spec, {
        entries: [{ index: 0, value: 1 }],
        originals: new Map(),
        originalMask: new Uint8Array(16),
        encode,
      })
    ).toThrow(/never read from the radio/);
  });

  it('refuses an encoder that returns the wrong record length', () => {
    expect(() =>
      planMaskedTableWrite(spec, {
        entries: [{ index: 0, value: 1 }],
        originals: originalsFor([0]),
        originalMask: new Uint8Array(16),
        encode: () => new Uint8Array(7),
      })
    ).toThrow(/expected 64/);
  });

  it('skips an entry outside the table rather than writing past it', () => {
    const plan = planMaskedTableWrite(spec, {
      entries: [{ index: 99, value: 1 }],
      originals: originalsFor([99]),
      originalMask: new Uint8Array(16),
      encode,
    });
    expect(plan.written).toEqual([]);
    expect(plan.skipped[0].reason).toMatch(/outside the 8 slots/);
  });
});

describe('frames', () => {
  it('splits records into 16-byte frames at the right addresses', () => {
    const plan = planMaskedTableWrite(spec, {
      entries: [{ index: 1, value: 9 }],
      originals: originalsFor([1]),
      originalMask: new Uint8Array(16),
      encode,
    });
    const recordFrames = plan.frames.filter((f) => f.what.startsWith('test table 2'));
    expect(recordFrames).toHaveLength(4); // 0x40 / 0x10
    expect(recordFrames.map((f) => f.address)).toEqual([
      0x03880040, 0x03880050, 0x03880060, 0x03880070,
    ]);
    for (const f of recordFrames) expect(f.data).toHaveLength(16);
  });

  it('writes the mask after the records it describes', () => {
    const plan = planMaskedTableWrite(spec, {
      entries: [{ index: 0, value: 1 }],
      originals: originalsFor([0]),
      originalMask: new Uint8Array(16),
      encode,
    });
    const maskIndex = plan.frames.findIndex((f) => f.what.endsWith('presence mask'));
    expect(maskIndex).toBe(plan.frames.length - 1);
    expect(plan.frames[maskIndex].address).toBe(spec.maskAddress);
  });
});

describe('the real table geometry', () => {
  it('takes every address from the read path, not a second copy', () => {
    // A write that disagrees with the read about where a table lives is the
    // worst bug available here: a read-back would look consistent while the
    // radio held something else entirely.
    expect(D890_MASKED_TABLES.amChannels.maskAddress).toBe(0x3884200);
    expect(D890_MASKED_TABLES.amZones.maskAddress).toBe(0x3884400);
    expect(D890_MASKED_TABLES.fiveTone.maskAddress).toBe(0x3481900);
    expect(D890_MASKED_TABLES.twoTone.maskAddress).toBe(0x3482800);
  });

  it('gives every masked table a mask that is not its own data', () => {
    // A spec pointing its mask at its data would corrupt the first record on
    // every write, and the read would agree with it.
    for (const [name, t] of Object.entries(D890_MASKED_TABLES)) {
      expect(t.maskAddress, `${name} mask overlaps its data`).not.toBe(t.dataAddress);
      expect(t.slots, `${name} has no slots`).toBeGreaterThan(0);
      // A table whose stride is not 16-aligned cannot be written record by
      // record — its records do not start on frame boundaries. Those go
      // through planSpanTableWrite instead, and the per-record planner refuses
      // them rather than emitting unaligned addresses.
      if (t.stride % 0x10 !== 0) {
        expect(name, 'only talkgroups is known to have an unaligned stride').toBe('talkgroups');
      }
    }
  });

  it('shares one mask between zone members and zone names', () => {
    // A zone is TWO records in two regions with ONE present mask. Planning them
    // apart would let a rename land without its members, or the reverse.
    expect(D890_MASKED_TABLES.zoneNames.maskAddress)
      .toBe(D890_MASKED_TABLES.zones.maskAddress);
    expect(D890_MASKED_TABLES.zoneNames.dataAddress)
      .not.toBe(D890_MASKED_TABLES.zones.dataAddress);
  });

  it('marks only the talkgroup mask as inverted', () => {
    const inverted = Object.entries(D890_MASKED_TABLES)
      .filter(([, t]) => 'maskInverted' in t && t.maskInverted)
      .map(([k]) => k);
    expect(inverted).toEqual(['talkgroups']);
  });
});

describe('span writes, for tables whose records straddle frames', () => {
  // The talkgroup stride is 0xc8, so record 1 begins 8 bytes into a frame.
  const spanSpec = {
    label: 'talkgroup',
    dataAddress: 0x03a00000,
    maskAddress: 0x03980000,
    stride: 0xc8,
    slots: 8,
    maskInverted: true,
  };
  const originalsFor = (n: number) =>
    new Map(Array.from({ length: n }, (_, i) => [i, new Uint8Array(spanSpec.stride).fill(i + 1)]));

  it('is refused by the per-record planner', () => {
    expect(() =>
      planMaskedTableWrite(spanSpec, {
        entries: [{ index: 0, value: 1 }],
        originals: originalsFor(1) as never,
        originalMask: new Uint8Array(16),
        encode: (o) => o,
      })
    ).toThrow(/not 16-byte aligned/);
  });

  it('emits only 16-byte-aligned, contiguous frames', () => {
    const plan = planSpanTableWrite(spanSpec, {
      entries: [{ index: 0 }, { index: 5 }],
      originals: originalsFor(8),
      originalMask: new Uint8Array(16).fill(0xff),
      encode: (o) => o,
    });
    const data = plan.frames.filter((f) => !f.what.endsWith('presence mask'));
    for (const f of data) {
      expect(f.address % 0x10, `0x${f.address.toString(16)} is unaligned`).toBe(0);
      expect(f.data).toHaveLength(16);
    }
    for (let i = 1; i < data.length; i += 1) {
      expect(data[i].address - data[i - 1].address).toBe(16);
    }
    // 6 records x 200 bytes = 1200 = 75 frames, exactly what the vendor sent.
    expect(data).toHaveLength(75);
  });

  it('refuses when a record the span crosses was never read', () => {
    // A frame straddling two records carries both, so writing record 5 without
    // having read record 4 would invent its bytes.
    const partial = new Map([[0, new Uint8Array(spanSpec.stride)], [5, new Uint8Array(spanSpec.stride)]]);
    expect(() =>
      planSpanTableWrite(spanSpec, {
        entries: [{ index: 0 }, { index: 5 }],
        originals: partial,
        originalMask: new Uint8Array(16).fill(0xff),
        encode: (o) => o,
      })
    ).toThrow(/were never read/);
  });

  it('carries a neighbour through unchanged when a frame straddles both', () => {
    // Record 1 starts at byte 200, which is 8 bytes into the frame beginning at
    // 192 — so that frame carries the last 8 bytes of record 0 as well. Those
    // bytes must survive a write that only edits record 1.
    const plan = planSpanTableWrite(spanSpec, {
      entries: [{ index: 1 }],
      originals: originalsFor(8),
      originalMask: new Uint8Array(16).fill(0xff),
      encode: (o) => Uint8Array.from(o).fill(0xee),
    });
    const data = plan.frames.filter((f) => !f.what.endsWith('presence mask'));
    const spanStart = Math.floor((1 * spanSpec.stride) / 16) * 16;
    expect(data[0].address).toBe(spanSpec.dataAddress + spanStart);

    const span = new Uint8Array(data.length * 16);
    data.forEach((f, i) => span.set(f.data, i * 16));

    // The first 8 bytes of the span are record 0's tail — still filled with 1.
    for (let i = 0; i < 8; i += 1) {
      expect(span[i], `byte ${i} of the straddling frame belongs to record 0`).toBe(1);
    }
    // Record 1 itself is now 0xee.
    expect(span[1 * spanSpec.stride - spanStart]).toBe(0xee);
  });
});
