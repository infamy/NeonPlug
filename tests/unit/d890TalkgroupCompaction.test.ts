/**
 * Talk group add and delete, laid out the way the vendor CPS lays them out.
 *
 * Talk groups COMPACT: the table is always slots 0..N-1. What a delete must do
 * to the TAIL is what these fixtures settle, both lifted from vendor captures
 * with tools/parse-serial-capture.mjs --writes:
 *
 *   tg-bank1-restored.bin    the CPS writing 1,010 talk groups — bank 1,
 *                            slots 1000-1009, 2,000 bytes at 0x3A80000
 *   tg-bank1-onecleared.bin  the CPS after clearing one row below bank 1 —
 *                            1,808 bytes: nine records shifted down one slot,
 *                            then `00` x 8 over the freed slot's head, and
 *                            NOTHING written after that
 *
 * The write that crashed the radio on 2026-09-10 left a freed record fully
 * populated while the mask and locator called it absent. These tests are the
 * guard against doing that again.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { planSpanTableWrite } from '../../src/radios/d890uv/writePlan';
import { D890_MASKED_TABLES, applyTalkgroupToRecord } from '../../src/radios/d890uv/tableWrite';
import type { QuickContact } from '../../src/models/QuickContact';

const DIR = join(__dirname, '../fixtures/d890uv');
const fixture = (name: string) => new Uint8Array(readFileSync(join(DIR, name)));
const RESTORED = fixture('tg-bank1-restored.bin');
const CLEARED = fixture('tg-bank1-onecleared.bin');

const TG = D890_MASKED_TABLES.talkgroups;
const STRIDE = TG.stride;
const BANK1 = TG.dataAddress + TG.bank!.stride;
/** Record `local` of bank 1, as the vendor wrote it before the delete. */
const restored = (local: number) => RESTORED.subarray(local * STRIDE, (local + 1) * STRIDE);

/** An inverted mask with slots 0..n-1 present, the way the radio stores it. */
function maskWith(n: number): Uint8Array {
  const m = new Uint8Array(Math.ceil(Math.ceil(TG.slots / 8) / 16) * 16).fill(0xff);
  for (let slot = 0; slot < n; slot += 1) m[slot >> 3] &= ~(1 << (slot & 7));
  return m;
}

const concat = (frames: { data: Uint8Array }[]) => {
  const out = new Uint8Array(frames.length * 16);
  frames.forEach((f, i) => out.set(f.data, i * 16));
  return out;
};

describe('a delete, against the vendor CPS', () => {
  // 1,010 talk groups at read, one cleared below bank 1: every record in bank 1
  // moved down a slot, bringing its own bytes with it, and slot 1009 fell off.
  const entries = Array.from({ length: 1009 }, (_, index) => ({ index }));
  const originals = new Map<number, Uint8Array>();
  for (let slot = 0; slot < 1000; slot += 1) originals.set(slot, new Uint8Array(STRIDE));
  for (let slot = 1000; slot < 1009; slot += 1) originals.set(slot, restored(slot - 1000 + 1));
  const plan = planSpanTableWrite(TG, {
    entries, originals, originalMask: maskWith(1010), encode: (o) => o,
  });
  const bank1 = plan.frames.filter((f) => f.address >= BANK1 && f.address < BANK1 + 0x80000);

  it('writes bank 1 byte for byte as the CPS did, zero tail included', () => {
    const run = bank1.filter((f) => f.address < BANK1 + CLEARED.length);
    expect(Array.from(concat(run))).toEqual(Array.from(CLEARED));
  });

  it('then ERASES the rest of the record that fell off the end', () => {
    // The CPS stopped at 0x3A80710 and the radio's erase-on-write left the rest
    // 0xFF. We cannot stop — the preserve pass would restore the old record — so
    // we write that 0xFF ourselves: slot 1009's twelve remaining frames.
    const erased = bank1.filter((f) => f.address >= BANK1 + CLEARED.length);
    expect(erased.map((f) => f.address - BANK1)).toEqual(
      Array.from({ length: 12 }, (_, i) => 0x710 + i * 0x10)
    );
    expect(erased.every((f) => f.data.every((b) => b === 0xff))).toBe(true);
  });

  it('clears exactly the freed slot in the mask — the vendor’s own mask frame', () => {
    expect(plan.cleared).toEqual([1009]);
    const frame = plan.frames.find((f) => f.address === TG.maskAddress + 0x70)!;
    expect(Array.from(frame.data)).toEqual([...Array(14).fill(0), 0xfe, 0xff]);
  });
});

describe('an add', () => {
  it('builds a new record on the blank, byte-identical to one the CPS built', () => {
    const tg = { name: 'TG1010', contactNumber: 201010, callType: 0x04 } as QuickContact;
    expect(Array.from(applyTalkgroupToRecord(TG.blank!(), tg))).toEqual(Array.from(restored(9)));
  });

  it('appends without the slots past the list ever having been read', () => {
    // 1,008 at read; the new one is slot 1008, which the reader never fetched
    // because the mask said it was empty. It used to refuse here, claiming the
    // record and its neighbour were "never read" — so ADD could not happen at all.
    const originals = new Map<number, Uint8Array>();
    for (let slot = 0; slot < 1008; slot += 1) originals.set(slot, new Uint8Array(STRIDE).fill(1));
    const plan = planSpanTableWrite(TG, {
      entries: Array.from({ length: 1009 }, (_, index) => ({ index })),
      originals,
      originalMask: maskWith(1008),
      encode: (o) => o,
    });
    const bank1 = concat(plan.frames.filter((f) => f.address >= BANK1 && f.address < BANK1 + 0x80000));
    expect(bank1.length).toBe(0x710); // nine records, rounded up to the frame
    expect([...new Set(bank1.subarray(8 * STRIDE, 9 * STRIDE))]).toEqual([0]); // the new one: blank
    expect([...new Set(bank1.subarray(9 * STRIDE))]).toEqual([0]); // the tail past it
    expect(plan.cleared).toEqual([]);
    expect(plan.frames.some((f) => f.what.endsWith('erased'))).toBe(false);
  });
});

describe('an unedited table', () => {
  it('erases nothing and writes every record back as it was', () => {
    const originals = new Map<number, Uint8Array>();
    for (let slot = 1000; slot < 1010; slot += 1) originals.set(slot, restored(slot - 1000));
    for (let slot = 0; slot < 1000; slot += 1) originals.set(slot, new Uint8Array(STRIDE));
    const plan = planSpanTableWrite(TG, {
      entries: Array.from({ length: 1010 }, (_, index) => ({ index })),
      originals,
      originalMask: maskWith(1010),
      encode: (o) => o,
    });
    const bank1 = concat(plan.frames.filter((f) => f.address >= BANK1 && f.address < BANK1 + 0x80000));
    expect(Array.from(bank1)).toEqual(Array.from(RESTORED));
    expect(plan.cleared).toEqual([]);
  });
});
