import { describe, it, expect } from 'vitest';
import {
  parseTalkgroupQuick,
} from '../../src/radios/d890uv/structures';
import { parseBroadcastChannel } from '../../src/radios/d890uv/broadcastChannels';
import { parseFiveTone, parseTwoTone } from '../../src/radios/d890uv/tones';
import { parseGpsRoamingEntry } from '../../src/radios/d890uv/gpsRoaming';
import { parseAmZone, D890_AM_ZONES } from '../../src/radios/d890uv/amZones';
import {
  applyTalkgroupToRecord,
  applyBroadcastToRecord,
  applyFiveToneToRecord,
  applyTwoToneToRecord,
  applyGpsRoamingToRecord,
  applyAmZoneToRecord,
} from '../../src/radios/d890uv/tableWrite';

/**
 * Records taken verbatim from the vendor CPS programming a DA-7X2
 * (`WriteTo7x2.txt`), reassembled from the 16-byte frames the radio ACKed.
 * These are bytes a real radio accepted.
 *
 * The acceptance test for every encoder is the same:
 *
 *     parse(bytes) -> model -> encode(bytes, model) === bytes
 *
 * An unmodified record must rewrite unchanged. That is what makes it safe to
 * include a record in a write the user did not edit — and on this radio it
 * cannot be checked any other way, because a write is ACKed without being
 * echoed. Nothing on the wire will catch a bad encoder.
 *
 * Each encoder also gets a surgical test: change one field, assert only that
 * field's bytes move. Faithful-but-not-surgical corrupts the neighbours.
 */
const TALKGROUP_0 =
  '0100000000015400470020004c006f00630061006c0000000000000000000000' +
    '0000000000000000000000000000000000000000000000000000000000000000' +
    '0000000000000000000000000000000000000000000000000000000000000000' +
    '0000000000000000000000000000000000000000000000000000000000000000' +
    '0000000000000000000000000000000000000000000000000000000000000000' +
    '0000000000000000000000000000000000000000000000000000000000000000' +
    '00000000000000000100000000915400';
const TALKGROUP_1 =
  '0100167764155400470020004d00610078000000000000000000000000000000' +
    '0000000000000000000000000000000000000000000000000000000000000000' +
    '0000000000000000000000000000000000000000000000000000000000000000' +
    '0000000000000000000000000000000000000000000000000000000000000000' +
    '0000000000000000000000000000000000000000000000000000000000000000' +
    '0000000000000000000000000000000000000000000000000000000000000000' +
    '00000000000000000000012345675000';
const AM_0 =
  '1080000041004d002d0030003000310000000000000000000000000000000000' +
    '0000000000000000000000000000000000000000000000000000000000000000';
const FM_0 =
  '0108000046004d002d0030003000310000000000000000000000000000000000' +
    '0000000000000000000000000000000000000000000000000000000000000000';
const FIVETONE_0 =
  '00000e46123456789abcde000000000000000000000000002000200020002000' +
    '2000200020002000000000000000000000000000000000000000000000000000';
const TWOTONE_0 =
  '910c412400000000000000000000000000000000000000000000000000000000';
const GPSROAM_0 =
  '00ff000000000000000000000000000000000000000000000000000000000000';
const GPSROAM_1 =
  '00ff000000000000000000000000000000000000000000000000000000000000';
const bytes = (hex: string) =>
  new Uint8Array((hex.match(/../g) ?? []).map((h) => parseInt(h, 16)));
const hex = (b: Uint8Array) =>
  Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
const movedOffsets = (a: Uint8Array, b: Uint8Array) => {
  const out: number[] = [];
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) out.push(i);
  return out;
};

