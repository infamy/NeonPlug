import { describe, it, expect } from 'vitest';
import { parseAesKeySlot, parseArc4KeySlot, parseEncryptionSlot } from '../../src/radios/d890uv/structures';
import {
  applyKeySlotToRecord,
  applyEncryptionIdToRecord,
  applyEncryptionKeyRefToRecord,
  D890KeyTypeChangeError,
} from '../../src/radios/d890uv/tableWrite';
import { D890_ADDR } from '../../src/radios/d890uv/constants';

/**
 * Encryption keys.
 *
 * The rule that matters most here is not a byte layout: **a key slot's TYPE is
 * fixed for its lifetime.** A key may be created as AES or ARC4 and it may be
 * deleted, but an existing slot never converts. The two live in separate
 * regions with different strides and key lengths, so "changing the type" is not
 * an edit at all - it is a delete plus a create, and any channel still pointing
 * at the old slot would reference a key that is not there.
 *
 * That is enforced with its own error type rather than a comment, because it is
 * the one encryption mistake a re-read cannot recover from.
 */

const aesRecord = (keyId: number, fill: number) => {
  const rec = new Uint8Array(D890_ADDR.AES_KEY_STRIDE);
  rec[0] = keyId;
  rec.fill(fill, D890_ADDR.AES_KEY_OFFSET, D890_ADDR.AES_KEY_OFFSET + D890_ADDR.AES_KEY_BYTES);
  return rec;
};

const hex = (b: Uint8Array) =>
  Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

describe('key type is fixed', () => {
  it('refuses to write an ARC4 key into the AES table', () => {
    const slot = parseAesKeySlot(aesRecord(1, 0xab), 0);
    expect(() => applyKeySlotToRecord(aesRecord(1, 0xab), slot, 'arc4', 'aes'))
      .toThrow(D890KeyTypeChangeError);
  });

  it('refuses to write an AES key into the ARC4 table', () => {
    const slot = parseAesKeySlot(aesRecord(1, 0xab), 0);
    expect(() => applyKeySlotToRecord(aesRecord(1, 0xab), slot, 'aes', 'arc4'))
      .toThrow(D890KeyTypeChangeError);
  });

  it('says what to do instead, rather than just refusing', () => {
    const slot = parseAesKeySlot(aesRecord(1, 0xab), 0);
    try {
      applyKeySlotToRecord(aesRecord(1, 0xab), slot, 'arc4', 'aes');
      throw new Error('should have refused');
    } catch (e) {
      expect((e as Error).message).toMatch(/create a new key of the wanted type and delete/);
    }
  });
});

describe('key slot encoder', () => {
  it('round-trips an AES slot', () => {
    const original = aesRecord(3, 0x5a);
    const slot = parseAesKeySlot(original, 0);
    expect(slot.empty).toBe(false);
    expect(hex(applyKeySlotToRecord(original, slot, 'aes', 'aes'))).toBe(hex(original));
  });

  it('round-trips an ARC4 slot', () => {
    const original = new Uint8Array(D890_ADDR.ARC4_KEY_STRIDE);
    original[0] = 2;
    original.fill(0x77, D890_ADDR.ARC4_KEY_OFFSET, D890_ADDR.ARC4_KEY_OFFSET + D890_ADDR.ARC4_KEY_BYTES);
    const slot = parseArc4KeySlot(original, 0);
    expect(hex(applyKeySlotToRecord(original, slot, 'arc4', 'arc4'))).toBe(hex(original));
  });

  it('deletes a key by zeroing its bytes, which is what makes a slot empty', () => {
    const original = aesRecord(3, 0x5a);
    const slot = parseAesKeySlot(original, 0);
    const out = applyKeySlotToRecord(original, { ...slot, empty: true }, 'aes', 'aes');
    expect(parseAesKeySlot(out, 0).empty).toBe(true);
    // The key ID survives - deleting the key does not free the slot number.
    expect(out[0]).toBe(3);
  });

  it('refuses a key of the wrong length rather than padding it', () => {
    const original = aesRecord(1, 0x11);
    const slot = parseAesKeySlot(original, 0);
    expect(() => applyKeySlotToRecord(original, { ...slot, keyHex: 'ABCD' }, 'aes', 'aes'))
      .toThrow(/needs 64 hex characters/);
  });

  it('leaves bytes outside the key field alone', () => {
    const original = aesRecord(1, 0x11).fill(0x5a, D890_ADDR.AES_KEY_OFFSET + D890_ADDR.AES_KEY_BYTES);
    const slot = parseAesKeySlot(original, 0);
    const out = applyKeySlotToRecord(original, slot, 'aes', 'aes');
    for (let i = D890_ADDR.AES_KEY_OFFSET + D890_ADDR.AES_KEY_BYTES; i < out.length; i += 1) {
      expect(out[i], `byte ${i}`).toBe(0x5a);
    }
  });
});

describe('encryption id and key reference', () => {
  it('stores both BIG-endian, unlike almost everything else on this radio', () => {
    const id = applyEncryptionIdToRecord(new Uint8Array(D890_ADDR.ENCRYPTION_ID_STRIDE), 0x1234);
    expect([id[0], id[1]]).toEqual([0x12, 0x34]);

    const key = applyEncryptionKeyRefToRecord(
      new Uint8Array(D890_ADDR.ENCRYPTION_KEY_STRIDE),
      0xabcd
    );
    const at = D890_ADDR.ENCRYPTION_KEY_OFFSET;
    expect([key[at], key[at + 1]]).toEqual([0xab, 0xcd]);
  });

  it('round-trips through the parser', () => {
    const idBytes = applyEncryptionIdToRecord(new Uint8Array(D890_ADDR.ENCRYPTION_ID_STRIDE), 7);
    const keyBytes = applyEncryptionKeyRefToRecord(
      new Uint8Array(D890_ADDR.ENCRYPTION_KEY_STRIDE),
      9
    );
    const slot = parseEncryptionSlot(idBytes, keyBytes, 0);
    expect(slot.encryptionId).toBe(7);
    expect(slot.key).toBe(9);
  });
});
