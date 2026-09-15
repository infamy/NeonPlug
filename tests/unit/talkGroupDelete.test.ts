import { describe, it, expect } from 'vitest';
import { planTalkGroupDelete, describeTalkGroupDelete } from '../../src/services/csv/talkGroupImport';
import { createDefaultChannel } from '../../src/utils/channelHelpers';
import type { QuickContact } from '../../src/models';

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
    expect(describeTalkGroupDelete(plan, {})).toBe('1 channel uses it: 2 Deleted. It will have no TX contact.');
  });

  it('leaves the channels to the write on a radio that moves references itself', () => {
    const rules = { renumbersTalkGroupRefsOnWrite: true };
    // Read from slot 1, so channels name it as contact 2.
    const plan = planTalkGroupDelete(channels, talkGroup(2, { readSlot: 1 }), rules);
    expect(plan.channels).toEqual(channels);
    expect(plan.clearedChannels).toEqual([{ number: 2, name: 'Deleted' }]);
    expect(describeTalkGroupDelete(plan, rules)).toBe('1 channel uses it: 2 Deleted.');
  });

  it('says nothing when no channel uses the talk group', () => {
    const plan = planTalkGroupDelete(channels, talkGroup(5), {});
    expect(plan.channels.map((ch) => ch.contactId)).toEqual([1, 2, 3, 0]);
    expect(describeTalkGroupDelete(plan, {})).toBe('');
  });
});
