/**
 * The BASIC encryption key spans frames, and the plan used to assume it didn't.
 *
 * Its ID record IS sub-frame sized — 2 bytes at `0x3585000 + slot*2`. Its KEY
 * record is not: the stride is 0x28 and only +0x10/+0x11 carry the key, but the
 * encoder patches and returns all 40 bytes. The emission copied that into a
 * single 16-byte frame, which throws `offset is out of bounds` — and because
 * that happens while BUILDING the plan, it took the whole codeplug write with
 * it. Nothing could be written to a radio holding a BASIC key.
 *
 * Every odd slot also starts 8 bytes into a frame (0x28 mod 0x10 = 8), so slot 1
 * is the case that actually crashed on hardware, 2026-09-10.
 */

import { describe, it, expect } from 'vitest';
import { planCodeplugWrite } from '../../src/radios/d890uv/codeplugWrite';
import { D890_ADDR, D890_ENCRYPTION_TYPE } from '../../src/radios/d890uv/constants';
import type { EncryptionKey } from '../../src/models/EncryptionKey';

/** A read log covering the whole ID and key tables with recognisable bytes. */
function readLog(): Map<number, Uint8Array> {
  const log = new Map<number, Uint8Array>();
  log.set(D890_ADDR.ZONE_SET, new Uint8Array(D890_ADDR.ZONE_SET_SIZE));
  const idBytes = new Uint8Array(D890_ADDR.ENCRYPTION_ID_STRIDE * D890_ADDR.ENCRYPTION_SLOTS);
  const keyBytes = new Uint8Array(D890_ADDR.ENCRYPTION_KEY_STRIDE * D890_ADDR.ENCRYPTION_SLOTS);
  // 0xAA marks bytes the write must NOT disturb.
  keyBytes.fill(0xaa);
  log.set(D890_ADDR.ENCRYPTION_ID_TABLE, idBytes);
  log.set(D890_ADDR.ENCRYPTION_KEY_TABLE, keyBytes);
  return log;
}

const basicKey = (slot: number, keyHex: string, id: number): EncryptionKey =>
  ({ id: slot, key: keyHex, encryptionId: id, encryptionType: D890_ENCRYPTION_TYPE.BASIC } as EncryptionKey);

const plan = (keys: EncryptionKey[]) =>
  planCodeplugWrite({
    channels: [], zones: [], zoneSlots: [], readLog: readLog(),
    writeUnmodelledVerbatim: false,
    channelInput: {
      originals: new Map(), originalMask: new Uint8Array(512),
      counts: { DMRTalkGroups: 0, ScanList: 0, DMRReceiveGroupCallList: 0, RadioIDList: 0, AESEncryptionCode: keys.length },
      referencingTables: [],
    },
    tables: { encryptionKeys: keys },
  });

/** The planned byte at an absolute address, or null if no frame covers it. */
function byteAt(p: ReturnType<typeof planCodeplugWrite>, address: number): number | null {
  const frameAt = address - (address % 0x10);
  const frame = p.frames.find((f) => f.address === frameAt);
  return frame ? frame.data[address - frameAt]! : null;
}

