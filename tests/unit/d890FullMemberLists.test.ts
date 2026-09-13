/**
 * A FULL list must still be writable.
 *
 * The member encoders reserved one slot for the 0xFFFF terminator and refused
 * anything that filled the array, so a scan list holding 50 channels — read off
 * a radio that plainly holds 50 — could not be written back. And because a
 * D890 write carries the WHOLE codeplug, one full list made the whole radio
 * unwritable: read it, change a channel name, and the write refuses.
 *
 * The array bound is what ends a full list, and for scan lists that bound is
 * hardware-confirmed (2026-08-25): members run 0x30..0x93, exactly 50 u16
 * entries, and 0x94 is `revertChannel`, reading as zero rather than the 0xffff
 * padding that fills the rest of the array. So a terminator at member 50 would
 * corrupt a real field — which is the other half of what these tests pin.
 */

import { describe, it, expect } from 'vitest';
import { applyScanListToRecord, applyAmZoneToRecord } from '../../src/radios/d890uv/tableWrite';
import { parseScanList } from '../../src/radios/d890uv/structures';
import { D890_ADDR, D890_LIMITS } from '../../src/radios/d890uv/constants';
import { D890_AM_ZONES, parseAmZone } from '../../src/radios/d890uv/amZones';

const MEMBERS_AT = 0x30;
const REVERT_AT = 0x94;
const AM_CAPACITY = (D890_AM_ZONES.MEMBERS_END - D890_AM_ZONES.MEMBERS_AT) >> 1;

/** A scan list record with `count` members, the way a radio holds one. */
function scanList(count: number) {
  return {
    slot: 0,
    name: 'FULL',
    channels: Array.from({ length: count }, (_, i) => i + 1),
    prioritySelect: 0, priorityChannel1Raw: 0, priorityChannel2Raw: 0,
    lookBackTimeA: 5, lookBackTimeB: 20, dropoutDelay: 31, dwellTime: 32,
    revertChannel: 4, scanMode: 0, digitalGroupHold: 1, digitalPriorityHold: 2, analogHold: 3,
  } as Parameters<typeof applyScanListToRecord>[1];
}

const blank = () => new Uint8Array(D890_ADDR.SCAN_LIST_STRIDE);
const u16At = (b: Uint8Array, at: number) => b[at]! | (b[at + 1]! << 8);

describe('a scan list filled to capacity', () => {
  it('writes all 50 members', () => {
    const rec = applyScanListToRecord(blank(), scanList(50));
    expect(u16At(rec, MEMBERS_AT)).toBe(0);            // channel 1 → index 0
    expect(u16At(rec, MEMBERS_AT + 49 * 2)).toBe(49);  // the 50th, at 0x92
  });

  it('does NOT put a terminator on revertChannel', () => {
    // The regression in one assertion: a sentinel at member 50 lands on 0x94.
    const rec = applyScanListToRecord(blank(), scanList(50));
    expect(rec[REVERT_AT]).toBe(4);
    expect(rec[REVERT_AT]).not.toBe(0xff);
  });

  it('round-trips: what we write decodes back to the same 50 channels', () => {
    const rec = applyScanListToRecord(blank(), scanList(50));
    const back = parseScanList(rec, 0);
    expect(back.channels).toHaveLength(50);
    expect(back.channels[49]).toBe(50);
    expect(back.revertChannel).toBe(4);
  });

  it('still terminates a list with room to spare', () => {
    const rec = applyScanListToRecord(blank(), scanList(49));
    expect(u16At(rec, MEMBERS_AT + 49 * 2)).toBe(0xffff);
    expect(parseScanList(rec, 0).channels).toHaveLength(49);
  });

  it('refuses more than the array can hold', () => {
    expect(() => applyScanListToRecord(blank(), scanList(51))).toThrow(/do not fit/);
  });
});

describe('an AM zone filled to capacity', () => {
  const zone = (count: number) => ({
    index: 0, name: 'FULL', currentChannel: 0,
    members: Array.from({ length: count }, (_, i) => i),
  });

  it('writes every member without spilling past MEMBERS_END', () => {
    const rec = applyAmZoneToRecord(new Uint8Array(D890_AM_ZONES.STRIDE), zone(AM_CAPACITY));
    expect(u16At(rec, D890_AM_ZONES.MEMBERS_AT + (AM_CAPACITY - 1) * 2)).toBe(AM_CAPACITY - 1);
    // 0x62 belongs to something the radio uses and we do not model.
    expect(rec[D890_AM_ZONES.MEMBERS_END]).toBe(0);
    expect(parseAmZone(rec, 0).members).toHaveLength(AM_CAPACITY);
  });

  it('refuses one more than that', () => {
    expect(() => applyAmZoneToRecord(new Uint8Array(D890_AM_ZONES.STRIDE), zone(AM_CAPACITY + 1)))
      .toThrow(/members/);
  });
});

describe('the limits these bounds come from', () => {
  it('scan list capacity is the hardware-confirmed 50', () => {
    expect(D890_LIMITS.SCAN_LIST_MEMBERS_MAX).toBe(50);
    expect((REVERT_AT - MEMBERS_AT) / 2).toBe(D890_LIMITS.SCAN_LIST_MEMBERS_MAX);
  });
});
