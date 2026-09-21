/**
 * A scan list this driver BUILDS must be byte-identical to one the vendor CPS
 * builds.
 *
 * The fixture is the real thing: a list named `SL Delta` created in the vendor
 * CPS on 2026-09-10, written to the radio, and lifted out of the serial capture
 * (`7x2_slreadaddwrite.txt`). It went into hardware slot 0 — the slot a delete
 * had emptied — so it is also the vendor's answer for writing into erased flash.
 *
 * Adding a scan list was refused until this capture existed, because four of its
 * fields have no UI and no derivable value. This test is what makes building one
 * defensible: not "our encoder round-trips", but "our bytes are the vendor's
 * bytes".
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { applyScanListToRecord } from '../../src/radios/d890uv/tableWrite';
import { blankScanList, D890_SCAN_LIST_DEFAULTS } from '../../src/radios/d890uv/blankRecords';
import { D890_ADDR } from '../../src/radios/d890uv/constants';
import type { ScanListDecoded } from '../../src/radios/d890uv/structures';

const VENDOR = new Uint8Array(
  readFileSync(join(__dirname, '../fixtures/d890uv/scanlist-vendor-new.bin'))
);

/** Exactly what the user built in the CPS: a name and three channels. */
const asDecoded = (): ScanListDecoded =>
  ({ ...D890_SCAN_LIST_DEFAULTS, slot: 0, name: 'SL Delta', channels: [17, 41, 72] } as ScanListDecoded);

describe('a scan list built from the blank', () => {
  it('is byte-identical to the one the vendor CPS wrote', () => {
    const ours = applyScanListToRecord(blankScanList(), asDecoded());
    expect(Array.from(ours)).toEqual(Array.from(VENDOR));
  });

  it('is byte-identical when built over an ERASED slot', () => {
    // The vendor put this list into a slot a delete had emptied. Patching that
    // 0xFF directly would leave 0xFF across the zero tail and 0x2e-0x2f.
    const erased = new Uint8Array(D890_ADDR.SCAN_LIST_STRIDE).fill(0xff);
    const ours = applyScanListToRecord(erased, asDecoded());
    expect(Array.from(ours)).toEqual(Array.from(VENDOR));
  });

  it('does NOT treat a populated record as erased', () => {
    // A list with no members has an 0xFF member array; only a wholly 0xFF
    // record is erased. Editing such a list must patch it, not replace it.
    const populated = new Uint8Array(VENDOR);
    populated.fill(0xff, 0x30, 0x94);
    populated[0x06] = 99; // a look-back the vendor default does not have
    const ours = applyScanListToRecord(populated, { ...asDecoded(), lookBackTimeA: 99 });
    expect(ours[0x06]).toBe(99);
  });

  it('keeps the two representations of the defaults in step', () => {
    // `blankScanList` is bytes and `D890_SCAN_LIST_DEFAULTS` is the decode of
    // the same capture. They are written out separately and must not drift.
    const b = blankScanList();
    const u16 = (at: number) => b[at]! | (b[at + 1]! << 8);
    expect(b[0x00]).toBe(D890_SCAN_LIST_DEFAULTS.scanMode);
    expect(b[0x01]).toBe(D890_SCAN_LIST_DEFAULTS.prioritySelect);
    expect(u16(0x02)).toBe(D890_SCAN_LIST_DEFAULTS.priorityChannel1Raw);
    expect(u16(0x04)).toBe(D890_SCAN_LIST_DEFAULTS.priorityChannel2Raw);
    expect(u16(0x06)).toBe(D890_SCAN_LIST_DEFAULTS.lookBackTimeA);
    expect(u16(0x08)).toBe(D890_SCAN_LIST_DEFAULTS.lookBackTimeB);
    expect(u16(0x0a)).toBe(D890_SCAN_LIST_DEFAULTS.dropoutDelay);
    expect(u16(0x0c)).toBe(D890_SCAN_LIST_DEFAULTS.dwellTime);
    expect(b[0x94]).toBe(D890_SCAN_LIST_DEFAULTS.revertChannel);
  });
});