describe('talkgroup encoder', () => {
  for (const [i, rec] of [TALKGROUP_0, TALKGROUP_1].entries()) {
    it(`round-trips vendor record ${i}`, () => {
      const original = bytes(rec);
      const tg = parseTalkgroupQuick(original, i);
      expect(hex(applyTalkgroupToRecord(original, tg))).toBe(hex(original));
    });
  }

  it('writes a changed name only into the name field', () => {
    const original = bytes(TALKGROUP_0);
    const tg = parseTalkgroupQuick(original, 0);
    const moved = movedOffsets(original, applyTalkgroupToRecord(original, { ...tg, name: 'RENAMED' }));
    expect(moved.length).toBeGreaterThan(0);
    for (const o of moved) {
      expect(o, `byte 0x${o.toString(16)} is outside the name field`).toBeGreaterThanOrEqual(0x06);
      expect(o).toBeLessThan(0x26);
    }
  });

  it('preserves the unmodelled bits of the call-type byte', () => {
    // The parser masks byte 0 to two bits. Whatever the other six mean, this
    // driver does not know — so it must not clear them.
    const original = bytes(TALKGROUP_0);
    original[0] = 0xf1;
    const tg = parseTalkgroupQuick(original, 0);
    expect(applyTalkgroupToRecord(original, tg)[0]).toBe(0xf1);
  });
});

describe('broadcast channel encoder', () => {
  it('round-trips the vendor AM record', () => {
    const original = bytes(AM_0);
    const ch = parseBroadcastChannel(original, 0, 'am');
    expect(hex(applyBroadcastToRecord(original, ch, 'am'))).toBe(hex(original));
  });

  it('round-trips the vendor FM record', () => {
    const original = bytes(FM_0);
    const ch = parseBroadcastChannel(original, 0, 'fm');
    expect(hex(applyBroadcastToRecord(original, ch, 'fm'))).toBe(hex(original));
  });

  it('writes a changed frequency only into the frequency field', () => {
    const original = bytes(AM_0);
    const ch = parseBroadcastChannel(original, 0, 'am');
    const moved = movedOffsets(original, applyBroadcastToRecord(original, { ...ch, frequency: 121.5 }, 'am'));
    expect(moved.length).toBeGreaterThan(0);
    for (const o of moved) expect(o).toBeLessThan(4);
  });
});

describe('tone encoders', () => {
  it('round-trips the vendor 5-Tone record', () => {
    const original = bytes(FIVETONE_0);
    const tone = parseFiveTone(original, 0);
    expect(tone, 'fixture should decode to a real entry').not.toBeNull();
    expect(hex(applyFiveToneToRecord(original, tone!))).toBe(hex(original));
  });

  it('round-trips the vendor 2-Tone record', () => {
    const original = bytes(TWOTONE_0);
    const tone = parseTwoTone(original, 0);
    expect(tone, 'fixture should decode to a real entry').not.toBeNull();
    expect(hex(applyTwoToneToRecord(original, tone!))).toBe(hex(original));
  });

  it('rewrites the digit count when a 5-Tone code gets shorter', () => {
    const original = bytes(FIVETONE_0);
    const tone = parseFiveTone(original, 0)!;
    const shorter = applyFiveToneToRecord(original, { ...tone, digits: '1234' });
    expect(shorter[0x02]).toBe(4);
    // Re-parsing must give back exactly what was asked for, not a truncation.
    expect(parseFiveTone(shorter, 0)?.digits).toBe('1234');
  });

  it('refuses a 5-Tone code longer than the record holds', () => {
    const original = bytes(FIVETONE_0);
    const tone = parseFiveTone(original, 0)!;
    expect(() => applyFiveToneToRecord(original, { ...tone, digits: '0'.repeat(200) })).toThrow();
  });
});

