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
  priorityChannel1Raw: 60, priorityChannel2Raw: 0xffff,
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
    expect(out[0].scanMode).toBe(1);
    expect(out[0].lookBackTimeA).toBe(50);
    expect(out[0].lookBackTimeB).toBe(60);
    expect(out[0].dropoutDelay).toBe(70);
    expect(out[0].dwellTime).toBe(80);
    expect(out[0].revertChannel).toBe(0);
    // `prioritySelect` is NOT in this list: it gates the two priority channels,
    // so it is derived from them rather than carried. The fixture holds channel
    // 60 and Off, which is "first only" — 1, not the 2 it was read as. See the
    // hardware measurement below.
    expect(out[0].prioritySelect).toBe(1);
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

  it('DELETE drops the list and leaves its slot a hole', () => {
    // Measured 2026-09-10: deleting scan list slot 0 of {0,1} left the read
    // fetching 0x2100200 alone — slot 1 stayed slot 1 rather than moving down.
    // So the survivor keeps its slot and channels referencing it still resolve.
    stage([decoded(0, 'A'), decoded(1, 'B')]);
    useScanListsStore.setState({ scanLists: [uiList(1, 'B', [4])] });
    const out = d890ScanLists()!;
    expect(out.map((l) => l.slot)).toEqual([1]);
    expect(out[0].name).toBe('B');
  });

  it('REFUSES an add — a new list has no decoded record to patch', () => {
    stage([decoded(0, 'A')]);
    useScanListsStore.setState({
      scanLists: [uiList(0, 'A', [1]), uiList(undefined, 'brand new', [2])],
    });
    expect(() => d890ScanLists()).toThrow(/adding a scan list is not supported yet/);
  });

  it('still REFUSES an add once the UI has allocated it a slot', () => {
    // The UI now hands a new list the lowest free slot so a hole gets reused, so
    // `slot === undefined` no longer identifies an add. The test that matters is
    // that having a slot is not enough: there must be a RECORD behind it, or
    // there is nothing to patch and the unknown fields would be invented.
    stage([decoded(1, 'B')]);
    useScanListsStore.setState({
      scanLists: [uiList(1, 'B', [1]), uiList(0, 'new in the hole', [2])],
    });
    expect(() => d890ScanLists()).toThrow(/adding a scan list is not supported yet/);
  });

  it('names the offending list and its slot in the refusal', () => {
    stage([decoded(1, 'B')]);
    useScanListsStore.setState({
      scanLists: [uiList(1, 'B', [1]), uiList(0, 'new in the hole', [2])],
    });
    // Slot 1 in the message, 0 on the wire — the user counts from 1.
    expect(() => d890ScanLists()).toThrow(/"new in the hole" \(slot 1\)/);
  });
});

describe('d890ScanLists — the three fields that used to be discarded', () => {
  it('writes Hang Time back as the dwell time', () => {
    // It DISPLAYED the radio's real dwell time, accepted an edit, and reverted.
    stage([decoded(0, 'A')]);
    useScanListsStore.setState({
      scanLists: [{ ...uiList(0, 'A', [1]), hangTime: 45 } as ScanList],
    });
    expect(d890ScanLists()![0].dwellTime).toBe(45);
  });

  it('keeps the radio dwell time when the UI has no hang time', () => {
    stage([decoded(0, 'A')]);
    useScanListsStore.setState({ scanLists: [uiList(0, 'A', [1])] });
    expect(d890ScanLists()![0].dwellTime).toBe(80);
  });

  it('never turns a blank or absurd hang time into a 0-decisecond timer', () => {
    stage([decoded(0, 'A')]);
    useScanListsStore.setState({
      scanLists: [{ ...uiList(0, 'A', [1]), hangTime: NaN } as ScanList],
    });
    expect(d890ScanLists()![0].dwellTime).toBe(80);
  });

  it('writes both priority channels from the UI pair', () => {
    stage([decoded(0, 'A')]);
    useScanListsStore.setState({
      scanLists: [{
        ...uiList(0, 'A', [1]),
        priority1Type: 2, priorityChannel1: 7,
        priority2Type: 1, priorityChannel2: undefined,
      } as ScanList],
    });
    const out = d890ScanLists()![0];
    expect(out.priorityChannel1Raw).toBe(7);
    expect(out.priorityChannel2Raw).toBe(0x0000);
  });

  it('lets the user turn a priority OFF', () => {
    // The record holds channel 60; the user sets Priority 1 Type to None.
    stage([decoded(0, 'A')]);
    useScanListsStore.setState({
      scanLists: [{ ...uiList(0, 'A', [1]), priority1Type: 0 } as ScanList],
    });
    expect(d890ScanLists()![0].priorityChannel1Raw).toBe(0xffff);
  });

  it('sets prioritySelect to match the two priority channels', () => {
    // MEASURED on hardware 2026-09-10: priority 2 written as channel 63 with
    // this byte left at 1 showed as OFF on the radio's own menu. The channel is
    // stored and ignored unless its bit is set here.
    stage([decoded(0, 'A')]);
    const set = (p1t?: number, p1c?: number, p2t?: number, p2c?: number) => {
      useScanListsStore.setState({
        scanLists: [{ ...uiList(0, 'A', [1]),
          priority1Type: p1t, priorityChannel1: p1c,
          priority2Type: p2t, priorityChannel2: p2c } as ScanList],
      });
      return d890ScanLists()![0].prioritySelect;
    };
    expect(set(2, 62, 2, 63)).toBe(3); // both in use
    expect(set(2, 62, 0, undefined)).toBe(1); // first only
    expect(set(0, undefined, 2, 63)).toBe(2); // second only
    expect(set(0, undefined, 0, undefined)).toBe(0); // neither
  });

  it('counts "Current channel" as in use, because it is', () => {
    // Raw 0x0000 is Current, a live setting — only 0xffff is Off. Treating zero
    // as "nothing set" would leave a working priority gated off.
    stage([decoded(0, 'A')]);
    useScanListsStore.setState({
      scanLists: [{ ...uiList(0, 'A', [1]), priority1Type: 1, priority2Type: 0 } as ScanList],
    });
    const out = d890ScanLists()![0];
    expect(out.priorityChannel1Raw).toBe(0x0000);
    expect(out.prioritySelect).toBe(1);
  });

  it('KEEPS the radio priority when the UI carries no type at all', () => {
    // A list from an importer or an older .neonplug has no priority fields.
    // Encoding undefined would write 0xffff and silently delete channel 60.
    stage([decoded(0, 'A')]);
    useScanListsStore.setState({ scanLists: [uiList(0, 'A', [1])] });
    const out = d890ScanLists()![0];
    expect(out.priorityChannel1Raw).toBe(60);
    expect(out.priorityChannel2Raw).toBe(0xffff);
  });

  it('returns undefined when the radio was never read', () => {
    useScanListsStore.setState({ scanLists: [uiList(0, 'A', [1])] });
    expect(d890ScanLists()).toBeUndefined();
  });
});
