/**
 * Scan lists reaching the write plan.
 *
 * The awkward one of the five tables in the 2026-09-10 audit, for two reasons
 * that both come from the shared `ScanList` model being shaped around the DM-32:
 *
 *   1. It has no slot. The DA-7X2 reads scan lists off a presence mask, so array
 *      position is not the slot — `ScanListDecoded.slot` carries it, and that
 *      type never left `radios/d890uv/`, so the slot died at the store boundary.
 *   2. It has no home for scan mode, priority select, the raw priority channels
 *      or the four timers, all of which the encoder writes. So narrowing at read
 *      time loses more than the slot, and the DECODED record has to be the base
 *      with only the UI-editable fields overlaid.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { d890ScanLists } from '../../src/services/d890WriteInput';
import { useRadioStore } from '../../src/store/radioStore';
import { useScanListsStore } from '../../src/store/scanListsStore';
import type { ScanListDecoded } from '../../src/radios/d890uv/structures';
import type { ScanList } from '../../src/models/ScanList';

const decoded = (slot: number, name: string): ScanListDecoded => ({
  slot, name, channels: [1, 2, 3],
  prioritySelect: 2, scanMode: 1,
  lookBackTimeA: 50, lookBackTimeB: 60, dropoutDelay: 70, dwellTime: 80,
  revertChannel: 0, digitalGroupHold: 0,
} as ScanListDecoded);

const uiList = (slot: number | undefined, name: string, channels: number[]): ScanList =>
  ({ slot, name, channels, ctcScanMode: 0, scanTxMode: 0 } as ScanList);

beforeEach(() => {
  useRadioStore.setState({ tables: {} });
  useScanListsStore.setState({ scanLists: [] });
});

const stage = (lists: ScanListDecoded[]) =>
  useRadioStore.setState({ tables: { scanListsDetailed: lists } as never });

describe('d890ScanLists', () => {
  it('keeps every decoded field the shared model cannot hold', () => {
    // The whole reason the decoded record is the base: narrowing at read time
    // drops these, and the encoder writes all of them.
    stage([decoded(0, 'A')]);
    useScanListsStore.setState({ scanLists: [uiList(0, 'A', [1, 2, 3])] });
    const out = d890ScanLists()!;
    expect(out[0].prioritySelect).toBe(2);
    expect(out[0].scanMode).toBe(1);
    expect(out[0].lookBackTimeA).toBe(50);
    expect(out[0].dropoutDelay).toBe(70);
    expect(out[0].dwellTime).toBe(80);
  });

  it('overlays the fields the UI can actually edit', () => {
    stage([decoded(0, 'Old name')]);
    useScanListsStore.setState({ scanLists: [uiList(0, 'New name', [7, 8])] });
    const out = d890ScanLists()!;
    expect(out[0].name).toBe('New name');
    expect(out[0].channels).toEqual([7, 8]);
    // …without disturbing anything else.
    expect(out[0].dwellTime).toBe(80);
  });

  it('takes ONLY name and channels from the UI, never the whole object', () => {
    // The overlay is explicit rather than `{ ...record, ...ui }` so the boundary
    // of "what the UI may edit" is visible in the code. A blanket spread would
    // also drag the DM-32-shaped fields of the shared model into a record the
    // D890 encoder reads, which is how a field nobody meant to write gets
    // written.
    stage([decoded(0, 'A')]);
    useScanListsStore.setState({
      scanLists: [{ ...uiList(0, 'A', [1]), ctcScanMode: 7, scanTxMode: 9 } as ScanList],
    });
    const out = d890ScanLists()![0] as ScanListDecoded & Record<string, unknown>;
    expect(out.ctcScanMode).toBeUndefined();
    expect(out.scanTxMode).toBeUndefined();
  });

  it('matches by SLOT, not by list position', () => {
    // Slots 0 and 5 occupied. Matching by position would put slot 5's edits on
    // slot 0's record and write both to the wrong places.
    stage([decoded(0, 'first'), decoded(5, 'second')]);
    useScanListsStore.setState({
      scanLists: [uiList(5, 'renamed five', [9]), uiList(0, 'renamed zero', [1])],
    });
    const out = d890ScanLists()!;
    expect(out.map((l) => [l.slot, l.name])).toEqual([[0, 'renamed zero'], [5, 'renamed five']]);
  });

  it('survives a rename — the slot is the identity, not the name', () => {
    stage([decoded(3, 'Original')]);
    useScanListsStore.setState({ scanLists: [uiList(3, 'Totally different', [4])] });
    expect(d890ScanLists()![0].slot).toBe(3);
  });

  it('REFUSES a delete — hole vs compact is unknown and channels reference lists', () => {
    stage([decoded(0, 'A'), decoded(1, 'B')]);
    useScanListsStore.setState({ scanLists: [uiList(0, 'A', [1])] });
    expect(() => d890ScanLists()).toThrow(/adding or removing a scan list is not safe yet/);
  });

  it('REFUSES an add — a new list has no decoded record to patch', () => {
    stage([decoded(0, 'A')]);
    useScanListsStore.setState({
      scanLists: [uiList(0, 'A', [1]), uiList(undefined, 'brand new', [2])],
    });
    expect(() => d890ScanLists()).toThrow(/adding or removing a scan list is not safe yet/);
  });

  it('returns undefined when the radio was never read', () => {
    useScanListsStore.setState({ scanLists: [uiList(0, 'A', [1])] });
    expect(d890ScanLists()).toBeUndefined();
  });
});
