import { describe, it, expect } from 'vitest';
import {
  addChannels,
  addZones,
  addScanLists,
  addContacts,
  addRadioIds,
  addTalkGroups,
  addRxGroups,
} from '../../src/services/csv/importModes';
import { createDefaultChannel } from '../../src/utils/channelHelpers';
import type { DMRRadioID, QuickContact, RXGroup, ScanList, Zone } from '../../src/models';

describe('adding a CSV to a list', () => {
  it('adds channels not already here, numbered after the last one and ahead of the VFOs', () => {
    const a = createDefaultChannel({ number: 1, name: 'A', rxFrequency: 146.52, txFrequency: 146.52 });
    const b = createDefaultChannel({ number: 5, name: 'B', rxFrequency: 446.1, txFrequency: 446.1 });
    const vfo = createDefaultChannel({ number: 4001, name: 'VFO A' });
    const c = createDefaultChannel({ number: 1, name: 'C', rxFrequency: 147.3, txFrequency: 147.9 });
    const result = addChannels([a, b, vfo], [{ ...a, number: 9 }, c, { ...c, number: 2 }]);
    expect(result.map((ch) => [ch.number, ch.name])).toEqual([[1, 'A'], [5, 'B'], [6, 'C'], [4001, 'VFO A']]);
  });

  it('adds zones under names not taken, with a fresh id where the file id is in use', () => {
    const here: Zone[] = [{ id: 'z1', name: 'Local', channels: [1] }];
    const result = addZones(here, [
      { id: 'z1', name: 'Local', channels: [2] },
      { id: 'z1', name: 'Travel', channels: [3] },
      { id: 'z9', name: 'Hills', channels: [4] },
    ]);
    expect(result.map((zone) => zone.name)).toEqual(['Local', 'Travel', 'Hills']);
    expect(result[0]).toBe(here[0]);
    expect(result[1].id).not.toBe('z1');
    expect(result[2].id).toBe('z9');
  });

  it('keeps a scan list slot the file gives when it is free, and finds one when it is not', () => {
    const list = (name: string, slot?: number): ScanList => ({
      name,
      channels: [1],
      ctcScanMode: 0,
      scanTxMode: 0,
      ...(slot === undefined ? {} : { slot }),
    });
    const here = [list('A', 0), list('B', 2)];
    const imported = [list('A', 5), list('C', 2), list('D', 4), list('E')];
    expect(addScanLists(here, imported, { scanListsBySlot: true, maxScanLists: 8 }).map((l) => [l.name, l.slot])).toEqual([
      ['A', 0],
      ['B', 2],
      ['C', 1],
      ['D', 4],
      ['E', 3],
    ]);
    expect(addScanLists(here, imported, null).map((l) => l.name)).toEqual(['A', 'B', 'C', 'D', 'E']);
  });

  it('adds contacts by DMR ID, once each, numbered after the last', () => {
    const result = addContacts(
      [{ id: 4, name: 'Alice', dmrId: 1 }],
      [
        { id: 1, name: 'Alice again', dmrId: 1 },
        { id: 2, name: 'Bob', dmrId: 2 },
        { id: 3, name: 'Bob twice', dmrId: 2 },
      ]
    );
    expect(result.map((c) => [c.id, c.name])).toEqual([
      [4, 'Alice'],
      [5, 'Bob'],
    ]);
  });

  it('adds radio IDs by DMR ID, at the lowest free index when the file index is taken', () => {
    const id = (index: number, value: number): DMRRadioID => ({
      index,
      dmrId: String(value),
      dmrIdValue: value,
      dmrIdBytes: new Uint8Array(3),
      name: `ID ${value}`,
    });
    const result = addRadioIds([id(0, 10), id(2, 20)], [id(0, 10), id(0, 30), id(1, 40)], 5);
    expect(result.map((r) => [r.index, r.dmrIdValue])).toEqual([
      [0, 10],
      [2, 20],
      [1, 30],
      [3, 40],
    ]);
  });

  it('appends talk groups not already here, leaving those here in their slots', () => {
    const tg = (index: number, contactNumber: number, callType = 0x04): QuickContact => ({
      index,
      offset: 0,
      name: `TG ${contactNumber}`,
      contactNumber,
      callType,
      hasHeader: false,
      flag: 0,
      rawData: new Uint8Array(0),
    });
    const here = [tg(1, 91), tg(2, 9)];
    const result = addTalkGroups(here, [tg(1, 9), tg(2, 9, 0x03), tg(3, 3100)]);
    expect(result.slice(0, 2)).toEqual(here);
    expect(result.map((t) => [t.index, t.contactNumber, t.callType])).toEqual([
      [1, 91, 0x04],
      [2, 9, 0x04],
      [3, 9, 0x03],
      [4, 3100, 0x04],
    ]);
  });

  it('adds RX groups under names not taken, keeping a free file index', () => {
    const group = (index: number, name: string): RXGroup => ({
      index,
      name,
      bitmask: 0,
      statusFlag: 0,
      entryFlag: 1,
      validationFlag: 0,
      talkGroupIndices: [],
    });
    const result = addRxGroups([group(1, 'A')], [group(0, 'A'), group(1, 'B'), group(5, 'C')], 32);
    expect(result.map((g) => [g.index, g.name])).toEqual([
      [1, 'A'],
      [0, 'B'],
      [5, 'C'],
    ]);
  });
});
