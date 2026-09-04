import { describe, it, expect } from 'vitest';
import { parseAmZone, D890_AM_ZONES } from '../../src/radios/d890uv/amZones';
import { applyAmZoneToRecord } from '../../src/radios/d890uv/tableWrite';

/**
 * `currentChannel` is an ABSOLUTE index into the AM airband table.
 *
 * Not a position in the zone's own member list — which IS how the main zone
 * table's A/B channels work, and why this was an open question in the code for
 * weeks. Hardware settled it 2026-09-03: a radio whose AM channels occupied
 * indices 3-31, with every zone carrying `currentChannel: 0` (hardcoded by the
 * airport import), displayed **AM-001** — the leftover name in the DELETED
 * record at index 0. A position would have selected the zone's first member and
 * shown "CZBB TWR".
 *
 * Deleting a channel clears its mask bit but leaves its record, so a stale
 * pointer does not fail loudly — the radio shows whatever bytes remain.
 */
const build = (name: string, members: number[], current: number) => {
  const rec = new Uint8Array(D890_AM_ZONES.STRIDE);
  for (let i = 0; i < name.length; i += 1) {
    rec[i * 2] = name.charCodeAt(i) & 0xff;
    rec[i * 2 + 1] = name.charCodeAt(i) >> 8;
  }
  rec[D890_AM_ZONES.CURRENT_AT] = current & 0xff;
  rec[D890_AM_ZONES.CURRENT_AT + 1] = (current >> 8) & 0xff;
  members.forEach((m, i) => {
    rec[D890_AM_ZONES.MEMBERS_AT + i * 2] = m & 0xff;
    rec[D890_AM_ZONES.MEMBERS_AT + i * 2 + 1] = (m >> 8) & 0xff;
  });
  rec[D890_AM_ZONES.MEMBERS_AT + members.length * 2] = 0xff;
  rec[D890_AM_ZONES.MEMBERS_AT + members.length * 2 + 1] = 0xff;
  return rec;
};

describe('AM zone current channel', () => {
  it('round-trips as a raw absolute index, unresolved', () => {
    // The value the radio stores is written back unchanged — the decoder must
    // not "helpfully" convert it to a position, which is the mistake the field's
    // resemblance to the main zone table invites.
    const rec = build('CZBB', [3, 4, 5], 3);
    const zone = parseAmZone(rec, 1)!;
    expect(zone.currentChannel).toBe(3);
    expect(zone.members).toEqual([3, 4, 5]);
    const out = applyAmZoneToRecord(rec, zone);
    expect(Array.from(out)).toEqual(Array.from(rec));
  });

  it('a zone pointing outside its own members is representable — and wrong', () => {
    // This is the exact shape the airport import produced: members 3,4,5 with
    // currentChannel 0. Nothing in the format prevents it, which is why the UI
    // has to keep it valid rather than relying on a parse-time check.
    const zone = parseAmZone(build('CZBB', [3, 4, 5], 0), 1)!;
    expect(zone.currentChannel).toBe(0);
    expect(zone.members).not.toContain(zone.currentChannel);
  });

  it('a valid zone names one of its own members', () => {
    const zone = parseAmZone(build('CYVR', [9, 10, 11], 9), 2)!;
    expect(zone.members).toContain(zone.currentChannel);
  });
});

describe('AM zone member area stops at 0x62', () => {
  it('caps members at 32, not the 47 the record stride implies', () => {
    // CONFIRMED ON HARDWARE 2026-09-03: the vendor CPS fills 0xFF from the
    // member terminator to 0x61 then switches to 0x00 at 0x62, on every zone.
    // It would have no reason to draw that boundary if members ran to the end.
    // Capacity from STRIDE let a 32+ member zone write into 0x62-0x7f.
    const capacity = (D890_AM_ZONES.MEMBERS_END - D890_AM_ZONES.MEMBERS_AT) >> 1;
    expect(capacity).toBe(32);
    expect(D890_AM_ZONES.MEMBERS_END).toBeLessThan(D890_AM_ZONES.STRIDE);

    const rec = build('FULL', [], 0);
    const members = Array.from({ length: capacity }, (_, i) => i);
    expect(() => applyAmZoneToRecord(rec, { index: 0, name: 'FULL', members, currentChannel: 0 }))
      .toThrow(/do(es)? not fit|holds/i);
  });

  it('never writes above 0x62, even at maximum members', () => {
    const rec = build('X', [], 0);
    // Poison the unmodelled tail so any encroachment is visible.
    rec.fill(0xa5, D890_AM_ZONES.UNMODELLED_AT);
    const members = Array.from({ length: 31 }, (_, i) => i);
    const out = applyAmZoneToRecord(rec, { index: 0, name: 'X', members, currentChannel: 0 });
    expect(
      out.subarray(D890_AM_ZONES.UNMODELLED_AT).every((b) => b === 0xa5),
      '0x62-0x7f belongs to the radio, not to the member list'
    ).toBe(true);
  });

  it('decoding stops at the boundary too', () => {
    // A record whose tail happens to hold plausible u16s must not read them as
    // members just because there is no terminator in the way.
    const rec = build('Y', [1, 2], 1);
    rec.fill(0x03, D890_AM_ZONES.UNMODELLED_AT);
    expect(parseAmZone(rec, 0)!.members).toEqual([1, 2]);
  });
});

describe('changing A Channel actually writes bytes', () => {
  it('moves the u16 at CURRENT_AT, and nothing else', () => {
    // The standard set on 2026-09-02: a round trip cannot tell a written field
    // from one the encoder silently skips, because the encoder PATCHES. The
    // only proof is to mutate and assert the bytes moved.
    const rec = build('CYVR', [6, 7, 8], 6);
    const out = applyAmZoneToRecord(rec, {
      index: 1, name: 'CYVR', members: [6, 7, 8], currentChannel: 8,
    });
    expect(Array.from(out.subarray(D890_AM_ZONES.CURRENT_AT, D890_AM_ZONES.CURRENT_AT + 2)))
      .toEqual([8, 0]);

    const moved: number[] = [];
    for (let i = 0; i < out.length; i += 1) if (out[i] !== rec[i]) moved.push(i);
    expect(moved, 'only the A Channel u16 changes').toEqual([D890_AM_ZONES.CURRENT_AT]);
  });

  it('survives a read back through the decoder', () => {
    const rec = build('CYVR', [6, 7, 8], 6);
    const out = applyAmZoneToRecord(rec, {
      index: 1, name: 'CYVR', members: [6, 7, 8], currentChannel: 8,
    });
    const back = parseAmZone(out, 1)!;
    expect(back.currentChannel).toBe(8);
    expect(back.members).toEqual([6, 7, 8]);
    expect(back.name).toBe('CYVR');
  });
});
