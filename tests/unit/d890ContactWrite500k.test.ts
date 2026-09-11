/**
 * The contact database layout, proved against the vendor's own 500,000-contact
 * upload (`7x2_500k.txt`, 2026-09-10).
 *
 * The capture is 150 MB and its logger stopped partway through the records, so
 * what is committed is a 2 KB cut of it: the header, the index where it crosses
 * from its first bank to its second, and three records that straddle a record
 * bank boundary — each with the index entry pointing at it. Every byte in
 * `contactwrite500k.json` came off the wire.
 *
 * The CSV was shuffled on purpose, which is what exposed that the vendor writes
 * records in INPUT order and sorts only the index.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { encodeDigitalContact, D890_DIGITAL_CONTACTS as D } from '../../src/radios/d890uv/digitalContacts';
import {
  contactEndAddress, contactStreamLength, contactStreamAddress,
  contactIndexAddress, contactIndexKey,
} from '../../src/radios/d890uv/digitalContactWrite';
import { D890_FLASH_MARKER_STRIDE, D890_FORBIDDEN_UNIT_OFFSETS } from '../../src/radios/d890uv/constants';

const F = JSON.parse(readFileSync(join(__dirname, '../fixtures/d890uv/contactwrite500k.json'), 'utf8'));
const hex = (s: string) => Uint8Array.from(s.match(/../g)!.map((b) => parseInt(b, 16)));
const u32 = (b: Uint8Array, at: number) =>
  (b[at]! | (b[at + 1]! << 8) | (b[at + 2]! << 16) | (b[at + 3]! << 24)) >>> 0;

describe('the vendor 500,000-contact upload', () => {
  it('header: the count, and an end address our formula reproduces', () => {
    const h = hex(F.header);
    expect(u32(h, 0)).toBe(500000);
    expect(u32(h, 4)).toBe(contactEndAddress(F.streamBytes));
    expect(contactStreamLength(u32(h, 4))).toBe(F.streamBytes);
    expect(Array.from(h.subarray(8))).toEqual(new Array(8).fill(0));
  });

  for (const s of F.straddlers) {
    it(`record ${s.dmrId}, which straddles record bank boundary ${s.boundary}`, () => {
      const ours = encodeDigitalContact({
        dmrId: s.dmrId, name: s.name, city: s.city, callSign: s.callSign,
        province: s.province, country: s.country, isFriend: false, flags: 0,
      });
      expect(Array.from(ours)).toEqual(Array.from(hex(s.bytes)));
      // It starts in one bank and ends in the next, 0x80000 on.
      const cut = s.boundary * D.BANK_BYTES;
      expect(s.streamOffset).toBeLessThan(cut);
      expect(s.streamOffset + ours.length).toBeGreaterThan(cut);
      expect(contactStreamAddress(cut - 1))
        .toBe(D.BASE + (s.boundary - 1) * D.BANK_STRIDE + D.BANK_BYTES - 1);
      expect(contactStreamAddress(cut)).toBe(D.BASE + s.boundary * D.BANK_STRIDE);
      // Its index entry: its key, and its offset in the WHOLE stream.
      const e = hex(s.indexEntry);
      expect(u32(e, 0)).toBe(contactIndexKey(s.dmrId));
      expect(u32(e, 4)).toBe(s.streamOffset);
      expect(Math.floor((contactIndexAddress(s.indexRank) - D.INDEX) / D.INDEX_BANK_STRIDE))
        .toBe(Math.floor(s.indexRank / D.INDEX_BANK_ENTRIES));
    });
  }

  it('the index runs on from bank 0 to bank 1, 0x80000 later, still ascending', () => {
    const b = hex(F.indexBankBoundary.bytes);
    const keys = [0, 1, 2, 3].map((i) => u32(b, i * 8));
    expect(keys).toEqual([...keys].sort((x, y) => x - y));
    expect(contactIndexAddress(31999)).toBe(D.INDEX + 255992);
    expect(contactIndexAddress(32000)).toBe(D.INDEX + D.INDEX_BANK_STRIDE);
    expect(F.indexBanks.firstBytes).toBe(D.INDEX_BANK_BYTES);
  });

  it('keeps every index bank clear of the flash-management markers', () => {
    expect(D.INDEX % D890_FLASH_MARKER_STRIDE).toBe(0);
    expect(D.INDEX_BANK_STRIDE % D890_FLASH_MARKER_STRIDE).toBe(0);
    expect(D.INDEX_BANK_BYTES).toBeLessThanOrEqual(Math.min(...D890_FORBIDDEN_UNIT_OFFSETS));
    expect(D.INDEX_BANK_ENTRIES * 8).toBe(D.INDEX_BANK_BYTES);
    expect(D.INDEX_BANKS * D.INDEX_BANK_ENTRIES).toBeGreaterThanOrEqual(D.MAX_CONTACTS);
  });
});
