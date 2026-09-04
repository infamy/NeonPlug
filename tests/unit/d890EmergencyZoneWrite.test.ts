import { describe, it, expect } from 'vitest';
import {
  parseEmergencySettings,
  parseEmergencyContact,
  D890_EMERGENCY_UNWRITTEN,
} from '../../src/radios/d890uv/emergency';
import { parseBroadcastChannel, D890_BROADCAST } from '../../src/radios/d890uv/broadcastChannels';
import {
  applyEmergencySettings,
  applyEmergencyContact,
  applyZoneCurrentChannels,
  applyZoneHiddenMask,
  applyBroadcastToRecord,
} from '../../src/radios/d890uv/tableWrite';
import { D890_LIMITS } from '../../src/radios/d890uv/constants';

/**
 * Emergency, the per-zone A/B arrays, the zone hidden mask and the FM VFO —
 * all verbatim from the vendor CPS's programming session.
 */
const EMERGENCY_SETTINGS =
  '0100123456780000000000000000000000000000000000000000000000000000' +
    '00000000000000000000000000000000';
const EMERGENCY_CONTACT =
  '0002000a0a3c00000101000a0a3c370001010909000100000000000000000000' +
    '00000000000000000000000000000000';
const ZONE_A =
  '0000000000000000000000000000000000000000000000000000000000000000' +
    '0000000000000000000000000000000000000000000000000000000000000000' +
    '0000000000000000000000000000000000000000000000000000000000000000' +
    '0000000000000000000000000000000000000000000000000000000000000000' +
    '0000000000000000000000000000000000000000000000000000000000000000' +
    '0000000000000000000000000000000000000000000000000000000000000000' +
    '0000000000000000000000000000000000000000000000000000000000000000' +
    '0000000000000000000000000000000000000000000000000000000000000000' +
    '0000000000000000000000000000000000000000000000000000000000000000' +
    '0000000000000000000000000000000000000000000000000000000000000000' +
    '0000000000000000000000000000000000000000000000000000000000000000' +
    '0000000000000000000000000000000000000000000000000000000000000000' +
    '0000000000000000000000000000000000000000000000000000000000000000' +
    '0000000000000000000000000000000000000000000000000000000000000000' +
    '0000000000000000000000000000000000000000000000000000000000000000' +
    '0000000000000000000000000000000000000000000000000000000000000000';
const ZONE_B =
  '00000100080005000c001d000f00050005000500050005000500050005000500' +
    '0500050005000500050005000500050005000500050005000500050005000500' +
    '0500050005000500050005000500050005000500050005000500050005000500' +
    '0500050005000500050005000500050005000500050005000500050005000500' +
    '0500050005000500050005000500050005000500050005000500050005000500' +
    '0500050005000500050005000500050005000500050005000500050005000500' +
    '0500050005000500050005000500050005000500050005000500050005000500' +
    '0500050005000500050005000500050005000500050005000500050005000500' +
    '0500050005000500050005000500050005000500050005000500050005000500' +
    '0500050005000500050005000500050005000500050005000500050005000500' +
    '0500050005000500050005000500050005000500050005000500050005000500' +
    '0500050005000500050005000500050005000500050005000500050005000500' +
    '0500050005000500050005000500050005000500050005000500050005000500' +
    '0500050005000500050005000500050005000500050005000500050005000500' +
    '0500050005000500050005000500050005000500050005000500050005000500' +
    '0500050005000500050005000500050005000500000000000000000000000000';
const ZONE_HIDDEN =
  '0000000000000000000000000000000000000000000000000000000000000000';
const FM_VFO =
  '01080000560046004f0000000000000000000000000000000000000000000000' +
    '0000000000000000000000000000000000000000000000000000000000000000';
const bytes = (hex: string) =>
  new Uint8Array((hex.match(/../g) ?? []).map((h) => parseInt(h, 16)));
const hex = (b: Uint8Array) =>
  Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

