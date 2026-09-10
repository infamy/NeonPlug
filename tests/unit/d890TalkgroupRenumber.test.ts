/**
 * Renumbering references into the compacting talk group table.
 *
 * Talk groups compact — clearing one shifts every later record down and frees
 * the LAST slot, measured from the vendor CPS on 2026-09-10. Compaction is only
 * half of a delete: channels reference a talk group by SLOT (`contactId`,
 * 1-based with 0 = none) and receive groups reference them by raw 0-based slot.
 * Leave those alone and a channel pointing at talk group 600 transmits on 601's
 * — in a codeplug that reads back perfectly clean, which is what makes it worse
 * than refusing.
 */

import { describe, it, expect } from 'vitest';
import {
  buildTalkgroupRenumber,
  isNoOpRenumber,
  renumberChannelContacts,
  renumberRxGroupMembers,
} from '../../src/radios/d890uv/talkgroupRenumber';
import type { Channel } from '../../src/models/Channel';
import type { RXGroup } from '../../src/models/RXGroup';

const ch = (number: number, contactId: number): Channel =>
  ({ number, name: `CH${number}`, contactId } as Channel);
const rx = (name: string, members: number[]): RXGroup =>
  ({ index: 0, name, talkGroupIndices: members } as RXGroup);
/** The list as it stands after the user removed the talk group at `slot`. */
const afterDeleting = (slot: number, countAtRead: number) =>
  Array.from({ length: countAtRead }, (_, i) => ({ readSlot: i })).filter(
    (c) => c.readSlot !== slot
  );

describe('buildTalkgroupRenumber', () => {
  it('shifts everything after the deleted slot down by one', () => {
    const r = buildTalkgroupRenumber(afterDeleting(2, 6), 6);
    expect(r.deleted).toEqual([2]);
    expect([...r.moved]).toEqual([[0, 0], [1, 1], [3, 2], [4, 3], [5, 4]]);
  });

  it('reports no-op when nothing moved', () => {
    const contacts = Array.from({ length: 4 }, (_, i) => ({ readSlot: i }));
    expect(isNoOpRenumber(buildTalkgroupRenumber(contacts, 4))).toBe(true);
  });

  it('an ADD shifts nothing — a new entry lands on the end', () => {
    const contacts = [...Array.from({ length: 3 }, (_, i) => ({ readSlot: i })), {}];
    const r = buildTalkgroupRenumber(contacts, 3);
    expect(r.deleted).toEqual([]);
    expect(isNoOpRenumber(r)).toBe(true);
  });

  it('handles several deletes at once', () => {
    const contacts = [{ readSlot: 0 }, { readSlot: 3 }, { readSlot: 5 }];
    const r = buildTalkgroupRenumber(contacts, 6);
    expect(r.deleted).toEqual([1, 2, 4]);
    expect([...r.moved]).toEqual([[0, 0], [3, 1], [5, 2]]);
  });
});

describe('renumberChannelContacts', () => {
  it('moves a TX contact above the deletion down with its talk group', () => {
    // contactId is 1-based: 5 means slot 4, which becomes slot 3 -> id 4.
    const r = buildTalkgroupRenumber(afterDeleting(2, 6), 6);
    const out = renumberChannelContacts([ch(1, 5)], r);
    expect(out.channels[0].contactId).toBe(4);
    expect(out.dangling).toEqual([]);
  });

  it('leaves a TX contact below the deletion alone', () => {
    const r = buildTalkgroupRenumber(afterDeleting(4, 6), 6);
    expect(renumberChannelContacts([ch(1, 2)], r).channels[0].contactId).toBe(2);
  });

  it('leaves "no contact" alone', () => {
    const r = buildTalkgroupRenumber(afterDeleting(0, 4), 4);
    expect(renumberChannelContacts([ch(1, 0)], r).channels[0].contactId).toBe(0);
  });

  it('REPORTS a channel whose talk group was deleted rather than clearing it', () => {
    // Clearing the TX contact changes what that channel transmits, so it is the
    // user's call, not this function's.
    const r = buildTalkgroupRenumber(afterDeleting(2, 6), 6);
    const out = renumberChannelContacts([ch(7, 3)], r);
    expect(out.dangling).toEqual([{ number: 7, name: 'CH7', slot: 2 }]);
    expect(out.channels[0].contactId).toBe(3);
  });

  it('renumbers a whole codeplug consistently', () => {
    const r = buildTalkgroupRenumber(afterDeleting(500, 1010), 1010);
    const channels = [ch(1, 1), ch(2, 500), ch(3, 502), ch(4, 1010)];
    const out = renumberChannelContacts(channels, r);
    // slot 0 stays; slot 501 -> 500; slot 1009 -> 1008. Nothing dangles.
    expect(out.channels.map((c) => c.contactId)).toEqual([1, 500, 502 - 1, 1010 - 1]);
    expect(out.dangling).toEqual([]);
  });
});

describe('renumberRxGroupMembers', () => {
  it('moves members above the deletion down', () => {
    const r = buildTalkgroupRenumber(afterDeleting(2, 6), 6);
    const out = renumberRxGroupMembers([rx('G', [0, 3, 5])], r);
    expect(out.groups[0].talkGroupIndices).toEqual([0, 2, 4]);
    expect(out.dangling).toEqual([]);
  });

  it('DROPS a member whose talk group is gone, and says so', () => {
    // Unlike a channel's TX contact, a receive group is a set — removing one
    // entry does not change what the others do.
    const r = buildTalkgroupRenumber(afterDeleting(2, 6), 6);
    const out = renumberRxGroupMembers([rx('G', [1, 2, 4])], r);
    expect(out.groups[0].talkGroupIndices).toEqual([1, 3]);
    expect(out.dangling).toEqual([{ group: 'G', slot: 2 }]);
  });

  it('returns the SAME object when nothing changed', () => {
    // So a caller can tell "untouched" from "rebuilt identically" by identity.
    const group = rx('G', [0, 1]);
    const r = buildTalkgroupRenumber(afterDeleting(5, 6), 6);
    expect(renumberRxGroupMembers([group], r).groups[0]).toBe(group);
  });
});
