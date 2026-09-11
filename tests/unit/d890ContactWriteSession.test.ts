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

const contacts: Contact[] = [
  { id: 1, name: 'Bravo', dmrId: 3340002, callSign: 'XE3N', city: 'Playa', province: 'QR', country: 'Mexico' },
  { id: 2, name: 'Alpha', dmrId: 3340001, callSign: 'XE3REM', city: 'Merida', province: 'Yucatan', country: 'Mexico' },
];

/** A connection that records what it was asked to write and never touches a port. */
function fakeConn() {
  const writes: { address: number; data: Uint8Array }[] = [];
  return {
    writes,
    // eslint-disable-next-line @typescript-eslint/require-await
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

  it('sorts by DMR ID before writing, whatever order it was handed', async () => {
    // The list above is deliberately out of order. The radio searches by ID.
    const conn = fakeConn();
    await withConn(new D890UVProtocol(), conn).writeContacts(contacts);
    const header = conn.writes.find((w) => w.address === D890_DIGITAL_CONTACTS.HEADER)!;
    expect(header.data[0]).toBe(2); // count
    const first = conn.writes.find((w) => w.address === D890_DIGITAL_CONTACTS.BASE)!;
    // BCD 03 34 00 01 — Alpha, the LOWER id, is written first.
    expect(Array.from(first.data.subarray(2, 6))).toEqual([0x03, 0x34, 0x00, 0x01]);
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

  it('reports progress as it goes', async () => {
    const conn = fakeConn();
    const seen: number[] = [];
    await withConn(new D890UVProtocol(), conn).writeContacts(contacts, (p) => seen.push(p));
    expect(seen.length).toBeGreaterThan(0);
    expect(seen[seen.length - 1]).toBe(100);
  });
});