describe('BASIC encryption key write', () => {
  it('does not throw on slot 1, whose record starts mid-frame', () => {
    // 0x28 mod 0x10 = 8, so slot 1's record begins 8 bytes into a frame. This
    // threw RangeError and aborted the entire plan.
    expect(() => plan([basicKey(1, '1234', 0x0202)])).not.toThrow();
  });

  it('writes the key big-endian at +0x10 of the slot', () => {
    const p = plan([basicKey(1, '1234', 0x0202)]);
    const at = D890_ADDR.ENCRYPTION_KEY_TABLE + 1 * D890_ADDR.ENCRYPTION_KEY_STRIDE
      + D890_ADDR.ENCRYPTION_KEY_OFFSET;
    expect(byteAt(p, at)).toBe(0x12);
    expect(byteAt(p, at + 1)).toBe(0x34);
  });

  it('writes the encryption ID big-endian at its own table', () => {
    const p = plan([basicKey(1, '1234', 0x0202)]);
    const at = D890_ADDR.ENCRYPTION_ID_TABLE + 1 * D890_ADDR.ENCRYPTION_ID_STRIDE;
    expect(byteAt(p, at)).toBe(0x02);
    expect(byteAt(p, at + 1)).toBe(0x02);
  });

  it('leaves every other byte of the key record exactly as it was read', () => {
    // The record is 40 bytes of which 2 are ours. Rebuilding it, or zero-filling
    // the frames it straddles, would wipe the rest — and the frames it straddles
    // include bytes belonging to the NEIGHBOURING slots.
    const p = plan([basicKey(1, '1234', 0x0202)]);
    const slotAt = D890_ADDR.ENCRYPTION_KEY_TABLE + 1 * D890_ADDR.ENCRYPTION_KEY_STRIDE;
    const keyAt = slotAt + D890_ADDR.ENCRYPTION_KEY_OFFSET;
    for (let i = 0; i < D890_ADDR.ENCRYPTION_KEY_STRIDE; i += 1) {
      const at = slotAt + i;
      if (at === keyAt || at === keyAt + 1) continue;
      const got = byteAt(p, at);
      if (got !== null) expect(got).toBe(0xaa);
    }
  });

  it('coalesces IDs that share a frame instead of dropping all but one', () => {
    // The ID stride is 2, so EIGHT ids live in one 16-byte frame. A frame per
    // record made each a fresh copy of the pre-edit bytes, so the last one to
    // land silently reverted the others — and a read-back cannot show you that,
    // because the radio keeps whichever frame it was actually sent.
    const p = plan([basicKey(1, '1111', 0x1111), basicKey(2, '2222', 0x2222)]);
    const frameAt = D890_ADDR.ENCRYPTION_ID_TABLE;
    expect(p.frames.filter((f) => f.address === frameAt)).toHaveLength(1);
    expect(byteAt(p, D890_ADDR.ENCRYPTION_ID_TABLE + 2)).toBe(0x11);
    expect(byteAt(p, D890_ADDR.ENCRYPTION_ID_TABLE + 3)).toBe(0x11);
    expect(byteAt(p, D890_ADDR.ENCRYPTION_ID_TABLE + 4)).toBe(0x22);
    expect(byteAt(p, D890_ADDR.ENCRYPTION_ID_TABLE + 5)).toBe(0x22);
  });

  it('coalesces KEY records that straddle a shared frame', () => {
    // Slot 0 covers 0x...100-0x...127 and slot 1 covers 0x...128-0x...14f, so
    // they share the frame at 0x...120. Both keys must survive.
    const p = plan([basicKey(0, 'aaaa', 0x0101), basicKey(1, 'bbbb', 0x0202)]);
    const k = (slot: number) =>
      D890_ADDR.ENCRYPTION_KEY_TABLE + slot * D890_ADDR.ENCRYPTION_KEY_STRIDE
        + D890_ADDR.ENCRYPTION_KEY_OFFSET;
    expect(byteAt(p, k(0))).toBe(0xaa);
    expect(byteAt(p, k(1))).toBe(0xbb);
    const shared = D890_ADDR.ENCRYPTION_KEY_TABLE + 0x20;
    expect(p.frames.filter((f) => f.address === shared)).toHaveLength(1);
  });

  it('never plans the same frame twice', () => {
    // The plan has its own duplicate guard; this asserts the emission does not
    // depend on it to stay correct.
    const p = plan([0, 1, 2, 3, 4].map((n) => basicKey(n, '1234', 0x0101 * (n + 1))));
    const seen = p.frames.map((f) => f.address);
    expect(new Set(seen).size).toBe(seen.length);
  });

  it('handles slot 0, which is frame-aligned', () => {
    const p = plan([basicKey(0, 'abcd', 0x0101)]);
    const at = D890_ADDR.ENCRYPTION_KEY_TABLE + D890_ADDR.ENCRYPTION_KEY_OFFSET;
    expect(byteAt(p, at)).toBe(0xab);
    expect(byteAt(p, at + 1)).toBe(0xcd);
  });
});