describe('emergency encoders', () => {
  it('round-trips the vendor settings record', () => {
    const original = bytes(EMERGENCY_SETTINGS);
    const settings = parseEmergencySettings(original)!;
    expect(settings).not.toBeNull();
    expect(hex(applyEmergencySettings(original, settings))).toBe(hex(original));
  });

  it('preserves every byte the vendor writer never touches', () => {
    // +0x16 is skipped outright, +0x17 is read but never written, and
    // +0x18..+0x20 come from CPS globals with no references anywhere in the
    // binary. What the RADIO puts there is unknown, so it must survive.
    const marked = new Uint8Array(0x30).fill(0x5a);
    const settings = parseEmergencySettings(bytes(EMERGENCY_SETTINGS))!;
    const out = applyEmergencySettings(marked, settings);
    for (const offset of D890_EMERGENCY_UNWRITTEN) {
      expect(out[offset], `byte 0x${offset.toString(16)} was written`).toBe(0x5a);
    }
  });

  it('round-trips the vendor contact record', () => {
    const original = bytes(EMERGENCY_CONTACT);
    const contact = parseEmergencyContact(original)!;
    expect(hex(applyEmergencyContact(original, contact))).toBe(hex(original));
  });

  it('keeps the high nibble of the ring byte, which is not ours', () => {
    const original = bytes(EMERGENCY_CONTACT);
    original[0x01] = 0xa5;
    const contact = parseEmergencyContact(original)!;
    expect(contact.ring).toBe(0x05);
    expect(applyEmergencyContact(original, contact)[0x01]).toBe(0xa5);
  });

  it('leaves an undecodable BCD code exactly as found', () => {
    // A non-decimal nibble parses as null. Replacing that with zeros would
    // invent a contact code of 0.
    const original = bytes(EMERGENCY_CONTACT);
    original.set([0xff, 0xff, 0xff, 0xff], 0x02);
    const contact = parseEmergencyContact(original)!;
    expect(contact.code).toBeNull();
    const out = applyEmergencyContact(original, contact);
    expect(Array.from(out.subarray(0x02, 0x06))).toEqual([0xff, 0xff, 0xff, 0xff]);
  });
});

describe('per-zone current channel arrays', () => {
  it('round-trips both vendor arrays', () => {
    for (const [label, fixture] of [['A', ZONE_A], ['B', ZONE_B]] as const) {
      const original = bytes(fixture);
      const bySlot = new Map<number, number>();
      for (let z = 0; z < D890_LIMITS.ZONES_MAX; z += 1) {
        bySlot.set(z, (original[z * 2] ?? 0) | ((original[z * 2 + 1] ?? 0) << 8));
      }
      expect(hex(applyZoneCurrentChannels(original, bySlot)), `zone ${label}`)
        .toBe(hex(original));
    }
  });

  it('is indexed by hardware SLOT, not by position in the zones array', () => {
    // Empty slots are dropped when zones are read, so the two diverge as soon
    // as a zone in the middle is empty. Writing by array position would move
    // every later zone's A/B channel.
    const original = bytes(ZONE_A);
    const out = applyZoneCurrentChannels(original, new Map([[7, 3]]));
    expect([out[14], out[15]]).toEqual([3, 0]);
  });

  it('leaves slots the caller did not mention exactly as the radio had them', () => {
    // The array form could not express this: "slot 3 is absent" and "slot 3 is
    // zero" were the same value, so every unmentioned zone had its current
    // channel zeroed. Patch, never rebuild.
    const original = bytes(ZONE_A);
    const out = applyZoneCurrentChannels(original, new Map([[7, 3]]));
    for (let z = 0; z < D890_LIMITS.ZONES_MAX; z += 1) {
      if (z === 7) continue;
      expect([out[z * 2], out[z * 2 + 1]], `slot ${z}`)
        .toEqual([original[z * 2], original[z * 2 + 1]]);
    }
  });
});

describe('zone hidden mask', () => {
  it('round-trips the vendor mask', () => {
    const original = bytes(ZONE_HIDDEN);
    expect(hex(applyZoneHiddenMask(original, new Set()))).toBe(hex(original));
  });

  it('sets bit 0 for zone slot 0 — proven on hardware', () => {
    // With one zone hidden from the radio's own menu, 0x3482c20 read 01 and the
    // owner confirmed it was zone 1. SET = HIDDEN, bit 0 = zone 1, LSB first.
    const out = applyZoneHiddenMask(bytes(ZONE_HIDDEN), new Set([0]));
    expect(out[0]).toBe(0x01);
  });

  it('clears a zone that is no longer hidden', () => {
    const original = bytes(ZONE_HIDDEN);
    original[0] = 0x03;
    expect(applyZoneHiddenMask(original, new Set([1]))[0]).toBe(0x02);
  });

  it('leaves bits above the zone count alone', () => {
    const original = new Uint8Array(0x20).fill(0xff);
    const out = applyZoneHiddenMask(original, new Set());
    // 250 zones -> bits 0..249, i.e. through byte 31 bit 1. Byte 31's high bits
    // are past the table and must survive.
    expect(out[31] & 0xfc).toBe(0xfc);
  });
});

describe('FM VFO', () => {
  it('round-trips through the same encoder as a numbered FM channel', () => {
    // The VFO is the 101st FM memory — same 64-byte record shape, just outside
    // the numbered table and with no mask bit.
    const original = bytes(FM_VFO).subarray(0, D890_BROADCAST.fm.stride);
    const ch = parseBroadcastChannel(original, 0, 'fm');
    expect(hex(applyBroadcastToRecord(original, ch, 'fm'))).toBe(hex(original));
  });
});
