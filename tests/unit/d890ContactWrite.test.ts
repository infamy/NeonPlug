/**
 * The contact write, proved against the vendor's own upload.
 *
 * `tests/fixtures/d890uv/contactwrite/` holds four files from one session on
 * 2026-09-10: the CSV of 1,005 contacts loaded into the vendor CPS, and the
 * exact bytes it then wrote to each of the three regions. The test builds the
 * same list with our writer and compares.
 *
 * This is stronger than a round trip. A round trip proves our decoder agrees
 * with our encoder; this proves our bytes are the VENDOR'S bytes, for a list we
 * never parsed from the radio at all.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { planDigitalContactWrite, contactEndAddress, contactStreamLength, contactIndexKey } from '../../src/radios/d890uv/digitalContactWrite';
import { D890_DIGITAL_CONTACTS } from '../../src/radios/d890uv/digitalContacts';
import { D890_LIMITS } from '../../src/radios/d890uv/constants';
import { dryRunWrite } from '../../src/radios/d890uv/writeDryRun';
import { parseDigitalContactBank, parseDigitalContact, type D890DigitalContact } from '../../src/radios/d890uv/digitalContacts';

const DIR = join(__dirname, '../fixtures/d890uv/contactwrite');
const bin = (name: string) => new Uint8Array(readFileSync(join(DIR, `${name}.bin`)));
const VENDOR = { header: bin('header'), index: bin('index'), records: bin('records') };

/**
 * The contact list the CPS actually wrote, taken from ITS OWN RECORD BYTES.
 *
 * NOT from the CSV, deliberately — sourcing them from the vendor's records
 * tests what is in question (index keys, offsets, ordering, header, bank
 * arithmetic) against bytes we did not produce.
 *
 * ⚠️ An earlier version of this comment claimed the CPS's truncation on import
 * was a "quirk" and that the format had no field widths. That was WRONG and it
 * shipped: `D890_CONTACT_FIELD_MAX` records what a 16-character city did to a
 * real radio. The Latin-1 mangling ("México" -> "MÃ©xico") IS an import quirk;
 * the lengths are not.
 */
function vendorContacts(): D890DigitalContact[] {
  return parseDigitalContactBank(VENDOR.records);
}

/** Frames for one region, concatenated back into a flat buffer. */
function region(plan: ReturnType<typeof planDigitalContactWrite>, address: number, bytes: number) {
  const out = new Uint8Array(bytes);
  for (const f of plan.frames) {
    if (f.address >= address && f.address < address + bytes) {
      out.set(f.data.subarray(0, Math.min(0x10, address + bytes - f.address)), f.address - address);
    }
  }
  return out;
}

describe('planDigitalContactWrite vs the vendor CPS', () => {
  const contacts = vendorContacts();
  const plan = planDigitalContactWrite(contacts);

  it('recovered the list the CPS wrote', () => {
    expect(contacts).toHaveLength(1005);
    expect(contacts[0]!.dmrId).toBe(3340001);
  });

  it('writes the HEADER byte for byte', () => {
    // count, endAddress, and the 8 padding bytes that stayed zero across a
    // 1,005-contact database and a 163,467-contact one.
    expect(Array.from(region(plan, D890_DIGITAL_CONTACTS.HEADER, 16)))
      .toEqual(Array.from(VENDOR.header));
  });

  it('writes the INDEX byte for byte, 0xFF padding and all', () => {
    // 8,048 bytes: 1,005 (key, offset) pairs, then eight 0xFF finishing the frame
    // — padding, not a terminator (a frame-aligned index gets none). The key is
    // bcdAsHex(id) << 1 and the offsets are real record positions, so this
    // catches a wrong key, a wrong order and a wrong record length at once.
    expect(Array.from(region(plan, D890_DIGITAL_CONTACTS.INDEX, VENDOR.index.length)))
      .toEqual(Array.from(VENDOR.index));
  });

  it('writes the RECORD STREAM byte for byte', () => {
    // The vendor padded its final frames with zeros past the end pointer; ours
    // stops at the stream, so compare the bytes that carry data.
    const ours = region(plan, D890_DIGITAL_CONTACTS.BASE, VENDOR.records.length);
    expect(plan.streamBytes).toBe(94686);
    expect(Array.from(ours.subarray(0, plan.streamBytes)))
      .toEqual(Array.from(VENDOR.records.subarray(0, plan.streamBytes)));
  });

  it('computes the end pointer the CPS wrote', () => {
    expect(plan.endAddress).toBe(0x079171de);
  });

  it('reproduces the reference radio end pointer too', () => {
    // 163,467 contacts, 16,407,708 bytes over 82 full banks -> 0x0a201e1c,
    // the value in that radio's own header. The only check of the bank
    // arithmetic across a boundary, since 1,005 contacts fit in bank 0.
    expect(contactEndAddress(16_407_708)).toBe(0x0a201e1c);
  });

  it('sorts the INDEX by key and leaves the RECORDS in input order', () => {
    // The 500,000 upload used a shuffled CSV: the records went in file order and
    // the sorted index pointed at each. Reversing the input must keep the index
    // keys ascending while every offset follows its own record.
    const reversed = [...contacts].reverse();
    const out = planDigitalContactWrite(reversed);
    expect(out.contacts.map((c) => c.dmrId)).toEqual(reversed.map((c) => c.dmrId));
    const idx = region(out, D890_DIGITAL_CONTACTS.INDEX, contacts.length * 8);
    const dv = new DataView(idx.buffer, idx.byteOffset);
    const keys = contacts.map((_, i) => dv.getUint32(i * 8, true));
    expect(keys).toEqual([...keys].sort((a, b) => a - b));
    const recs = region(out, D890_DIGITAL_CONTACTS.BASE, out.streamBytes + 16);
    for (const i of [0, 500, contacts.length - 1]) {
      const at = dv.getUint32(i * 8 + 4, true);
      expect(contactIndexKey(parseDigitalContact(recs, at)!.contact.dmrId)).toBe(keys[i]);
    }
  });

  it('REFUSES duplicate IDs rather than hiding one of them', () => {
    expect(() => planDigitalContactWrite([contacts[0]!, { ...contacts[1]!, dmrId: contacts[0]!.dmrId }]))
      .toThrow(/appears twice/);
  });

  it('writes header, then index, then records — the CPS order', () => {
    const firstOf = (what: string) => plan.frames.findIndex((f) => f.what.startsWith(what));
    expect(firstOf('contact header')).toBeLessThan(firstOf('contact index'));
    expect(firstOf('contact index')).toBeLessThan(firstOf('contact records'));
  });

  it('sends only whole 16-byte frames', () => {
    expect(plan.frames.every((f) => f.data.length === 0x10)).toBe(true);
    // 1 header + 503 index + 5,925 records is what the capture contains.
    expect(plan.frames.filter((f) => f.what === 'contact index')).toHaveLength(503);
  });

  it('chops the stream across banks at the right addresses', () => {
    // Not exercised by this upload — 1,005 contacts fit one bank — so it is
    // built from a synthetic list big enough to cross. Records SPAN banks: the
    // reference radio's bank 1 starts mid-record.
    const many: D890DigitalContact[] = Array.from({ length: 4000 }, (_, i) => ({
      dmrId: 1000000 + i, name: `N${i}`, city: 'CityNameHere', callSign: `CS${i}`,
      province: 'ProvinceName', country: 'CountryNameHere', isFriend: false, flags: 0,
    }));
    const big = planDigitalContactWrite(many);
    expect(big.streamBytes).toBeGreaterThan(D890_DIGITAL_CONTACTS.BANK_BYTES);
    const banks = [...new Set(big.frames.filter((f) => f.what.startsWith('contact records'))
      .map((f) => f.what))];
    expect(banks).toContain('contact records bank 1');
    const bank1 = big.frames.find((f) => f.what === 'contact records bank 1')!;
    expect(bank1.address).toBe(D890_DIGITAL_CONTACTS.BASE + D890_DIGITAL_CONTACTS.BANK_STRIDE);
  });
});

