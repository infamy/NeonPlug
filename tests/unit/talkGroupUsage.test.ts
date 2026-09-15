import { describe, it, expect } from 'vitest';
import {
  describeTalkGroupUsage,
  talkGroupMatchesSearch,
  talkGroupUsage,
} from '../../src/services/talkGroupUsage';
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

describe('where a talk group is used', () => {
  it('finds the channels on each DM-32 talk group slot, and RX groups by DMR ID', () => {
    const talkGroups = [talkGroup(1), talkGroup(2)];
    const channels = [
      createDefaultChannel({ number: 1, name: 'Local', contactId: 2 }),
      createDefaultChannel({ number: 2, name: 'Wide', contactId: 2 }),
      createDefaultChannel({ number: 3, name: 'None', contactId: 0 }),
    ];
    const usage = talkGroupUsage(talkGroups, channels, [rxGroup('Home', [92, 91])], {});
    expect(usage.get(talkGroups[1])).toEqual({
      channels: [
        { number: 1, name: 'Local' },
        { number: 2, name: 'Wide' },
      ],
      rxGroups: ['Home'],
    });
    expect(usage.get(talkGroups[0])).toEqual({ channels: [], rxGroups: ['Home'] });
  });

  it('follows read slots on a radio that renumbers them on write, and positions past them', () => {
    // Read A(0) and B(1); A deleted since. D was then added at position 1, below
    // the read's slots, where nothing can name it; E at position 2 is named by it.
    const B = talkGroup(1, { readSlot: 1 });
    const D = talkGroup(2);
    const E = talkGroup(3);
    const channels = [
      createDefaultChannel({ number: 1, name: 'OnB', contactId: 2 }),
      createDefaultChannel({ number: 2, name: 'OnE', contactId: 3 }),
    ];
    const rules = { renumbersTalkGroupRefsOnWrite: true, rxGroupMembersBySlot: true };
    const usage = talkGroupUsage([B, D, E], channels, [rxGroup('G', [1, 2])], rules, 2);
    expect(usage.get(B)).toEqual({ channels: [{ number: 1, name: 'OnB' }], rxGroups: ['G'] });
    expect(usage.get(D)).toEqual({ channels: [], rxGroups: [] });
    expect(usage.get(E)).toEqual({ channels: [{ number: 2, name: 'OnE' }], rxGroups: ['G'] });
  });

  it('says how many use it, with the names for a tooltip', () => {
    expect(describeTalkGroupUsage({ channels: [{ number: 5, name: 'Local' }], rxGroups: ['Home', 'Away'] })).toEqual({
      text: '1 channel · 2 RX groups',
      detail: 'Channels: 5 Local\nRX groups: Home, Away',
    });
    expect(describeTalkGroupUsage({ channels: [], rxGroups: [] }).text).toBe('—');
  });

  it('searches by name, the start of the ID, or the call type', () => {
    const worldwide = talkGroup(1, { name: 'Worldwide', contactNumber: 91, callType: 0x04 });
    expect(talkGroupMatchesSearch(worldwide, 'world')).toBe(true);
    expect(talkGroupMatchesSearch(worldwide, '91')).toBe(true);
    expect(talkGroupMatchesSearch(worldwide, '1')).toBe(false);
    expect(talkGroupMatchesSearch(worldwide, 'group')).toBe(true);
    expect(talkGroupMatchesSearch(worldwide, 'private')).toBe(false);
  });
});