describe('GPS roaming encoder', () => {
  it('round-trips vendor records', () => {
    for (const [i, rec] of [GPSROAM_0, GPSROAM_1].entries()) {
      const original = bytes(rec);
      const entry = parseGpsRoamingEntry(original, i);
      // These fixture slots are empty on this radio, which is itself the case
      // worth pinning: an encoder is never asked to invent a vacant record.
      if (entry === null) continue;
      expect(hex(applyGpsRoamingToRecord(original, entry))).toBe(hex(original));
    }
  });

  it('preserves the bytes the vendor never writes', () => {
    // Only 14 of 32 bytes are the vendor's; +0x0A, +0x0B and +0x10..0x1F are
    // not, and a write must hand them back untouched.
    const original = bytes(GPSROAM_0);
    for (let i = 0; i < original.length; i += 1) original[i] = 0x5a;
    const entry = parseGpsRoamingEntry(original, 0)!;
    const out = applyGpsRoamingToRecord(original, entry);
    expect(out[0x0a]).toBe(0x5a);
    expect(out[0x0b]).toBe(0x5a);
    for (let i = 0x10; i < 0x20; i += 1) expect(out[i], `byte 0x${i.toString(16)}`).toBe(0x5a);
  });

  it('writes degrees and hemisphere for both axes before the minutes', () => {
    // The layout is NOT grouped per axis the way APRS is. Pin it: an
    // APRS-shaped encoder would put longitude degrees at 0x03.
    const original = new Uint8Array(32);
    const out = applyGpsRoamingToRecord(original, {
      index: 0, enabled: true, zone: 2,
      latitude: { degrees: 51, minutes: 30, minuteFraction: 25, south: false },
      longitude: { degrees: 0, minutes: 7, minuteFraction: 39, west: true },
      radiusMeters: 500,
    });
    expect(out[0x02]).toBe(51);   // LAT_DEG
    expect(out[0x03]).toBe(0);    // LAT_SOUTH
    expect(out[0x04]).toBe(0);    // LON_DEG
    expect(out[0x05]).toBe(1);    // LON_WEST
    expect(out[0x06]).toBe(30);   // LAT_MIN
    expect(out[0x08]).toBe(7);    // LON_MIN
    expect(out[0x0c]).toBe(500 & 0xff);
    expect(out[0x0d]).toBe((500 >> 8) & 0xff);
  });
});

describe('AM zone encoder', () => {
  /**
   * No AM zone appears in the write capture — that codeplug had none — so this
   * builds a record through the parser's own rules and round-trips it. Weaker
   * evidence than a vendor byte, and said so rather than implied.
   */
  const build = (name: string, members: number[]) => {
    const rec = new Uint8Array(D890_AM_ZONES.STRIDE).fill(0x00);
    for (let i = 0; i < name.length; i += 1) {
      rec[i * 2] = name.charCodeAt(i) & 0xff;
      rec[i * 2 + 1] = name.charCodeAt(i) >> 8;
    }
    let at = D890_AM_ZONES.MEMBERS_AT;
    for (const m of members) { rec[at] = m & 0xff; rec[at + 1] = m >> 8; at += 2; }
    rec[at] = 0xff; rec[at + 1] = 0xff;
    return rec;
  };

  it('round-trips a zone with members', () => {
    const original = build('AIRPORT', [0, 1, 2]);
    const zone = parseAmZone(original, 0)!;
    expect(zone.members).toEqual([0, 1, 2]);
    expect(hex(applyAmZoneToRecord(original, zone))).toBe(hex(original));
  });

  it('terminates a shortened member list so the old tail is not read back', () => {
    // The list is terminated, not counted. Dropping a member without writing
    // the terminator leaves the radio reading members that were removed.
    const original = build('AIRPORT', [0, 1, 2]);
    const zone = parseAmZone(original, 0)!;
    const shortened = applyAmZoneToRecord(original, { ...zone, members: [0] });
    expect(parseAmZone(shortened, 0)?.members).toEqual([0]);
  });

  it('refuses more members than the record holds', () => {
    const original = build('FULL', [0]);
    const zone = parseAmZone(original, 0)!;
    const tooMany = Array.from({ length: 200 }, (_, i) => i);
    expect(() => applyAmZoneToRecord(original, { ...zone, members: tooMany })).toThrow();
  });
});
