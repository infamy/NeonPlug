import { describe, it, expect } from 'vitest';
import {
  memberSlotFor,
  talkGroupForMemberSlot,
  rxGroupsWithDmrIdMembers,
  rxGroupsWithRadioMembers,
} from '../../src/services/csv/rxGroupMembers';
import type { QuickContact, RXGroup } from '../../src/models';

const tg = (name: string, contactNumber: number, readSlot?: number): QuickContact => ({
  index: 0,
  offset: 0,
  name,
  contactNumber,
  callType: 0x04,
  hasHeader: false,
  flag: 0,
  rawData: new Uint8Array(0),
  ...(readSlot !== undefined && { readSlot }),
});

const group = (members: number[]) => ({ index: 1, name: 'G', talkGroupIndices: members }) as RXGroup;

describe('RX group members on a radio that stores them by slot', () => {
  it('names talk groups by position when the talk groups did not come from a read', () => {
    const list = [tg('A', 1), tg('B', 2)];
    expect(memberSlotFor(list, list[1])).toBe(1);
    expect(talkGroupForMemberSlot(list, 1)).toBe(list[1]);
  });

  it('follows a talk group by the slot it was read from after a delete moves it', () => {
    // Read A, B and C from slots 0-2, then A was deleted.
    const b = tg('B', 2, 1);
    const c = tg('C', 3, 2);
    const list = [b, c];
    expect(memberSlotFor(list, c, 3)).toBe(2);
    expect(talkGroupForMemberSlot(list, 2, 3)).toBe(c);
    expect(talkGroupForMemberSlot(list, 1, 3)).toBe(b);
    expect(talkGroupForMemberSlot(list, 0, 3)).toBeUndefined();
  });

  it('names a talk group added since the read by position, only past the slots the read found', () => {
    const a = tg('A', 1, 0);
    const b = tg('B', 2, 1);
    const added = tg('New', 9);
    expect(memberSlotFor([a, b, added], added, 2)).toBe(2);
    expect(talkGroupForMemberSlot([a, b, added], 2, 2)).toBe(added);
    // With A deleted, the new talk group sits at position 1, which is B's read slot.
    expect(memberSlotFor([b, added], added, 2)).toBeUndefined();
    expect(talkGroupForMemberSlot([b, added], 1, 2)).toBe(b);
  });

  it('keeps members through a CSV round trip after a delete', () => {
    const list = [tg('B', 2, 1), tg('C', 3, 2)];
    const exported = rxGroupsWithDmrIdMembers([group([2, 1])], list, true, 3);
    expect(exported[0].talkGroupIndices).toEqual([3, 2]);
    const back = rxGroupsWithRadioMembers(exported, list, true, 3);
    expect(back.issues).toEqual([]);
    expect(back.trimmed[0].talkGroupIndices).toEqual([2, 1]);
  });

  it('reports a talk group an RX group cannot take until the radio is read again', () => {
    const list = [tg('B', 2, 1), tg('New', 9)];
    const result = rxGroupsWithRadioMembers([group([9])], list, true, 2);
    expect(result.trimmed[0].talkGroupIndices).toEqual([]);
    expect(result.issues[0]).toMatch(/added after talk groups were deleted/);
  });
});
