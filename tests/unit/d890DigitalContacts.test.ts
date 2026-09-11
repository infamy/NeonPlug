/**
 * The DMR contact database: parse → encode must reproduce the radio's bytes.
 *
 * This is the OFFLINE round trip, and it is the only kind available here. The
 * database is 16.4 MB across 83 banks and the vendor CPS takes ~1,025,484
 * frames to download it, so a hardware round trip is a feature of its own. What
 * CAN be proved with no radio is that our encoder reproduces, byte for byte,
 * what the radio actually sent.
 *
 * The fixture is 500 consecutive real records — 49,336 bytes lifted from a
 * serial capture of the vendor CPS reading its own contact list, cut on a record
 * boundary.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  parseDigitalContactBank,
  parseDigitalContact,
  encodeDigitalContact,
  encodeDigitalContactBank,
  D890_CONTACT_FRIEND_FLAG,
  D890_CONTACT_FIELD_MAX,
} from '../../src/radios/d890uv/digitalContacts';

const BANK = new Uint8Array(
  readFileSync(join(__dirname, '../fixtures/d890uv/digital-contacts-bank.bin'))
);

describe('digital contact records', () => {
  it('finds every record in the fixture', () => {
    expect(parseDigitalContactBank(BANK)).toHaveLength(500);
  });

  it('re-encodes the WHOLE BANK byte for byte', () => {
    // The strongest statement available without a radio: 49,336 bytes of real
    // contact data, out and back unchanged. It also pins the record LENGTH —
    // a record two bytes short would still parse but would shift every record
    // after it, and this would catch that on the very first one.
    const contacts = parseDigitalContactBank(BANK);
    expect(Array.from(encodeDigitalContactBank(contacts))).toEqual(Array.from(BANK));
  });

  it('re-encodes each record individually to its own source bytes', () => {
    // Walk with the real parser so record boundaries come from the same code
    // the reader uses, then compare each slice.
    let offset = 0;
    let checked = 0;
    while (offset < BANK.length - 12) {
      const parsed = parseDigitalContact(BANK, offset);
      if (!parsed) { offset += 2; continue; }
      // +2 for the always-blank sixth field the parser does not return.
      const end = parsed.next + 2;
      const ours = encodeDigitalContact(parsed.contact);
      expect(Array.from(ours)).toEqual(Array.from(BANK.subarray(offset, end)));
      checked += 1;
      offset = end;
    }
    expect(checked).toBe(500);
  });

  it('keeps a DMR ID that is shorter than the field', () => {
    // 30233 and 3027042 are both real. The ID is fixed-width BCD but the number
    // is not, so the leading zeros a parse to `number` drops must come back.
    const [first] = parseDigitalContactBank(BANK);
    const round = parseDigitalContact(encodeDigitalContact(first), 0);
    expect(round!.contact.dmrId).toBe(first.dmrId);
  });

  it('carries the MyFriend bit from the model, not just the raw flags', () => {
    const [first] = parseDigitalContactBank(BANK);
    const friend = encodeDigitalContact({ ...first, isFriend: true });
    expect((friend[0]! | (friend[1]! << 8)) & D890_CONTACT_FRIEND_FLAG)
      .toBe(D890_CONTACT_FRIEND_FLAG);
    const notFriend = encodeDigitalContact({ ...first, isFriend: false });
    expect((notFriend[0]! | (notFriend[1]! << 8)) & D890_CONTACT_FRIEND_FLAG).toBe(0);
  });

  it('preserves flag bits this driver does not model', () => {
    const [first] = parseDigitalContactBank(BANK);
    const odd = encodeDigitalContact({ ...first, flags: 0x0241, isFriend: false });
    expect(odd[0]! | (odd[1]! << 8)).toBe(0x0241);
  });

  it('refuses a DMR ID too long for the four BCD bytes', () => {
    const [first] = parseDigitalContactBank(BANK);
    expect(() => encodeDigitalContact({ ...first, dmrId: 123456789 })).toThrow(/8/);
  });
});

/**
 * The field-length bug, reproduced.
 *
 * A 16-character city was written to a radio on 2026-09-10 because this driver
 * had decided the vendor's truncation was a CSV-import quirk rather than a
 * format limit. The CPS read the resulting database as 137 contacts of 200,
 * with fields sliding one column right from the first overlong record onward.
 */
describe('field length limits', () => {
  const base = {
    dmrId: 3340002, name: 'Zalo', city: 'Playa Del Carmen', callSign: 'XE3N',
    province: 'Quintana Roo', country: 'Mexico', isFriend: false, flags: 0,
  };

  it('truncates the 16-character city that desynchronised a real radio', () => {
    const round = parseDigitalContact(encodeDigitalContact(base), 0)!;
    expect(round.contact.city).toBe('Playa Del Carme');
    expect(round.contact.city).toHaveLength(D890_CONTACT_FIELD_MAX.city);
    // …and everything AFTER it still lands in its own field, which is the part
    // that actually broke: the leftover character started the next string.
    expect(round.contact.callSign).toBe('XE3N');
    expect(round.contact.province).toBe('Quintana Roo');
    expect(round.contact.country).toBe('Mexico');
  });

  it('keeps a record self-consistent when EVERY field overruns', () => {
    const long = {
      ...base,
      name: 'Rabindranath Jesus Maria',
      city: 'Municipio De Los Reyes',
      callSign: 'VERYLONGCALLSIGN',
      province: 'Baja California Norte',
      country: 'Dominican Republic',
    };
    const bytes = encodeDigitalContact(long);
    const round = parseDigitalContact(bytes, 0)!;
    // The record ends exactly where its bytes end — no drift into the next one.
    expect(round.next + 2).toBe(bytes.length);
    for (const [field, max] of Object.entries(D890_CONTACT_FIELD_MAX)) {
      expect((round.contact[field as keyof typeof D890_CONTACT_FIELD_MAX] as string).length)
        .toBeLessThanOrEqual(max);
    }
  });

  it('leaves a field at exactly the limit alone', () => {
    const exact = { ...base, city: 'x'.repeat(D890_CONTACT_FIELD_MAX.city) };
    expect(parseDigitalContact(encodeDigitalContact(exact), 0)!.contact.city)
      .toHaveLength(D890_CONTACT_FIELD_MAX.city);
  });

  it('does not disturb the vendor records, which are already within limits', () => {
    // The byte-exact fixture tests above would fail if truncation changed any
    // real record; this states it directly.
    for (const c of parseDigitalContactBank(BANK)) {
      for (const [field, max] of Object.entries(D890_CONTACT_FIELD_MAX)) {
        expect((c[field as keyof typeof D890_CONTACT_FIELD_MAX] as string).length)
          .toBeLessThanOrEqual(max);
      }
    }
  });
});
