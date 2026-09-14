import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  parseDigitalContact,
  parseDigitalContactBank,
  isEmptyContactBank,
  D890_CONTACT_FRIEND_FLAG,
} from '../../src/radios/d890uv/digitalContacts';

const DIR = join(__dirname, '../fixtures/d890uv');
/** First 1 KB of bank 0, from a capture of the vendor CPS reading its contacts. */
const HEAD = new Uint8Array(readFileSync(join(DIR, 'digital-contacts-head.bin')));
/** A record with the MyFriend bit set, plus its neighbours. */
const FRIEND = new Uint8Array(readFileSync(join(DIR, 'digital-contacts-friend.bin')));

describe('DA-7X2 digital contacts', () => {
  it('parses the first record of the database', () => {
    const r = parseDigitalContact(HEAD, 0);
    expect(r).not.toBeNull();
    expect(r!.contact).toMatchObject({
      dmrId: 23401,
      name: 'Bradley',
      city: 'Bristol',
      callSign: 'M0JXR',
      province: 'England',
      country: 'United Kingdom',
      isFriend: false,
    });
  });

  it('walks a bank and keeps every record in order', () => {
    const all = parseDigitalContactBank(HEAD);
    expect(all.length).toBeGreaterThan(5);
    expect(all.map((c) => c.callSign).slice(0, 4)).toEqual(['M0JXR', 'GW1SYG', 'VA2XB', 'VE2YI']);
  });

  it('reads the MyFriend flag, which is what the Friends List is', () => {
    // The friends list is not a table — this bit is the whole feature.
    const r = parseDigitalContact(FRIEND, 0);
    expect(r!.contact.name).toBe('Daria');
    expect(r!.contact.callSign).toBe('VY1JN');
    expect(r!.contact.isFriend).toBe(true);
    expect(r!.contact.flags & D890_CONTACT_FRIEND_FLAG).toBe(D890_CONTACT_FRIEND_FLAG);
  });

  it('does not mark the following record as a friend', () => {
    // Guards against the flag "sticking" across a variable-length record — the
    // failure mode that would turn a 2-friend radio into a 163,000-friend one.
    const all = parseDigitalContactBank(FRIEND);
    expect(all[0].isFriend).toBe(true);
    expect(all.slice(1).every((c) => !c.isFriend)).toBe(true);
  });

  it('accepts short DMR IDs — they are legitimate, not parse errors', () => {
    // IDs share a country prefix and vary in length after it: 30233 and
    // 3027042 are both real Canadian ids. Rejecting the short one would drop
    // real contacts.
    expect(parseDigitalContact(FRIEND, 0)!.contact.dmrId).toBe(30233);
  });

  it('rejects a non-BCD id rather than inventing a contact', () => {
    const junk = new Uint8Array(HEAD);
    junk[2] = 0xab;
    expect(parseDigitalContact(junk, 0)).toBeNull();
  });

  it('rejects a record with no callsign', () => {
    // Padding between records can look like an empty string run; a contact with
    // neither name nor callsign is padding, and accepting it makes the walker
    // drift for the rest of the bank.
    const blank = new Uint8Array(64);
    expect(parseDigitalContact(blank, 0)).toBeNull();
  });

  it('recognises an unused bank so the reader can stop early', () => {
    expect(isEmptyContactBank(new Uint8Array(256).fill(0xff))).toBe(true);
    expect(isEmptyContactBank(new Uint8Array(256))).toBe(true);
    expect(isEmptyContactBank(HEAD)).toBe(false);
  });
});
