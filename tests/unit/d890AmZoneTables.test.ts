import { describe, it, expect } from 'vitest';
import {
  applyAmZoneTables,
  encodeAmZoneAChannels,
  encodeAmZoneScan,
  D890_AM_ZONES,
} from '../../src/radios/d890uv/amZones';
import type { D890AmZone } from '../../src/radios/d890uv/amZones';

/**
 * A Channel and the AM scan bitmaps — both index by MEMBER POSITION.
 *
 * Found on hardware 2026-09-03 in the vendor CPS's own write frames, at two
 * addresses this driver had dismissed as erased flash. They were erased only
 * because NeonPlug never wrote them: on a radio the CPS had touched, the A
 * Channel table held `05 00 06 00 0f 00` for zones of 6/7/16 members whose A
 * Channel was the last entry, and the scan table held `3f/7f/ffff` — exactly
 * 6, 7 and 16 bits set.
 */
const zone = (index: number, members: number[]): D890AmZone =>
  ({ index, name: `Z${index}`, members, currentChannel: members[0] ?? 0 });

const u16le = (...v: number[]) => {
  const b = new Uint8Array(0x10);
  v.forEach((x, i) => { b[i * 2] = x & 0xff; b[i * 2 + 1] = (x >> 8) & 0xff; });
  return b;
};
const u32le = (...v: number[]) => {
  const b = new Uint8Array(0x10);
  v.forEach((x, i) => {
    b[i * 4] = x & 0xff; b[i * 4 + 1] = (x >>> 8) & 0xff;
    b[i * 4 + 2] = (x >>> 16) & 0xff; b[i * 4 + 3] = (x >>> 24) & 0xff;
  });
  return b;
};

describe('AM zone A Channel and scan tables', () => {
  // The exact shape read off hardware: 6, 7 and 16 members.
  const zones = [
    zone(0, [0, 1, 2, 3, 4, 5]),
    zone(1, [6, 7, 8, 9, 10, 11, 12]),
    zone(2, Array.from({ length: 16 }, (_, i) => 13 + i)),
  ];

  it('decodes the captured hardware bytes', () => {
    const out = applyAmZoneTables(zones, u16le(5, 6, 15), u32le(0x3f, 0x7f, 0xffff));
    expect(out.map((z) => z.aChannel)).toEqual([5, 6, 15]);
    // Every member scanned — which is what 6, 7 and 16 bits set means.
    expect(out.map((z) => z.scan?.filter(Boolean).length)).toEqual([6, 7, 16]);
    expect(out[0]!.scan).toHaveLength(6);
  });

  it('resolves A Channel through members, not as an AM index', () => {
    // Position 6 in zone 1 is AM channel 12 — reading it as an index would
    // give channel 6, which is a different station in a different zone.
    const out = applyAmZoneTables(zones, u16le(5, 6, 15), undefined);
    const z = out[1]!;
    expect(z.members[z.aChannel!]).toBe(12);
    expect(z.aChannel).not.toBe(12);
  });

  it('drops an A Channel past the end rather than clamping', () => {
    // Tables disagreeing with records is a fault worth seeing, not smoothing.
    const out = applyAmZoneTables(zones, u16le(99, 0, 0), undefined);
    expect(out[0]!.aChannel).toBeUndefined();
  });

  it('round-trips both tables', () => {
    const decoded = applyAmZoneTables(zones, u16le(5, 6, 15), u32le(0x3f, 0x7f, 0xffff));
    expect(Array.from(encodeAmZoneAChannels(u16le(5, 6, 15), decoded)))
      .toEqual(Array.from(u16le(5, 6, 15)));
    expect(Array.from(encodeAmZoneScan(u32le(0x3f, 0x7f, 0xffff), decoded)))
      .toEqual(Array.from(u32le(0x3f, 0x7f, 0xffff)));
  });

  it('never sets a scan bit above the member count', () => {
    // A bit past the end would claim a member the zone does not have.
    const decoded = applyAmZoneTables(zones, undefined, u32le(0xffffffff, 0, 0));
    const out = encodeAmZoneScan(new Uint8Array(0x10), decoded);
    const bits = (out[0]! | (out[1]! << 8) | (out[2]! << 16) | (out[3]! << 24)) >>> 0;
    expect(bits).toBe(0x3f);
  });

  it('patches, leaving slots for zones this write does not carry', () => {
    const original = u16le(1, 2, 3, 4, 5, 6, 7, 8);
    const out = encodeAmZoneAChannels(original, [{ ...zones[0]!, aChannel: 5 }]);
    expect(out[0]).toBe(5);
    // slots 1..7 untouched
    expect(Array.from(out.subarray(2, 16))).toEqual(Array.from(original.subarray(2, 16)));
  });

  it('the two tables are at different addresses with different strides', () => {
    expect(D890_AM_ZONES.A_CHANNEL_TABLE).not.toBe(D890_AM_ZONES.SCAN_TABLE);
    expect(D890_AM_ZONES.A_CHANNEL_STRIDE).toBe(2);
    expect(D890_AM_ZONES.SCAN_STRIDE).toBe(4);
  });
});
