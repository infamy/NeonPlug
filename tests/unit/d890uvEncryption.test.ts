import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseEncryptionSlot } from '../../src/radios/d890uv/structures';
import { D890_ADDR } from '../../src/radios/d890uv/constants';

/**
 * Real bytes from 0x3585000 and 0x3585100, read off a DA-7X2 on 2026-08-30.
 *
 * This table was hunted for across four candidate regions and 16 KB of dense
 * data and never found, because it is nowhere near any of them. Its address came
 * from the vendor's own upload/download marshallers, and the dump then matched
 * the prediction exactly on the first try.
 */
const DIR = join(__dirname, '../fixtures/d890uv');
const IDS = new Uint8Array(readFileSync(join(DIR, 'encryption-ids.bin')));
const KEYS = new Uint8Array(readFileSync(join(DIR, 'encryption-keys.bin')));

describe('DA-7X2 basic encryption table', () => {
  it('reads the 32 factory IDs the radio actually returned', () => {
    // 01 01 02 02 03 03 ... 20 20 — slot i holds ID i+1 in both bytes.
    for (let i = 0; i < D890_ADDR.ENCRYPTION_SLOTS; i += 1) {
      const slot = parseEncryptionSlot(IDS, KEYS, i);
      expect(slot.slot).toBe(i + 1);
      expect(slot.encryptionId).toBe((i + 1) * 0x101);
      expect(slot.key).toBe(0);
    }
  });

  it('reads the ID big-endian, which no captured data could have told us', () => {
    // Every factory ID is byte-palindromic (0x0101, 0x0202 …), so the samples
    // cannot distinguish big- from little-endian. The vendor marshaller can, and
    // says the radio is big-endian while the .rdt is little-endian. This pins the
    // decode against a NON-palindromic value, which is the only way to test it.
    const ids = Uint8Array.from(IDS);
    ids[0] = 0x12;
    ids[1] = 0x34;
    expect(parseEncryptionSlot(ids, KEYS, 0).encryptionId).toBe(0x1234);
  });

  it('takes the key from +0x10 of a 0x28 slot, not from the start of it', () => {
    // Only bytes +0x10/+0x11 of each 40-byte slot are touched by the vendor
    // routine; the rest is unresolved. Reading from +0x00 would return whatever
    // those unresolved bytes hold.
    const keys = new Uint8Array(D890_ADDR.ENCRYPTION_KEY_STRIDE * 2);
    keys[0x10] = 0xab;
    keys[0x11] = 0xcd;
    keys[D890_ADDR.ENCRYPTION_KEY_STRIDE + 0x10] = 0x00;
    keys[D890_ADDR.ENCRYPTION_KEY_STRIDE + 0x11] = 0x07;
    expect(parseEncryptionSlot(IDS, keys, 0).key).toBe(0xabcd);
    expect(parseEncryptionSlot(IDS, keys, 1).key).toBe(7);
  });

  it('places the two tables where the marshaller puts them', () => {
    expect(D890_ADDR.ENCRYPTION_ID_TABLE).toBe(0x3585000);
    expect(D890_ADDR.ENCRYPTION_KEY_TABLE).toBe(0x3585100);
    // 32 slots x 2 bytes of ID is exactly the 0x40 block the CPS registers.
    expect(D890_ADDR.ENCRYPTION_SLOTS * D890_ADDR.ENCRYPTION_ID_STRIDE).toBe(0x40);
    // and 32 x 0x28 is exactly its 0x500 key block.
    expect(D890_ADDR.ENCRYPTION_SLOTS * D890_ADDR.ENCRYPTION_KEY_STRIDE).toBe(0x500);
  });
});
