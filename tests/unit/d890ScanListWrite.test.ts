import { describe, it, expect } from 'vitest';
import { parseScanList } from '../../src/radios/d890uv/structures';
import { applyScanListToRecord } from '../../src/radios/d890uv/tableWrite';

/**
 * Scan lists from the vendor CPS's programming session.
 *
 * Scan lists are where this radio's layout has bitten hardest — the member
 * array starts at +0x30 rather than 0, and the four trailing settings are at
 * +0x94, not the 0xf8 an earlier map claimed (0xf8 sits in the zero fill and
 * read 0 on every list ever captured). Both are pinned here.
 */
const SCAN_LIST_0 =
  '00030100800005001a001f00200053004c00200041006c007000680061000000' +
    '0000000000000000000000000000000083007f007b0037001500080001000000' +
    'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' +
    'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' +
    'ffffffffffffffffffffffffffffffffffffffff000000000000000000000000' +
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
const SCAN_LIST_1 =
  '00013c00ffff14001f002500260053004c00200042007200610076006f000000' +
    '0000000000000000000000000000000040003f003e003d003c003b00ffffffff' +
    'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' +
    'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' +
    'ffffffffffffffffffffffffffffffffffffffff000000000000000000000000' +
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
const bytes = (hex: string) =>
  new Uint8Array((hex.match(/../g) ?? []).map((h) => parseInt(h, 16)));
const hex = (b: Uint8Array) =>
  Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

describe('scan list encoder', () => {
  it('round-trips vendor records', () => {
    for (const [i, rec] of [SCAN_LIST_0, SCAN_LIST_1].entries()) {
      const original = bytes(rec);
      const list = parseScanList(original, i);
      expect(hex(applyScanListToRecord(original, list)), `scan list ${i}`).toBe(hex(original));
    }
  });

  it('reads the members the radio actually holds', () => {
    // 83 00 7f 00 7b 00 ... little-endian, 0-based, +1 on the way out.
    const list = parseScanList(bytes(SCAN_LIST_0), 0);
    expect(list.channels.slice(0, 3)).toEqual([0x84, 0x80, 0x7c]);
  });

  it('writes members from +0x30, not from the start of the record', () => {
    const original = bytes(SCAN_LIST_0);
    const list = parseScanList(original, 0);
    const out = applyScanListToRecord(original, { ...list, channels: [1, 2] });
    // Channel 1 is wire index 0, at 0x30.
    expect([out[0x30], out[0x31], out[0x32], out[0x33]]).toEqual([0, 0, 1, 0]);
    expect([out[0x34], out[0x35]]).toEqual([0xff, 0xff]);
    // And the header before it is untouched.
    expect(out.subarray(0, 0x30)).toEqual(original.subarray(0, 0x30));
  });

  it('writes the trailing settings at 0x94, not 0xf8', () => {
    const original = bytes(SCAN_LIST_0);
    const list = parseScanList(original, 0);
    const out = applyScanListToRecord(original, {
      ...list,
      revertChannel: 6,
      digitalGroupHold: 1,
      digitalPriorityHold: 2,
      analogHold: 3,
    });
    expect([out[0x94], out[0x95], out[0x96], out[0x97]]).toEqual([6, 1, 2, 3]);
    expect(out[0xf8], '0xf8 is zero fill, not a settings byte').toBe(original[0xf8]);
  });

  it('keeps priority channels raw', () => {
    // They are Priority Channel 1 and 2 stored directly, and must be list
    // members — but enforcing that is the planner's job, not the encoder's.
    const original = bytes(SCAN_LIST_0);
    const list = parseScanList(original, 0);
    const out = applyScanListToRecord(original, { ...list, priorityChannel1Raw: 0x1234 });
    expect([out[0x02], out[0x03]]).toEqual([0x34, 0x12]);
  });

  it('terminates a shortened member list', () => {
    const original = bytes(SCAN_LIST_0);
    const list = parseScanList(original, 0);
    const out = applyScanListToRecord(original, { ...list, channels: [9] });
    expect(parseScanList(out, 0).channels).toEqual([9]);
  });
});
