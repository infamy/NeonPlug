import { describe, expect, it } from 'vitest';
import { scanListByReference, scanListReference } from '../../src/utils/scanListReference';
import type { ScanList } from '../../src/models/ScanList';

const list = (name: string, slot?: number): ScanList => ({ name, slot, channels: [], ctcScanMode: 0, scanTxMode: 0 });

describe('scan list references', () => {
  it('references DM-32 lists by 1-based position', () => {
    const lists = [list('A'), list('B')];
    expect(lists.map((l, i) => scanListReference(l, i, false))).toEqual([1, 2]);
    expect(scanListByReference(lists, 2, false)?.name).toBe('B');
  });

  it('ignores a slot the editor assigned on a radio that references by position', () => {
    // The add handler gives every new list a slot. A list read off a DM-32 has
    // none, so a list added after it gets slot 0, which is not where it goes.
    const lists = [list('Read'), list('Added', 0)];
    expect(lists.map((l, i) => scanListReference(l, i, false))).toEqual([1, 2]);
    expect(scanListByReference(lists, 1, false)?.name).toBe('Read');
    expect(scanListByReference(lists, 2, false)?.name).toBe('Added');
  });

  it('references DA-7X2 lists by slot + 1, across a hole', () => {
    // Slot 0 was deleted. The survivor keeps slot 1, and its channels store 2.
    const lists = [list('Alpha', 1)];
    expect(scanListReference(lists[0], 0, true)).toBe(2);
    expect(scanListByReference(lists, 2, true)?.name).toBe('Alpha');
    expect(scanListByReference(lists, 1, true)).toBeUndefined();
  });

  it('treats 0 as no scan list', () => {
    expect(scanListByReference([list('A')], 0, false)).toBeUndefined();
    expect(scanListByReference([list('A', 0)], 0, true)).toBeUndefined();
  });
});
