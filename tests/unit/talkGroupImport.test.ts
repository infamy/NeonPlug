import { describe, it, expect } from 'vitest';
import { exportQuickContactsToCSV, importQuickContactsFromCSV } from '../../src/services/csv';
import { planTalkGroupImport, describeTalkGroupImportLosses } from '../../src/services/csv/talkGroupImport';
import { createDefaultChannel } from '../../src/utils/channelHelpers';
import type { QuickContact, RXGroup } from '../../src/models';

const talkGroup = (index: number, name: string, contactNumber: number, fields: Partial<QuickContact> = {}): QuickContact => ({
  index,
  offset: 0,
  name,
  contactNumber,
  callType: 0x04,
  hasHeader: index === 1,
  flag: 0,
  rawData: new Uint8Array(0),
  ...fields,
});

/** Talk groups as a CSV of `list` brings them in. */
function fromCsv(list: QuickContact[]): QuickContact[] {
  const result = importQuickContactsFromCSV(exportQuickContactsToCSV(list));
  expect(result.errors).toBeUndefined();
  return result.quickContacts!;
}

describe('talk group CSV', () => {
  it('brings back the name, DMR ID and call type of every talk group it exports', () => {
    const list = [
      talkGroup(1, 'Local', 9),
      talkGroup(2, 'Parrot', 9990, { callType: 0x03 }),
      talkGroup(3, 'All', 0xffffff, { callType: 0x05 }),
    ];
    expect(fromCsv(list).map((tg) => [tg.index, tg.name, tg.contactNumber, tg.callType])).toEqual([
      [1, 'Local', 9, 0x04],
      [2, 'Parrot', 9990, 0x03],
      [3, 'All', 0xffffff, 0x05],
    ]);
  });

  it('reads the long call type labels too', () => {
    const result = importQuickContactsFromCSV('Name,Contact Number,Call Type\nA,1,Group Call\nB,2,private call\nC,16777215,All Call');
    expect(result.quickContacts!.map((tg) => tg.callType)).toEqual([0x04, 0x03, 0x05]);
  });

  it('refuses a row it would have to guess at', () => {
    const result = importQuickContactsFromCSV(
      'Name,Contact Number,Call Type\nA,1,Banana\nB,,Group\nC,16777216,Group\nD,12x,Group\nE,5,All Call'
    );
    expect(result.success).toBe(false);
    expect(result.errors).toEqual([
      `Row 2: call type "Banana" isn't Group Call, Private Call or All Call`,
      'Row 3: DMR ID "" must be a whole number from 1 to 16777215',
      'Row 4: DMR ID "16777216" must be a whole number from 1 to 16777215',
      'Row 5: DMR ID "12x" must be a whole number from 1 to 16777215',
      'Row 6: an All Call uses DMR ID 16777215, not 5',
    ]);
  });
});

describe('replacing talk groups from a CSV', () => {
  const a = talkGroup(1, 'A', 101);
  const b = talkGroup(2, 'B', 102);
  const c = talkGroup(3, 'C', 103);

  it('moves a DM-32 channel to follow its talk group when the file reorders the list', () => {
    const channels = [
      createDefaultChannel({ number: 1, name: 'On A', contactId: 1 }),
      createDefaultChannel({ number: 2, name: 'On C', contactId: 3 }),
      createDefaultChannel({ number: 3, name: 'None', contactId: 0 }),
    ];
    const plan = planTalkGroupImport([a, b, c], fromCsv([c, a, b]), channels, [], {});
    expect(plan.channels.map((ch) => ch.contactId)).toEqual([2, 1, 0]);
    expect(plan.channels[2]).toBe(channels[2]);
    expect(plan.clearedChannels).toEqual([]);
    expect(describeTalkGroupImportLosses(plan)).toBe('');
  });

  it('clears a channel whose talk group the file leaves out, and says which', () => {
    const channels = [
      createDefaultChannel({ number: 7, name: 'On B', contactId: 2 }),
      createDefaultChannel({ number: 8, name: 'On C', contactId: 3 }),
    ];
    const plan = planTalkGroupImport([a, b, c], fromCsv([a, c]), channels, [], {});
    expect(plan.channels.map((ch) => ch.contactId)).toEqual([0, 2]);
    expect(plan.clearedChannels).toEqual([{ number: 7, name: 'On B' }]);
    expect(describeTalkGroupImportLosses(plan)).toBe(
      '1 channel uses a talk group the file leaves out, and will have no TX contact: 7 On B.'
    );
  });

  it('keeps the DA-7X2 read slot and record, and leaves moving references to its write', () => {
    const read = [
      talkGroup(1, 'A', 101, { readSlot: 0, rawData: new Uint8Array([0]) }),
      talkGroup(2, 'B', 102, { readSlot: 1, rawData: new Uint8Array([1]) }),
      talkGroup(3, 'C', 103, { readSlot: 2, rawData: new Uint8Array([2]) }),
    ];
    const channels = [
      createDefaultChannel({ number: 1, name: 'On A', contactId: 1 }),
      createDefaultChannel({ number: 2, name: 'On B', contactId: 2 }),
    ];
    const groups: RXGroup[] = [
      { index: 0, name: 'Mix', bitmask: 0, statusFlag: 0, entryFlag: 1, validationFlag: 0, talkGroupIndices: [1, 2] },
    ];
    const plan = planTalkGroupImport(read, fromCsv([c, a]), channels, groups, {
      renumbersTalkGroupRefsOnWrite: true,
      rxGroupMembersBySlot: true,
    });

    expect(plan.talkGroups.map((tg) => [tg.index, tg.name, tg.readSlot, tg.rawData[0]])).toEqual([
      [1, 'C', 2, 2],
      [2, 'A', 0, 0],
    ]);
    expect(plan.channels.map((ch) => ch.contactId)).toEqual([1, 0]);
    expect(plan.rxGroups[0].talkGroupIndices).toEqual([2]);
    expect(plan.removedMembers).toEqual([{ group: 'Mix', talkGroup: 'B' }]);
  });

  it('matches a talk group once, so a repeated row comes in as a new one', () => {
    const plan = planTalkGroupImport([talkGroup(1, 'A', 101, { readSlot: 0 })], fromCsv([a, a]), [], [], {
      renumbersTalkGroupRefsOnWrite: true,
    });
    expect(plan.talkGroups.map((tg) => tg.readSlot)).toEqual([0, undefined]);
  });
});
