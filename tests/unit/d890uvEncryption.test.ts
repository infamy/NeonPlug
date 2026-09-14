import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  parseEncryptionSlot,
  parseAesKeySlot,
  parseArc4KeySlot,
  aesKeyNum,
} from '../../src/radios/d890uv/structures';
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
  it('matches the vendor CSV row for row', () => {
    // EncryptionCode.CSV of this same codeplug: ID 257, 514, 771, 1028 ... which
    // is 0x0101, 0x0202, 0x0303 — the slot number in BOTH bytes, not the slot
    // number itself. The IDs are NOT 1-32; the slots are. Two consequences:
    // the field is 16-bit (257 does not fit in a byte), and it is the ID table
    // rather than the key table, because the CSV's Key column is 0 throughout
    // and 0x3585100 reads all zeros.
    expect(parseEncryptionSlot(IDS, KEYS, 0).encryptionId).toBe(257);
    expect(parseEncryptionSlot(IDS, KEYS, 1).encryptionId).toBe(514);
    expect(parseEncryptionSlot(IDS, KEYS, 3).encryptionId).toBe(1028);
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

/**
 * Bytes read off the radio on 2026-08-30 AFTER two keys per type were set in the
 * vendor CPS and written to the radio.
 *
 * This is the capture that turned three marshaller-derived addresses into
 * hardware-confirmed ones. Before it, AES and ARC4 read all zeros — which is
 * equally consistent with "every slot is at factory default" and "the address is
 * wrong", because unused memory reads zeros too. Writing a known key is the only
 * way to tell those apart, and it is why the values were chosen to contain no
 * 0x00 and no 0xFF.
 */
const IDS_SET = new Uint8Array(readFileSync(join(DIR, 'encryption-ids-set.bin')));
const KEYS_SET = new Uint8Array(readFileSync(join(DIR, 'encryption-keys-set.bin')));
const AES = new Uint8Array(readFileSync(join(DIR, 'aes-keys.bin')));
const ARC4 = new Uint8Array(readFileSync(join(DIR, 'arc4-keys.bin')));

describe('DA-7X2 encryption, against keys written to a real radio', () => {
  it('proves the radio is big-endian, which no factory data could', () => {
    // Encryption ID 22136 = 0x5678 came back as `56 78`, not `78 56`. Every
    // factory ID is byte-palindromic (0x0101, 0x0202 …), so this is the first
    // value this table has ever held that can tell the two orders apart.
    expect(Array.from(IDS_SET.subarray(0, 4))).toEqual([0x56, 0x78, 0xef, 0x01]);
    expect(parseEncryptionSlot(IDS_SET, KEYS_SET, 0).encryptionId).toBe(22136);
    expect(parseEncryptionSlot(IDS_SET, KEYS_SET, 1).encryptionId).toBe(61185);
  });

  it('accepts IDs far above the largest factory default', () => {
    // 61185 is well past 8224 (0x2020, slot 32's default). An earlier worry that
    // the field was capped near the defaults was wrong, and the radio storing it
    // intact also proves the field is genuinely 16-bit rather than clamped.
    expect(parseEncryptionSlot(IDS_SET, KEYS_SET, 1).encryptionId).toBeGreaterThan(0x2020);
  });

  it('pins stride 0x28 and key offset +0x10 with one byte position', () => {
    // Slot 1's key sits at 0x10 and slot 2's at 0x38. 0x38 = 0x28 + 0x10, so a
    // single observation fixes BOTH numbers — no other (stride, offset) pair
    // that also puts slot 1 at 0x10 lands slot 2 there.
    expect(KEYS_SET[0x10] << 8 | KEYS_SET[0x11]).toBe(4660);
    expect(KEYS_SET[0x38] << 8 | KEYS_SET[0x39]).toBe(43981);
    expect(parseEncryptionSlot(IDS_SET, KEYS_SET, 0).key).toBe(4660);
    expect(parseEncryptionSlot(IDS_SET, KEYS_SET, 1).key).toBe(43981);
    // and nothing else in all 1280 bytes is set
    const live = Array.from(KEYS_SET.entries()).filter(([, b]) => b !== 0).map(([i]) => i);
    expect(live).toEqual([0x10, 0x11, 0x38, 0x39]);
  });

  it('reads back both AES keys byte for byte', () => {
    const a = parseAesKeySlot(AES, 0);
    const b = parseAesKeySlot(AES, 1);
    expect(a.keyHex).toBe('111C27323D48535E69747F8A95A0ABB6C1CCD7E2EDF8030E19242F3A45505B66');
    expect(b.keyHex).toBe('F0E3D6C9BCAFA295887B6E6154473A2D201306F9ECDFD2C5B8AB9E9184776A5D');
    expect(a.empty).toBe(false);
    // Slot 2 landing at 0x40 is what proves the stride; the second key was
    // deliberately written backwards relative to the first so a stride error
    // would misplace two obviously different runs instead of overlapping.
    expect(Array.from(AES.subarray(0x41, 0x45))).toEqual([0xf0, 0xe3, 0xd6, 0xc9]);
    // 0x40 = 64 hex characters = a 256-bit key.
    expect(aesKeyNum(AES, 0)).toBe(0x40);
    expect(aesKeyNum(AES, 1)).toBe(0x40);
  });

  it('reads back both ARC4 keys byte for byte', () => {
    expect(parseArc4KeySlot(ARC4, 0).keyHex).toBe('A1B2C3D4E5');
    expect(parseArc4KeySlot(ARC4, 1).keyHex).toBe('0F1E2D3C4B');
    expect(parseArc4KeySlot(ARC4, 2).empty).toBe(true);
  });

  it('reports an untouched slot as empty rather than as a key of zeros', () => {
    // Matters because "no key" and "a key that happens to be zero" must not be
    // conflated on a write path that could otherwise install a null key.
    expect(parseAesKeySlot(AES, 5).empty).toBe(true);
    expect(parseAesKeySlot(AES, 5).keyHex).toBe('0'.repeat(64));
  });
});

describe('encryptionId travels with the key', () => {
  it('is a different number from the slot, and both are needed', () => {
    // A channel references the 16-bit Encryption ID, not the slot. On the
    // captured radio slot 1 holds ID 22136 and slot 2 holds 61185, so using the
    // slot to resolve a channel's key would pick the wrong key every time.
    const s1 = parseEncryptionSlot(IDS_SET, KEYS_SET, 0);
    const s2 = parseEncryptionSlot(IDS_SET, KEYS_SET, 1);
    expect(s1.slot).toBe(1);
    expect(s1.encryptionId).toBe(22136);
    expect(s2.slot).toBe(2);
    expect(s2.encryptionId).toBe(61185);
    expect(s1.encryptionId).not.toBe(s1.slot);
  });

  it('stays distinguishable from the key itself', () => {
    // ID and key are separate 16-bit fields in separate tables. Conflating them
    // is easy because both are u16 big-endian on the same radio.
    const s1 = parseEncryptionSlot(IDS_SET, KEYS_SET, 0);
    expect(s1.encryptionId).toBe(22136);
    expect(s1.key).toBe(4660);
  });
});
