import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  parseRoamingChannel,
  parseRoamingZone,
  roamingChannelAddress,
  roamingZoneAddress,
  decodeOccupancyBitmap,
  occupiedIndices,
} from '../../src/radios/d890uv/structures';
import { D890_ADDR, D890_LIMITS } from '../../src/radios/d890uv/constants';

/**
 * Real bytes, read off a DA-7X2 on 2026-08-30 through the Diagnostics region
 * dump, at addresses the reverse-engineering bundle named but could not resolve
 * — the settings marshaller reaches them through stores whose address is
 * parametric over a runtime-sized array, so no static trace could emit them.
 *
 * Every expectation below is cross-checked against the vendor CPS's own CSV
 * export of the same codeplug, so this compares NeonPlug's decode against the
 * manufacturer's decode of identical bytes rather than against itself.
 */
const DIR = join(__dirname, '../fixtures/d890uv');
const load = (f: string) => new Uint8Array(readFileSync(join(DIR, f)));

describe('DA-7X2 roaming channels', () => {
  const record = load('roaming-channel-0.bin');

  it('decodes the record the vendor exported as "Roaming CH 1"', () => {
    // RoamingChannel.CSV row 1: 410.21250 / 418.21250 / No Use / No Use.
    const ch = parseRoamingChannel(record, 0);
    expect(ch.name).toBe('Roaming CH 1');
    expect(ch.rxFrequency).toBeCloseTo(410.2125, 4);
    expect(ch.txFrequency).toBeCloseTo(418.2125, 4);
  });

  it('reports "No Use" as null rather than clamping it to a real value', () => {
    // The record holds 0x10 in a 0-15 colour-code field and 0x02 in a 0-1 slot
    // field. Those are not colour code 16 and slot 2 — they are the absence of a
    // setting, and the CPS renders both as "No Use". Clamping would invent a
    // colour code the user never chose.
    const ch = parseRoamingChannel(record, 0);
    expect(record[0x08]).toBe(0x10);
    expect(record[0x09]).toBe(0x02);
    expect(ch.colorCode).toBeNull();
    expect(ch.slot).toBeNull();
  });

  it('still decodes a record that does set them', () => {
    const set = Uint8Array.from(record);
    set[0x08] = 7;
    set[0x09] = 1;
    const ch = parseRoamingChannel(set, 0);
    expect(ch.colorCode).toBe(7);
    expect(ch.slot).toBe(1);
  });

  it('addresses records 0x40 apart', () => {
    expect(roamingChannelAddress(0)).toBe(D890_ADDR.ROAMING_CHANNEL_DATA);
    expect(roamingChannelAddress(3) - roamingChannelAddress(2)).toBe(
      D890_ADDR.ROAMING_CHANNEL_STRIDE,
    );
  });

  it('reads the presence bitmap the same way as every other record type', () => {
    // 0x0F against a codeplug holding exactly four roaming channels. This is the
    // channel-presence bitmap, NOT the per-zone roam bitmap at 0x4c00000 — a
    // different structure with a different meaning.
    const set = load('roaming-channel-set.bin');
    expect(set[0]).toBe(0x0f);
    const present = occupiedIndices(
      decodeOccupancyBitmap(set, D890_LIMITS.ROAMING_CHANNELS_MAX),
    );
    expect(present).toEqual([0, 1, 2, 3]);
  });
});

describe('DA-7X2 roaming zones', () => {
  const record = load('roaming-zone-0.bin');

  it('decodes members and name from one 0x80 record', () => {
    const zone = parseRoamingZone(record, 0);
    expect(zone.name).toBe('ROAM ZONE 1');
    // Members index the ROAMING-channel table, not the main channel list, and
    // they are one byte each — a different width and target from every other
    // membership array on this radio.
    expect(zone.members).toEqual([0, 1, 2, 3]);
  });

  it('stops at the 0xff terminator rather than reading the whole array', () => {
    expect(record[4]).toBe(0xff);
    const padded = Uint8Array.from(record);
    padded[2] = 0xff; // terminate early
    expect(parseRoamingZone(padded, 0).members).toEqual([0, 1]);
  });

  it('puts the name at +0x40, clear of the member array', () => {
    expect(D890_ADDR.ROAMING_ZONE_NAME_OFFSET).toBe(0x40);
    expect(D890_ADDR.ROAMING_ZONE_MEMBERS_LEN).toBeLessThanOrEqual(
      D890_ADDR.ROAMING_ZONE_NAME_OFFSET,
    );
    expect(roamingZoneAddress(1) - roamingZoneAddress(0)).toBe(
      D890_ADDR.ROAMING_ZONE_STRIDE,
    );
  });
});
