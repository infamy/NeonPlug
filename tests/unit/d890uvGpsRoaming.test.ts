import { describe, it, expect } from 'vitest';
import {
  D890_GPS_ROAMING,
  parseGpsRoamingEntry,
  parseGpsRoamingTable,
  gpsRoamingAddress,
  gpsRoamingPositionToDecimal,
} from '../../src/radios/d890uv/gpsRoaming';

/** A record built to the layout the marshaller emits. */
const rec = (over: Partial<Record<number, number>> = {}) => {
  const b = new Uint8Array(0x20);
  b[0x00] = 1;    // OnOff
  b[0x01] = 3;    // Zone
  b[0x02] = 34;   // Lat degrees
  b[0x03] = 0;    // North
  b[0x04] = 108;  // Lon degrees
  b[0x05] = 0;    // East
  b[0x06] = 12;   // Lat minutes
  b[0x07] = 73;   // Lat hundredths
  b[0x08] = 50;   // Lon minutes
  b[0x09] = 0;    // Lon hundredths
  b[0x0c] = 0xe8; b[0x0d] = 0x03; // radius 1000, u32 LE
  for (const [k, v] of Object.entries(over)) b[Number(k)] = v as number;
  return b;
};

describe('DA-7X2 GPS Roaming table', () => {
  it('has the geometry the marshaller bounds it with', () => {
    // 32 entries from `cmp ebx, 0x20` at fourteen sites, stride 0x20 — and the
    // CPS's own GPSRoaming.CSV has exactly 32 rows.
    expect(D890_GPS_ROAMING.ENTRIES).toBe(32);
    expect(D890_GPS_ROAMING.STRIDE).toBe(0x20);
    expect(D890_GPS_ROAMING.TABLE_BYTES).toBe(1024);
    expect(D890_GPS_ROAMING.TABLE_BYTES / 0x10).toBe(64); // 64 write frames
    expect(gpsRoamingAddress(0)).toBe(0x3502000);
    expect(gpsRoamingAddress(31)).toBe(0x3502000 + 31 * 0x20);
  });

  it('reads radius as a 4-byte value, not a byte', () => {
    // VERIFIED by four __vbaUI1I4 (Long -> byte) conversions against exactly four
    // stores at +0x0C..+0x0F. A one-byte read would cap a geofence at 255 m.
    expect(parseGpsRoamingEntry(rec(), 0)!.radiusMeters).toBe(1000);
    const big = rec({ 0x0c: 0x40, 0x0d: 0x0d, 0x0e: 0x03, 0x0f: 0x00 });
    expect(parseGpsRoamingEntry(big, 0)!.radiusMeters).toBe(200000);
  });

  it('does NOT group position per axis the way APRS does', () => {
    // The trap: APRS at 0x3501000 stores a whole position contiguously. Here the
    // degrees and hemispheres of BOTH axes come first, then both sets of minutes.
    // An APRS-shaped parser would read longitude degrees (108) as a latitude
    // minute — a plausible-looking number in a wrong field.
    const e = parseGpsRoamingEntry(rec(), 0)!;
    expect(e.latitude).toEqual({ degrees: 34, minutes: 12, minuteFraction: 73, south: false });
    expect(e.longitude).toEqual({ degrees: 108, minutes: 50, minuteFraction: 0, west: false });
    // byte 0x04 is longitude degrees, NOT a latitude minute
    expect(rec()[0x04]).toBe(108);
  });

  it('converts to decimal degrees with hemisphere sign', () => {
    const e = parseGpsRoamingEntry(rec({ 0x03: 1, 0x05: 1 }), 0)!;
    expect(gpsRoamingPositionToDecimal(e.latitude)).toBeCloseTo(-(34 + 12.73 / 60), 6);
    expect(gpsRoamingPositionToDecimal(e.longitude)).toBeCloseTo(-(108 + 50 / 60), 6);
  });

  it('treats an erased slot as absent, not a geofence at 255 degrees', () => {
    // Fourth region on this radio where unused means 0xFF rather than zero.
    expect(parseGpsRoamingEntry(new Uint8Array(0x20).fill(0xff), 0)).toBeNull();
    expect(parseGpsRoamingEntry(new Uint8Array(0x20), 0)).toBeNull();
  });

  it('drops unused slots when decoding the whole table', () => {
    const table = new Uint8Array(D890_GPS_ROAMING.TABLE_BYTES).fill(0xff);
    table.set(rec(), 0);
    table.set(rec({ 0x01: 7 }), 5 * 0x20);
    const parsed = parseGpsRoamingTable(table);
    expect(parsed).toHaveLength(2);
    expect(parsed.map((e) => e.index)).toEqual([0, 5]);
    expect(parsed[1].zone).toBe(7);
  });
});
