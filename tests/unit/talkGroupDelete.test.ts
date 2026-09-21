import { describe, it, expect } from 'vitest';
import { planTalkGroupDelete, describeTalkGroupDelete } from '../../src/services/csv/talkGroupImport';
import { createDefaultChannel } from '../../src/utils/channelHelpers';
import type { QuickContact, RXGroup } from '../../src/models';

const talkGroup = (index: number, fields: Partial<QuickContact> = {}): QuickContact => ({
  index,
  offset: 0,
  name: `TG ${index}`,
  contactNumber: 90 + index,
  callType: 0x04,
  hasHeader: index === 1,
  flag: 0,
  rawData: new Uint8Array(0),
  ...fields,
});

const rxGroup = (name: string, talkGroupIndices: number[]): RXGroup => ({
  index: 0,
  name,
  bitmask: 0,
  statusFlag: 0,
  entryFlag: 0x01,
  validationFlag: 0,
  talkGroupIndices,
});

// Channels name their TX contact by 1-based talk group slot.
const channels = [
  createDefaultChannel({ number: 1, name: 'Before', contactId: 1 }),
  createDefaultChannel({ number: 2, name: 'Deleted', contactId: 2 }),
  createDefaultChannel({ number: 3, name: 'After', contactId: 3 }),
  createDefaultChannel({ number: 4, name: 'No contact', contactId: 0 }),
];

describe('deleting a talk group', () => {
  it('moves the channels after it up one and clears the ones that used it', () => {
    const plan = planTalkGroupDelete(channels, talkGroup(2), {});
    expect(plan.channels.map((ch) => ch.contactId)).toEqual([1, 0, 2, 0]);
    expect(plan.clearedChannels).toEqual([{ number: 2, name: 'Deleted' }]);
    expect(describeTalkGroupDelete(plan)).toBe('1 channel uses it: 2 Deleted. It will have no TX contact.');
  });

  it('leaves the channels to the write on a radio that moves references itself', () => {
    const rules = { renumbersTalkGroupRefsOnWrite: true };
    // Read from slot 1, so channels name it as contact 2.
    const plan = planTalkGroupDelete(channels, talkGroup(2, { readSlot: 1 }), rules);
    expect(plan.channels).toEqual(channels);
    expect(plan.clearedChannels).toEqual([{ number: 2, name: 'Deleted' }]);
    expect(describeTalkGroupDelete(plan)).toBe('1 channel uses it: 2 Deleted.');
  });

  it('says nothing when no channel uses the talk group', () => {
    const plan = planTalkGroupDelete(channels, talkGroup(5), {});
    expect(plan.channels.map((ch) => ch.contactId)).toEqual([1, 2, 3, 0]);
    expect(describeTalkGroupDelete(plan)).toBe('');
  });
});

describe('deleting a talk group on a radio that renumbers read slots on write', () => {
  const rules = { renumbersTalkGroupRefsOnWrite: true, rxGroupMembersBySlot: true };

  it('moves a member naming a talk group added since the read, or clears it once it can no longer be named', () => {
    // Read A(0) and B(1); D and E added since, named by position 2 and 3.
    const A = talkGroup(1, { readSlot: 0 });
    const B = talkGroup(2, { readSlot: 1 });
    const D = talkGroup(3);
    const E = talkGroup(4);
    const plan = planTalkGroupDelete([], A, rules, {
      talkGroups: [A, B, D, E],
      rxGroups: [rxGroup('G', [2, 3, 1])],
      countAtRead: 2,
    });
    // D drops to slot 1, among the read's slots, so G loses it. E moves to 2. B is the write's.
    expect(plan.rxGroups?.[0].talkGroupIndices).toEqual([2, 1]);
    expect(plan.unplaceable).toEqual([{ what: 'RX group "G"', talkGroup: 'TG 3' }]);
    expect(describeTalkGroupDelete(plan)).toContain('RX group "G" (TG 3)');
  });

  it('clears a channel on a deleted talk group added since the read, and moves the ones after it', () => {
    const A = talkGroup(1, { readSlot: 0 });
    const D = talkGroup(2);
    const E = talkGroup(3);
    const onD = createDefaultChannel({ number: 1, name: 'OnD', contactId: 2 });
    const onE = createDefaultChannel({ number: 2, name: 'OnE', contactId: 3 });
    const onA = createDefaultChannel({ number: 3, name: 'OnA', contactId: 1 });
    const plan = planTalkGroupDelete([onD, onE, onA], D, rules, {
      talkGroups: [A, D, E],
      rxGroups: [rxGroup('G', [1, 2])],
      countAtRead: 1,
    });
    expect(plan.channels.map((ch) => ch.contactId)).toEqual([0, 2, 1]);
    expect(plan.rxGroups?.[0].talkGroupIndices).toEqual([1]);
    expect(describeTalkGroupDelete(plan)).toBe(
      '1 channel uses it: 1 OnD. It will have no TX contact. It is taken out of RX group G.'
    );
  });

  it('names only the channels that really use a talk group added after a delete', () => {
    // Read A, B, C (3). A was deleted, then D added at position 2, below the read's
    // slots, where nothing can name it. Channel 7 still names C by its read slot 2.
    const B = talkGroup(1, { readSlot: 1 });
    const C = talkGroup(2, { readSlot: 2 });
    const D = talkGroup(3);
    const usesC = createDefaultChannel({ number: 7, name: 'UsesC', contactId: 3 });
    const plan = planTalkGroupDelete([usesC], D, rules, { talkGroups: [B, C, D], rxGroups: [], countAtRead: 3 });
    expect(plan.clearedChannels).toEqual([]);
    expect(plan.channels[0].contactId).toBe(3);
  });

  it('moves everything by position when there is no read to renumber against', () => {
    const X = talkGroup(1);
    const Y = talkGroup(2);
    const Z = talkGroup(3);
    const onY = createDefaultChannel({ number: 1, name: 'OnY', contactId: 2 });
    const onZ = createDefaultChannel({ number: 2, name: 'OnZ', contactId: 3 });
    const plan = planTalkGroupDelete([onY, onZ], Y, rules, { talkGroups: [X, Y, Z], rxGroups: [rxGroup('G', [2, 0, 1])] });
    expect(plan.channels.map((ch) => ch.contactId)).toEqual([0, 2]);
    expect(plan.rxGroups?.[0].talkGroupIndices).toEqual([1, 0]);
  });
});
