import { describe, it, expect } from 'vitest';
import {
  exportZonesToCSV,
  importZonesFromCSV,
  exportScanListsToCSV,
  importScanListsFromCSV,
  exportContactsToCSV,
  importContactsFromCSV,
  exportRXGroupsToCSV,
  importRXGroupsFromCSV,
  exportDMRRadioIDsToCSV,
  importDMRRadioIDsFromCSV,
} from '../../src/services/csv';
import { rxGroupsWithDmrIdMembers, rxGroupsWithRadioMembers } from '../../src/services/csv/rxGroupMembers';
import type { Zone, ScanList, Contact, RXGroup, DMRRadioID, QuickContact } from '../../src/models';

describe('zone CSV round trip', () => {
  it('keeps each zone id and hidden flag, so a DA-7X2 write keeps zones in their slots', () => {
    const zones: Zone[] = [
      { id: 'zone-a', name: 'Local', channels: [1, 2, 3], hidden: true },
      { id: 'zone-b', name: 'DMR', channels: [4], hidden: false },
      { id: 'zone-c', name: 'Plain', channels: [] },
    ];
    const result = importZonesFromCSV(exportZonesToCSV(zones));
    expect(result.errors).toBeUndefined();
    expect(result.zones).toEqual(zones);
    expect('hidden' in result.zones![2]).toBe(false);
  });

  it('gives zones from a file without ids new ones', () => {
    const [zone] = importZonesFromCSV('Zone Name,Channels\nLocal,1;2').zones!;
    expect(zone.id).toBeTruthy();
    expect(zone.channels).toEqual([1, 2]);
  });

  it('refuses a file that repeats a zone id', () => {
    const result = importZonesFromCSV('Zone Name,Channels,Zone ID\nA,1,z1\nB,2,z1');
    expect(result.success).toBe(false);
    expect(result.errors![0]).toMatch(/Row 3: Zone ID "z1" appears more than once/);
  });
});

describe('scan list CSV round trip', () => {
  it('keeps every field, including the DA-7X2 slot', () => {
    const lists: ScanList[] = [
      {
        name: 'Slotted',
        slot: 3,
        channels: [5, 6],
        ctcScanMode: 1,
        scanTxMode: 2,
        hangTime: 30,
        priority1Type: 2,
        priority2Type: 1,
        priorityChannel1: 5,
        priorityChannel2: 6,
        designatedTxChannel: 6,
      },
      { name: 'No slot', channels: [1], ctcScanMode: 0, scanTxMode: 0 },
    ];
    const result = importScanListsFromCSV(exportScanListsToCSV(lists));
    expect(result.errors).toBeUndefined();
    expect(result.scanLists).toEqual(lists);
    expect('slot' in result.scanLists![1]).toBe(false);
  });

  it('refuses a file that puts two lists in one slot', () => {
    const result = importScanListsFromCSV('Name,Channels,Slot\nA,1,0\nB,2,0');
    expect(result.success).toBe(false);
    expect(result.errors![0]).toMatch(/Row 3: Slot 0 appears more than once/);
  });
});

describe('contact CSV round trip', () => {
  it('keeps the friend flag, and leaves it unset where a radio has none', () => {
    const contacts: Contact[] = [
      { id: 1, name: 'Alice', dmrId: 3112345, callSign: 'VE7XYZ', city: 'Victoria', province: 'BC', country: 'Canada', remark: 'Net control', isFriend: true },
      { id: 2, name: 'Bob', dmrId: 3112346, isFriend: false },
      { id: 3, name: 'Carol', dmrId: 3112347 },
    ];
    const result = importContactsFromCSV(exportContactsToCSV(contacts));
    expect(result.errors).toBeUndefined();
    expect(result.contacts).toEqual(contacts);
    expect('isFriend' in result.contacts![2]).toBe(false);
  });
});

describe('DMR radio ID CSV round trip', () => {
  const id = (index: number, value: number, name: string): DMRRadioID => ({
    index,
    dmrId: String(value),
    dmrIdValue: value,
    dmrIdBytes: new Uint8Array([value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff]),
    name,
  });

  it('keeps index 0 instead of turning it into a duplicate', () => {
    const ids = [id(0, 3112345, 'Main'), id(1, 3112346, 'Second')];
    const result = importDMRRadioIDsFromCSV(exportDMRRadioIDsToCSV(ids));
    expect(result.errors).toBeUndefined();
    expect(result.dmrRadioIds).toEqual(ids);
  });

  it('refuses a file that repeats an index', () => {
    const result = importDMRRadioIDsFromCSV('Index,DMR ID,Name\n0,1,A\n0,2,B');
    expect(result.success).toBe(false);
    expect(result.errors![0]).toMatch(/Row 3: Index 0 appears more than once/);
  });
});

describe('RX group CSV round trip', () => {
  const group = (index: number, name: string, members: number[]): RXGroup => ({
    index,
    name,
    bitmask: 0,
    statusFlag: 0,
    entryFlag: 1,
    validationFlag: 0,
    talkGroupIndices: members,
  });
  const talkGroup = (index: number, contactNumber: number, callType = 0x04): QuickContact => ({
    index,
    offset: 0,
    name: `TG ${contactNumber}`,
    contactNumber,
    callType,
    hasHeader: index === 1,
    flag: 0,
    rawData: new Uint8Array(0),
  });
  const talkGroups = [talkGroup(1, 91), talkGroup(2, 3100), talkGroup(3, 9)];

  it('keeps DM-32 members, which are DMR IDs already, and index 0', () => {
    const groups = [group(0, 'Worldwide', [91, 3100]), group(1, 'Local', [9])];
    const result = importRXGroupsFromCSV(exportRXGroupsToCSV(rxGroupsWithDmrIdMembers(groups, talkGroups, false)));
    expect(result.errors).toBeUndefined();
    expect(rxGroupsWithRadioMembers(result.rxGroups!, talkGroups, false).trimmed).toEqual(groups);
  });

  it('writes DA-7X2 members as DMR IDs and turns them back into the same slots', () => {
    const groups = [group(0, 'Mixed', [2, 0])];
    const csv = exportRXGroupsToCSV(rxGroupsWithDmrIdMembers(groups, talkGroups, true));
    expect(csv).toContain('"9;91"');
    const back = rxGroupsWithRadioMembers(importRXGroupsFromCSV(csv).rxGroups!, talkGroups, true);
    expect(back.issues).toEqual([]);
    expect(back.trimmed).toEqual(groups);
  });

  it('reports a member that is not in the talk group list, and trimming drops it', () => {
    const result = rxGroupsWithRadioMembers([group(0, 'Mixed', [91, 555])], talkGroups, true);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatch(/RX group "Mixed" lists talk group 555/);
    expect(result.trimmed[0].talkGroupIndices).toEqual([0]);
  });

  it('prefers a group call when a private contact shares the number', () => {
    const shared = [talkGroup(1, 777, 0x03), talkGroup(2, 777, 0x04)];
    expect(rxGroupsWithRadioMembers([group(0, 'G', [777])], shared, true).trimmed[0].talkGroupIndices).toEqual([1]);
  });
});
