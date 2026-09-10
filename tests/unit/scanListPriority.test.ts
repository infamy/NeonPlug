/**
 * The D890 packs a scan-list priority into one u16; the shared `ScanList` wants
 * a (type, channel) pair. Both directions are tested because wiring one alone is
 * a data-loss bug — see the module doc.
 */

import { describe, it, expect } from 'vitest';
import {
  decodeScanPriority,
  encodeScanPriority,
  SCAN_PRIORITY_NONE,
  SCAN_PRIORITY_CURRENT,
  SCAN_PRIORITY_SPECIFIC,
  narrowScanList,
} from '../../src/radios/d890uv/scanListPriority';
import type { ScanListDecoded } from '../../src/radios/d890uv/structures';

describe('decodeScanPriority', () => {
  it('reads 0xffff as Off', () => {
    expect(decodeScanPriority(0xffff)).toEqual({ type: SCAN_PRIORITY_NONE });
  });

  it('reads 0x0000 as Current, NOT as Off', () => {
    // The trap: zero is a live setting on this radio. Treating it as "nothing
    // set" is what makes a blank-built record start priority-scanning.
    expect(decodeScanPriority(0x0000)).toEqual({ type: SCAN_PRIORITY_CURRENT });
  });

  it('reads n>=1 as a specific channel number', () => {
    // Measured 2026-09-10: slot 1 held raw 0x003c, and its member list contains
    // channel 60. 0x3c = 60, so raw IS the channel number.
    expect(decodeScanPriority(0x003c)).toEqual({ type: SCAN_PRIORITY_SPECIFIC, channel: 60 });
    expect(decodeScanPriority(1)).toEqual({ type: SCAN_PRIORITY_SPECIFIC, channel: 1 });
    expect(decodeScanPriority(0x0080)).toEqual({ type: SCAN_PRIORITY_SPECIFIC, channel: 128 });
  });
});

describe('encodeScanPriority', () => {
  it('is the exact inverse for every value the radio can hold', () => {
    for (const raw of [0xffff, 0x0000, 1, 60, 128, 0xfffe]) {
      const ui = decodeScanPriority(raw);
      expect(encodeScanPriority(ui.type, ui.channel)).toBe(raw);
    }
  });

  it('encodes Off and Current', () => {
    expect(encodeScanPriority(SCAN_PRIORITY_NONE, undefined)).toBe(0xffff);
    expect(encodeScanPriority(SCAN_PRIORITY_CURRENT, undefined)).toBe(0x0000);
  });

  it('ignores a stale channel when the type is not Specific', () => {
    // The UI disables the channel picker rather than clearing it, so a list
    // switched from Specific back to None still carries the old channel.
    expect(encodeScanPriority(SCAN_PRIORITY_NONE, 60)).toBe(0xffff);
    expect(encodeScanPriority(SCAN_PRIORITY_CURRENT, 60)).toBe(0x0000);
  });

  it('treats Specific-with-no-channel as Off, never as Current', () => {
    // 0x0000 would mean "priority-scan whatever is tuned" — a live setting the
    // user never asked for. Off is the honest reading of an unfinished choice.
    expect(encodeScanPriority(SCAN_PRIORITY_SPECIFIC, undefined)).toBe(0xffff);
    expect(encodeScanPriority(SCAN_PRIORITY_SPECIFIC, 0)).toBe(0xffff);
    expect(encodeScanPriority(SCAN_PRIORITY_SPECIFIC, NaN)).toBe(0xffff);
  });

  it('defaults an unknown type to Off rather than to a channel', () => {
    expect(encodeScanPriority(undefined, 60)).toBe(0xffff);
    expect(encodeScanPriority(99, 60)).toBe(0xffff);
  });

  it('clamps a channel above the field to 0xfffe, never to 0xffff', () => {
    // 0xffff is Off, so clamping to it would turn a too-high channel into
    // "no priority" instead of an out-of-range one.
    expect(encodeScanPriority(SCAN_PRIORITY_SPECIFIC, 0x10000)).toBe(0xfffe);
  });
});

/**
 * The narrowing from the radio's record to the shared model. Real captured
 * values: slot 0 of the reference radio held raw 0x0001/0x0080 with dwell 32,
 * slot 1 held 0x003c/0xffff with dwell 38.
 */
describe('narrowScanList', () => {
  const rec = (over: Partial<ScanListDecoded>): ScanListDecoded => ({
    slot: 1, name: 'SL Bravo', channels: [65, 64, 63, 62, 61, 60],
    prioritySelect: 1, scanMode: 0,
    priorityChannel1Raw: 0x003c, priorityChannel2Raw: 0xffff,
    lookBackTimeA: 20, lookBackTimeB: 31, dropoutDelay: 37, dwellTime: 38,
    revertChannel: 6, digitalGroupHold: 0,
    ...over,
  } as ScanListDecoded);

  it('carries the hardware slot across the boundary', () => {
    // This is what used to die here, stranding the write with no way to put a
    // list back where the radio holds it.
    expect(narrowScanList(rec({ slot: 7 })).slot).toBe(7);
  });

  it('maps dwell time onto hang time', () => {
    expect(narrowScanList(rec({})).hangTime).toBe(38);
  });

  it('surfaces a specific priority channel instead of showing None', () => {
    // The bug: priority1Type was never populated, so the UI rendered "None" for
    // a list whose record said channel 60 — and writing it back cleared it.
    const out = narrowScanList(rec({}));
    expect(out.priority1Type).toBe(SCAN_PRIORITY_SPECIFIC);
    expect(out.priorityChannel1).toBe(60);
  });

  it('surfaces Off as None with no channel', () => {
    const out = narrowScanList(rec({}));
    expect(out.priority2Type).toBe(SCAN_PRIORITY_NONE);
    expect(out.priorityChannel2).toBeUndefined();
  });

  it('surfaces Current rather than collapsing it into None', () => {
    const out = narrowScanList(rec({ priorityChannel1Raw: 0x0000 }));
    expect(out.priority1Type).toBe(SCAN_PRIORITY_CURRENT);
    expect(out.priorityChannel1).toBeUndefined();
  });

  it('round-trips both priorities back to the raw values the radio held', () => {
    const out = narrowScanList(rec({ priorityChannel1Raw: 0x0080, priorityChannel2Raw: 0x0001 }));
    expect(encodeScanPriority(out.priority1Type, out.priorityChannel1)).toBe(0x0080);
    expect(encodeScanPriority(out.priority2Type, out.priorityChannel2)).toBe(0x0001);
  });

  it('reports the member count the shared model expects', () => {
    expect(narrowScanList(rec({})).channelCount).toBe(6);
  });
});
