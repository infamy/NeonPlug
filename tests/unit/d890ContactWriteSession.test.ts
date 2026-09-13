/**
 * The contact write SESSION — what actually goes down the wire, and the
 * regression that matters most.
 *
 * Until 2026-09-10 `writeContacts` on this radio was the base class's empty
 * method. The Contacts tab had a Write button, it sent nothing at all, and the
 * UI then reported "Successfully wrote N contacts". That is the same silent
 * discard as the tables audited days earlier, and a test that only checks the
 * planner would not have caught it — the planner was fine, nothing called it.
 */

import { describe, it, expect } from 'vitest';
import { D890UVProtocol } from '../../src/radios/d890uv/protocol';
import { BaseDigitalProtocol } from '../../src/radios/shared/BaseProtocols';
import { D890_DIGITAL_CONTACTS } from '../../src/radios/d890uv/digitalContacts';
import type { Contact } from '../../src/models/Contact';
import { planDigitalContactWrite } from '../../src/radios/d890uv/digitalContactWrite';

const contacts: Contact[] = [
  { id: 1, name: 'Bravo', dmrId: 3340002, callSign: 'XE3N', city: 'Playa', province: 'QR', country: 'Mexico' },
  { id: 2, name: 'Alpha', dmrId: 3340001, callSign: 'XE3REM', city: 'Merida', province: 'Yucatan', country: 'Mexico' },
];

/** A connection that records what it was asked to write and never touches a port. */
function fakeConn() {
  const writes: { address: number; data: Uint8Array }[] = [];
  return {
    writes,
    async writeMemory(address: number, data: Uint8Array) { writes.push({ address, data }); },
  };
}

function withConn(proto: D890UVProtocol, conn: ReturnType<typeof fakeConn>) {
  (proto as unknown as { connection: unknown }).connection = conn;
  return proto;
}

describe('D890UVProtocol.writeContacts', () => {
  it('is NOT the base class no-op', () => {
    // The whole bug in one assertion.
    expect(D890UVProtocol.prototype.writeContacts)
      .not.toBe(BaseDigitalProtocol.prototype.writeContacts);
  });

  it('actually sends frames, to all three regions', async () => {
    const conn = fakeConn();
    await withConn(new D890UVProtocol(), conn).writeContacts(contacts);
    expect(conn.writes.length).toBeGreaterThan(0);
    const at = (a: number) => conn.writes.some((w) => w.address === a);
    expect(at(D890_DIGITAL_CONTACTS.HEADER)).toBe(true);
    expect(at(D890_DIGITAL_CONTACTS.INDEX)).toBe(true);
    expect(at(D890_DIGITAL_CONTACTS.BASE)).toBe(true);
    expect(conn.writes.every((w) => w.data.length === 0x10)).toBe(true);
  });

  it('writes records in input order and the index in key order', async () => {
    // The list above is deliberately out of order: Bravo, then Alpha.
    const conn = fakeConn();
    await withConn(new D890UVProtocol(), conn).writeContacts(contacts);
    const header = conn.writes.find((w) => w.address === D890_DIGITAL_CONTACTS.HEADER)!;
    expect(header.data[0]).toBe(2); // count
    const first = conn.writes.find((w) => w.address === D890_DIGITAL_CONTACTS.BASE)!;
    // Bravo was handed over first, so its record is first — BCD 03 34 00 02…
    expect(Array.from(first.data.subarray(2, 6))).toEqual([0x03, 0x34, 0x00, 0x02]);
    // …while the index leads with Alpha, the lower key.
    const idx = conn.writes.find((w) => w.address === D890_DIGITAL_CONTACTS.INDEX)!;
    expect(new DataView(idx.data.buffer, idx.data.byteOffset).getUint32(0, true)).toBe(0x06680002);
  });

  it('CANCELS between frames and says the database is incomplete', async () => {
    const conn = fakeConn();
    let seen = 0;
    await expect(
      withConn(new D890UVProtocol(), conn).writeContacts(contacts, undefined, () => ++seen > 2)
    ).rejects.toThrow(/INCOMPLETE/);
    // It stopped early rather than running to the end.
    expect(conn.writes.length).toBeLessThan(10);
  });

  it('reports progress as it goes, saying how many contacts', async () => {
    const conn = fakeConn();
    const seen: number[] = [];
    const messages: string[] = [];
    await withConn(new D890UVProtocol(), conn).writeContacts(contacts, (p, m) => {
      seen.push(p);
      messages.push(m);
    });
    expect(seen.length).toBeGreaterThan(0);
    expect(seen[seen.length - 1]).toBe(100);
    expect(messages[messages.length - 1]).toMatch(/^Writing 2 contacts · .+ KB\/s/);
  });
});

/**
 * The contact READ used to parse each 200,000-byte bank on its own, and a record
 * split across two banks parses from neither half. Against the vendor's own
 * 500,000-contact upload that dropped 11 of 36,957 records in 21 banks.
 */
describe('D890UVProtocol.readDigitalContacts', () => {
  it('reads by the header and keeps records that straddle a bank', async () => {
    const list = Array.from({ length: 5000 }, (_, i) => ({
      dmrId: 1000000 + i, name: `Name ${i}`, city: 'Springfield', callSign: `K${i}`,
      province: 'Illinois', country: 'United States', isFriend: false, flags: 0,
    }));
    const plan = planDigitalContactWrite(list);
    expect(plan.streamBytes).toBeGreaterThan(2 * D890_DIGITAL_CONTACTS.BANK_BYTES);
    const mem = new Map<number, Uint8Array>();
    for (const f of plan.frames) mem.set(f.address, f.data);
    const radio = {
        async readMemory(address: number, length: number) {
        const out = new Uint8Array(length).fill(0xff);
        for (let o = 0; o < length; o += 0x10) {
          const frame = mem.get(address + o);
          if (frame) out.set(frame.subarray(0, Math.min(0x10, length - o)), o);
        }
        return out;
      },
    };
    const proto = new D890UVProtocol();
    (proto as unknown as { connection: unknown }).connection = radio;
    const messages: string[] = [];
    const got = await proto.readDigitalContacts((_, message) => messages.push(message));
    expect(got).toHaveLength(list.length);
    expect(got.map((c) => c.dmrId)).toEqual(list.map((c) => c.dmrId));
    // The count comes from the header, before any record has been parsed.
    expect(messages[0]).toMatch(new RegExp(`^Reading ${(5000).toLocaleString()} contacts · `));
  });
});
