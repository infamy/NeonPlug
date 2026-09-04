import { describe, it, expect } from 'vitest';
import {
  blankBroadcastChannel,
  blankZoneMembers,
  blankZoneName,
  blankAmZone,
} from '../../src/radios/d890uv/blankRecords';
import { D890_MASKED_TABLES, applyBroadcastToRecord } from '../../src/radios/d890uv/tableWrite';
import { planMaskedTableWrite, D890WriteRefusedError } from '../../src/radios/d890uv/writePlan';
import { D890_BROADCAST } from '../../src/radios/d890uv/broadcastChannels';
import { D890_ADDR, D890_LIMITS } from '../../src/radios/d890uv/constants';
import { D890_AM_ZONES } from '../../src/radios/d890uv/amZones';

/**
 * Adding a record the radio has never held.
 *
 * Encoders patch, which serves an edit and cannot serve an ADD: the read is
 * mask-first, so an unoccupied slot is never fetched and there is no original.
 * These baselines come from the vendor's own write capture, and the fill byte
 * is deliberately NOT the same for every table.
 */
describe('blank record templates', () => {
  it('AM and FM channels are zero-filled at the full stride', () => {
    // Vendor AM slot 0: `10 80 00 00 | name UTF-16LE | 00 … 00` to 0x3f.
    for (const band of ['am', 'fm'] as const) {
      const blank = blankBroadcastChannel(band);
      expect(blank.length).toBe(D890_BROADCAST[band].stride);
      expect(blank.every((b) => b === 0x00)).toBe(true);
    }
  });

  it('zone membership is 0xFF-filled, NOT zero-filled', () => {
    // The distinction matters: a zero fill is a list of channel index 0 repeated
    // to the end of the record, sitting behind the terminator.
    const blank = blankZoneMembers();
    expect(blank.length).toBe(D890_ADDR.ZONE_CHANNELS_STRIDE);
    expect(blank.every((b) => b === 0xff)).toBe(true);
  });

  it('zone name is the vendor WRITE width, not the record stride', () => {
    // The vendor sends only the first 0x20 of the 0x40 record and never touches
    // 0x20-0x3f, so an added zone must not either.
    const blank = blankZoneName();
    expect(blank.length).toBe(D890_LIMITS.NAME_MAX_CHARS * 2);
    expect(blank.length).toBeLessThan(D890_ADDR.ZONE_NAME_STRIDE);
    expect(blank.every((b) => b === 0x00)).toBe(true);
  });

  it('AM zone carries an explicit member terminator', () => {
    // Neither an all-0x00 nor an all-0xFF fill is right here: the name and
    // current-channel fields are zero-based while members are 0xFFFF-terminated.
    const blank = blankAmZone();
    expect(blank.length).toBe(D890_AM_ZONES.STRIDE);
    expect(blank[D890_AM_ZONES.MEMBERS_AT]).toBe(0xff);
    expect(blank[D890_AM_ZONES.MEMBERS_AT + 1]).toBe(0xff);
    expect(blank.subarray(0, D890_AM_ZONES.NAME_BYTES).every((b) => b === 0)).toBe(true);
  });
});

describe('adding a record to a slot the radio never held', () => {
  const mask = () => new Uint8Array(0x20);

  it('plans a NEW AM channel from the blank', () => {
    const plan = planMaskedTableWrite(D890_MASKED_TABLES.amChannels, {
      entries: [{ index: 3, name: 'NEW', frequency: 118.5 }],
      originals: new Map(),          // slot 3 was never read — this is an ADD
      originalMask: mask(),
      encode: (o, e) => applyBroadcastToRecord(o, e, 'am'),
    });
    expect(plan.written).toEqual([3]);
    const at = D890_BROADCAST.am.data + 3 * D890_BROADCAST.am.stride;
    expect(plan.frames.filter((f) => f.address >= at).length).toBeGreaterThan(0);
  });

  it('sets the presence bit for the added slot', () => {
    const plan = planMaskedTableWrite(D890_MASKED_TABLES.amChannels, {
      entries: [{ index: 3, name: 'NEW', frequency: 118.5 }],
      originals: new Map(),
      originalMask: mask(),
      encode: (o, e) => applyBroadcastToRecord(o, e, 'am'),
    });
    const maskFrame = plan.frames.find((f) => f.address === D890_BROADCAST.am.mask)!;
    expect((maskFrame.data[0]! >> 3) & 1, 'bit 3 set').toBe(1);
  });

  it('still REFUSES a table with no known blank', () => {
    // Talkgroups have no `blank`, so an add there is refused rather than guessed
    // — the same protection the main channel record relies on.
    expect(D890_MASKED_TABLES.talkgroups).not.toHaveProperty('blank');
    expect(() =>
      planMaskedTableWrite(D890_MASKED_TABLES.talkgroups, {
        entries: [{ index: 5, name: 'X', contactNumber: 1, callType: 0 } as never],
        originals: new Map(),
        originalMask: mask(),
        encode: (() => new Uint8Array(D890_MASKED_TABLES.talkgroups.stride)) as never,
      })
    ).toThrow(D890WriteRefusedError);
  });
});
