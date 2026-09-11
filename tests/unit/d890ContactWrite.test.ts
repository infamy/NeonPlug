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
import { planDigitalContactWrite, contactEndAddress } from '../../src/radios/d890uv/digitalContactWrite';
import { D890_DIGITAL_CONTACTS } from '../../src/radios/d890uv/digitalContacts';
import { parseDigitalContactBank, type D890DigitalContact } from '../../src/radios/d890uv/digitalContacts';

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

  it('writes the INDEX byte for byte, terminator and all', () => {
    // 8,048 bytes: 1,005 (key, offset) pairs plus eight 0xFF. The key is
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

  it('sorts by DMR ID, because the radio searches by it', () => {
    const shuffled = [...contacts].reverse();
    const out = planDigitalContactWrite(shuffled);
    expect(out.contacts.map((c) => c.dmrId)).toEqual(contacts.map((c) => c.dmrId));
    expect(Array.from(region(out, D890_DIGITAL_CONTACTS.INDEX, VENDOR.index.length)))
      .toEqual(Array.from(VENDOR.index));
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
