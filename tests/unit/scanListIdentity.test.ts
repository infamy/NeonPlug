import { describe, it, expect, beforeEach } from 'vitest';
import { useScanListsStore } from '../../src/store/scanListsStore';
import type { ScanList } from '../../src/models/ScanList';

const list = (name: string, channels: number[]): ScanList =>
  ({ name, channels, ctcScanMode: 0, scanTxMode: 0 }) as ScanList;

const store = () => useScanListsStore.getState();
const names = () => store().scanLists.map((l) => l.name);

describe('scan lists that share a name', () => {
  beforeEach(() => {
    // A DM-32 read held six lists called "Scan List".
    useScanListsStore.setState({
      scanLists: [list('Scan List', [1]), list('SL03 ONE', [31]), list('Scan List', [2])],
      selectedScanList: null,
    });
  });

  it('changes only the list at the position given', () => {
    store().updateScanList(2, { channels: [5, 6] });
    expect(store().scanLists.map((l) => l.channels)).toEqual([[1], [31], [5, 6]]);
  });

  it('renames only that list, and still refuses a name another list has', () => {
    expect(store().renameScanList(2, 'Scan List')).toBe(true);
    expect(store().renameScanList(0, 'Mine')).toBe(true);
    expect(names()).toEqual(['Mine', 'SL03 ONE', 'Scan List']);
    expect(store().renameScanList(0, 'SL03 ONE')).toBe(false);
  });

  it('deletes only that list, and a selection below it moves up with its list', () => {
    store().setSelectedScanList(2);
    store().deleteScanList(0);
    expect(names()).toEqual(['SL03 ONE', 'Scan List']);
    expect(store().selectedScanList).toBe(1);
    store().deleteScanList(1);
    expect(store().selectedScanList).toBeNull();
  });
});
