import { describe, it, expect } from 'vitest';
import { framesForChanges } from '../../src/radios/d890uv/codeplugWrite';
import { predefinedSmsAddress } from '../../src/radios/d890uv/predefinedSms';
import { D890_ADDR } from '../../src/radios/d890uv/constants';
import {
  alignZoneCurrentChannels,
  zoneCurrentChannelsBySlot,
} from '../../src/radios/d890uv/structures';

/**
 * Sub-frame records and banked tables — the two ways a write lands somewhere
 * other than where the read took it from.
 *
 * Both bugs below shipped and neither had a test: the BASIC encryption branch
 * was uncovered entirely (the suite only exercised AES and ARC4), and the SMS
 * write kept its own copy of address arithmetic that the read never used.
 */

const logOf = (base: number, len: number, fill = 0xaa) => {
  const bytes = new Uint8Array(len).fill(fill);
  bytes.forEach((_, i) => { bytes[i] = (base + i) & 0xff; });
  return new Map([[base, bytes]]);
};

describe('framesForChanges', () => {
  it('frames a 2-byte change inside a record that starts mid-frame', () => {
    // The BASIC encryption key: 2 meaningful bytes at offset 0x10 of a 40-byte
    // record on a 40-byte stride. Slot 1 starts at 0x...128 — mid-frame — and
    // the old code did `set(<40 bytes>, keyAt % 0x10)` into a 16-byte buffer.
    const recordAt = 0x3585128;
    const readLog = logOf(0x3585120, 0x40);
    const original = readLog.get(0x3585120)!.subarray(8, 8 + 0x28);
    const updated = Uint8Array.from(original);
    updated[0x10] = 0x12;
    updated[0x11] = 0x34;

    const frames = framesForChanges(readLog, recordAt, original, updated, 'key');
    expect(frames).toBeDefined();
    // 0x3585128 + 0x10 = 0x3585138, which lives in the frame at 0x3585130.
    expect(frames!.map((f) => f.address)).toEqual([0x3585130]);
    expect(frames![0]!.data).toHaveLength(0x10);
    expect([frames![0]!.data[8], frames![0]!.data[9]]).toEqual([0x12, 0x34]);
  });

  it('does not throw where the old hand-rolled arithmetic did', () => {
    const readLog = logOf(0x3585120, 0x40);
    const original = readLog.get(0x3585120)!.subarray(8, 8 + 0x28);
    const updated = Uint8Array.from(original);
    updated[0x10] = 0x99;
    expect(() => framesForChanges(readLog, 0x3585128, original, updated, 'k')).not.toThrow();
    // The shape that used to blow up, kept as the reason this test exists.
    expect(() => new Uint8Array(16).set(new Uint8Array(0x28), 0)).toThrow(RangeError);
  });

  it('carries untouched neighbours from the read log, never zeros', () => {
    const readLog = logOf(0x1000, 0x20);
    const original = readLog.get(0x1000)!.subarray(0, 0x20);
    const updated = Uint8Array.from(original);
    updated[4] = 0xff;
    const frames = framesForChanges(readLog, 0x1000, original, updated, 'x')!;
    expect(frames).toHaveLength(1);
    expect(Array.from(frames[0]!.data.subarray(0, 4)))
      .toEqual(Array.from(original.subarray(0, 4)));
  });

  it('writes nothing when the encoder changed nothing', () => {
    const readLog = logOf(0x1000, 0x20);
    const original = readLog.get(0x1000)!.subarray(0, 0x20);
    expect(framesForChanges(readLog, 0x1000, original, Uint8Array.from(original), 'x'))
      .toEqual([]);
  });

  it('refuses rather than substituting zeros when a frame was never read', () => {
    const original = new Uint8Array(0x20);
    const updated = Uint8Array.from(original);
    updated[0] = 1;
    expect(framesForChanges(new Map(), 0x1000, original, updated, 'x')).toBeUndefined();
  });
});

describe('pre-defined SMS is banked, not flat', () => {
  it('puts slot 20 in the next bank, not 0x200 past slot 19', () => {
    const flat = D890_ADDR.PREDEFINED_SMS_DATA + 20 * D890_ADDR.PREDEFINED_SMS_STRIDE;
    expect(predefinedSmsAddress(20)).not.toBe(flat);
    expect(predefinedSmsAddress(20)).toBe(
      D890_ADDR.PREDEFINED_SMS_DATA + D890_ADDR.PREDEFINED_SMS_BANK_STRIDE
    );
  });

  it('agrees with flat arithmetic only within the first bank', () => {
    for (let i = 0; i < D890_ADDR.PREDEFINED_SMS_PER_BANK; i += 1) {
      expect(predefinedSmsAddress(i)).toBe(
        D890_ADDR.PREDEFINED_SMS_DATA + i * D890_ADDR.PREDEFINED_SMS_STRIDE
      );
    }
  });
});

describe('zone current channel: position vs slot', () => {
  it('is the exact inverse of the read-side alignment', () => {
    // The bug this closes: the read maps slot→position, the UI edits by
    // position, and the encoder writes by slot — with no step in between. With
    // zones at slots [0, 2, 5], zone 2's current channel landed in slot 1.
    const slots = [0, 2, 5];
    const raw = { a: [10, 11, 12, 13, 14, 15], b: [20, 21, 22, 23, 24, 25] };
    const aligned = alignZoneCurrentChannels(raw, slots);
    expect(aligned.a).toEqual([10, 12, 15]);

    const bySlot = zoneCurrentChannelsBySlot(aligned, slots);
    expect([...bySlot.a.entries()]).toEqual([[0, 10], [2, 12], [5, 15]]);
    expect([...bySlot.b.entries()]).toEqual([[0, 20], [2, 22], [5, 25]]);
  });

  it('never claims a slot that holds no zone', () => {
    const bySlot = zoneCurrentChannelsBySlot({ a: [7], b: [8] }, [4]);
    expect([...bySlot.a.keys()]).toEqual([4]);
    expect(bySlot.a.has(0)).toBe(false);
  });
});