/**
 * The capacity the UI is told about.
 *
 * `getRadioInfo` reported `TALK_GROUPS_MAX` here — 10,000, the limit of an
 * entirely different table — and `ContactsTab` slices a download to it. A full
 * RadioID download of 163,467 contacts would have been cut to 10,000 silently,
 * before a byte was planned, and the tab would have shown "10,000 / 10,000" as
 * though the radio were full.
 */
describe('contact capacity', () => {
  it('is the contact database rating, not the talkgroup limit', () => {
    expect(D890_DIGITAL_CONTACTS.MAX_CONTACTS).toBe(500000);
    expect(D890_DIGITAL_CONTACTS.MAX_CONTACTS)
      .toBeGreaterThan(D890_LIMITS.TALK_GROUPS_MAX);
    // The database the reference radio actually held must fit under it.
    expect(D890_DIGITAL_CONTACTS.MAX_CONTACTS).toBeGreaterThan(163467);
  });

  it('refuses more than the rated 500,000 before encoding anything', () => {
    const tooMany = Array.from({ length: 500001 }, (_, i) => ({
      dmrId: 1000000 + i, name: 'N', city: '', callSign: 'C', province: '', country: '',
      isFriend: false, flags: 0,
    }));
    expect(() => planDigitalContactWrite(tooMany)).toThrow(/rated for 500,000/);
  });

  it('writes records out to bank 277, where the vendor\'s 500,000 upload ended', () => {
    expect(D890_DIGITAL_CONTACTS.RECORD_BANKS_MAX).toBe(278);
    expect(contactStreamLength(0x1039d304)).toBe(55519556);
  });
});

/**
 * The banked index: 32,000 entries to a bank, banks 0x80000 apart, each stopping
 * short of the flash-management marker in its unit. Measured from the vendor's
 * 500,000-contact upload; it replaced a 32,637-contact ceiling.
 */
describe('the banked contact index', () => {
  const make = (n: number) => Array.from({ length: n }, (_, i) => ({
    dmrId: 1000000 + i, name: 'N', city: '', callSign: 'C', province: '', country: '',
    isFriend: false, flags: 0,
  }));

  it('fills 32,000 entries per bank and starts the next 0x80000 on', () => {
    const plan = planDigitalContactWrite(make(32001));
    const at = plan.frames.filter((f) => f.what === 'contact index').map((f) => f.address);
    expect(at).toContain(D890_DIGITAL_CONTACTS.INDEX + D890_DIGITAL_CONTACTS.INDEX_BANK_STRIDE);
    expect(Math.max(...at.filter((a) => a < 0x07100000))).toBe(D890_DIGITAL_CONTACTS.INDEX + 256000 - 16);
  });

  it('passes the flash-marker guard far past the old 32,637 ceiling', () => {
    expect(() => dryRunWrite(planDigitalContactWrite(make(100000)).frames)).not.toThrow();
  });

  it('pads a partial last frame with 0xFF and writes no terminator', () => {
    const even = planDigitalContactWrite(make(2)).frames.filter((f) => f.what === 'contact index');
    expect(even).toHaveLength(1);
    const odd = planDigitalContactWrite(make(3)).frames.filter((f) => f.what === 'contact index');
    expect(Array.from(odd[odd.length - 1]!.data.subarray(8))).toEqual(new Array(8).fill(0xff));
  });
});
