/**
 * Renumbering the references into a compacting talk group table.
 *
 * Talk groups COMPACT — measured from the vendor CPS on 2026-09-10 by clearing
 * one row and diffing the write it produced: 500 records shifted down by one,
 * the LAST slot was freed, and the locator lost its final entry. The table
 * always occupies 0..N-1 with no holes.
 *
 * Compaction is only half of a delete. Two things reference a talk group BY
 * SLOT, and both move with it:
 *
 *   - a channel's TX contact — u32 at channel `+0x14`, 0-based on the wire and
 *     1-based in `Channel.contactId` (0 = none)
 *   - a receive group's members — `RXGroup.talkGroupIndices`, raw 0-based slots
 *     (the model's "DMR IDs" comment is wrong; a real radio reads 0 and 1, and
 *     `applyRxGroupToRecord` writes them back unchanged)
 *
 * Leave them alone and a channel pointing at talk group 600 transmits on 601's
 * after a delete below it. That codeplug reads back CLEAN, which makes it a
 * worse failure than refusing the write.
 *
 * ⚠️ Whether the vendor CPS renumbers is UNKNOWN. The capture pair cannot say:
 * every channel on that radio references slot 0, so nothing sat above the shift
 * point and the CPS had no opportunity to show us. It does not change what is
 * correct here — references are slot-based and the table compacts.
 */

import type { Channel } from '../../models/Channel';
import type { RXGroup } from '../../models/RXGroup';

export interface TalkgroupRenumber {
  /** Old slot -> new slot, for every talk group that survived. */
  moved: ReadonlyMap<number, number>;
  /** Old slots that no longer exist. */
  deleted: readonly number[];
}

/**
 * Work out what moved where.
 *
 * The old slot set is `0..countAtRead-1` and not a stored list, because the
 * table cannot have holes — that is the whole point of compaction. A talk group
 * with no `readSlot` is one the user just added; it cannot be the target of a
 * reference that predates it, so it contributes nothing here.
 */
export function buildTalkgroupRenumber(
  contacts: readonly { readSlot?: number }[],
  countAtRead: number
): TalkgroupRenumber {
  const moved = new Map<number, number>();
  contacts.forEach((c, position) => {
    if (c.readSlot !== undefined) moved.set(c.readSlot, position);
  });
  const deleted: number[] = [];
  for (let slot = 0; slot < countAtRead; slot += 1) {
    if (!moved.has(slot)) deleted.push(slot);
  }
  return { moved, deleted };
}

/** True when nothing actually moved and nothing was removed. */
export function isNoOpRenumber(r: TalkgroupRenumber): boolean {
  return r.deleted.length === 0 && [...r.moved].every(([from, to]) => from === to);
}

export interface ChannelRenumberResult {
  channels: Channel[];
  /** Channels whose TX contact pointed at a talk group that no longer exists. */
  dangling: { number: number; name: string; slot: number }[];
}

/**
 * Move every channel's TX contact to follow its talk group.
 *
 * `contactId` is 1-based with 0 meaning none, so the slot is `contactId - 1`.
 * A channel pointing at a DELETED talk group is reported rather than silently
 * cleared: "no TX contact" changes what the radio does on that channel, and
 * that is the user's call, not this function's.
 */
export function renumberChannelContacts(
  channels: readonly Channel[],
  r: TalkgroupRenumber
): ChannelRenumberResult {
  const gone = new Set(r.deleted);
  const dangling: ChannelRenumberResult['dangling'] = [];
  const out = channels.map((ch) => {
    const id = ch.contactId ?? 0;
    if (id <= 0) return ch;
    const slot = id - 1;
    if (gone.has(slot)) {
      dangling.push({ number: ch.number, name: ch.name ?? '', slot });
      return ch;
    }
    const to = r.moved.get(slot);
    if (to === undefined || to === slot) return ch;
    return { ...ch, contactId: to + 1 };
  });
  return { channels: out, dangling };
}

export interface RxGroupRenumberResult {
  groups: RXGroup[];
  /** Members that pointed at a talk group that no longer exists. */
  dangling: { group: string; slot: number }[];
}

/**
 * The same for receive group members, which are raw 0-based slots.
 *
 * A member whose talk group is gone is DROPPED from the list rather than
 * reported for confirmation — unlike a channel's TX contact, a receive group is
 * a set, and removing one entry from it does not change what the other entries
 * do. It is still reported so the caller can say so.
 */
export function renumberRxGroupMembers(
  groups: readonly RXGroup[],
  r: TalkgroupRenumber
): RxGroupRenumberResult {
  const gone = new Set(r.deleted);
  const dangling: RxGroupRenumberResult['dangling'] = [];
  const out = groups.map((g) => {
    const members = g.talkGroupIndices ?? [];
    const next: number[] = [];
    for (const slot of members) {
      if (gone.has(slot)) {
        dangling.push({ group: g.name, slot });
        continue;
      }
      next.push(r.moved.get(slot) ?? slot);
    }
    const unchanged =
      next.length === members.length && next.every((v, i) => v === members[i]);
    return unchanged ? g : { ...g, talkGroupIndices: next };
  });
  return { groups: out, dangling };
}
