/**
 * Replacing the talk group list from a CSV without breaking what points at it.
 *
 * Channels, and the DA-7X2's RX group members, reference talk groups by SLOT:
 * their position in the list. A file that reorders the list, or leaves a talk
 * group out, would move those references onto other talk groups. So each row is
 * matched to a talk group already in the list by DMR ID and call type, and a
 * reference follows the talk group it named:
 *
 *   - On a radio whose write moves references itself (the DA-7X2, see
 *     `renumbersTalkGroupRefsOnWrite`), a match keeps its `readSlot` and the
 *     write does the rest. Keeping `readSlot` also lets that write patch the
 *     record it read instead of building a new one.
 *   - Any other radio (the DM-32) has its references moved here.
 *
 * A reference to a talk group the file leaves out has nothing to follow. It is
 * reported, so the import can ask first, and cleared when the import goes ahead.
 */

import type { Channel, QuickContact, RXGroup } from '../../models';
import type { RadioCapabilities } from '../../types/radioCapabilities';
import { formatPlural } from '../../utils/formatPlural';

export interface TalkGroupImportPlan {
  talkGroups: QuickContact[];
  channels: Channel[];
  rxGroups: RXGroup[];
  /** Channels whose talk group the file leaves out. Their TX contact is cleared. */
  clearedChannels: { number: number; name: string }[];
  /** RX group members whose talk group the file leaves out. They are removed. */
  removedMembers: { group: string; talkGroup: string }[];
}

type ReferenceRules = Pick<RadioCapabilities, 'renumbersTalkGroupRefsOnWrite' | 'rxGroupMembersBySlot'>;

/** The slot a talk group held before the import, 1-based like `Channel.contactId`. */
const slotBefore = (tg: QuickContact) => (tg.readSlot !== undefined ? tg.readSlot + 1 : tg.index);

export function planTalkGroupImport(
  existing: readonly QuickContact[],
  imported: readonly QuickContact[],
  channels: readonly Channel[],
  rxGroups: readonly RXGroup[],
  rules: ReferenceRules
): TalkGroupImportPlan {
  // Each row takes the first talk group not yet matched that has its DMR ID and call type.
  const unmatched = [...existing];
  const slotAfter = new Map<QuickContact, number>();
  const talkGroups = imported.map((row, i): QuickContact => {
    const index = i + 1;
    const at = unmatched.findIndex((tg) => tg.contactNumber === row.contactNumber && tg.callType === row.callType);
    if (at < 0) return { ...row, index };
    const [tg] = unmatched.splice(at, 1);
    slotAfter.set(tg, index);
    return { ...row, index, flag: tg.flag, rawData: tg.rawData, ...(tg.readSlot !== undefined && { readSlot: tg.readSlot }) };
  });

  const before = new Map<number, QuickContact>();
  for (const tg of existing) before.set(slotBefore(tg), tg);

  const clearedChannels: TalkGroupImportPlan['clearedChannels'] = [];
  const outChannels = channels.map((ch) => {
    const tg = ch.contactId > 0 ? before.get(ch.contactId) : undefined;
    if (!tg) return ch;
    const slot = slotAfter.get(tg);
    if (slot === undefined) {
      clearedChannels.push({ number: ch.number, name: ch.name });
      return { ...ch, contactId: 0 };
    }
    return rules.renumbersTalkGroupRefsOnWrite || slot === ch.contactId ? ch : { ...ch, contactId: slot };
  });

  const removedMembers: TalkGroupImportPlan['removedMembers'] = [];
  const outGroups = !rules.rxGroupMembersBySlot
    ? [...rxGroups]
    : rxGroups.map((group) => {
        // Members are 0-based slots on these radios.
        const members: number[] = [];
        for (const member of group.talkGroupIndices) {
          const tg = before.get(member + 1);
          const slot = tg ? slotAfter.get(tg) : undefined;
          if (!tg) members.push(member);
          else if (slot === undefined) removedMembers.push({ group: group.name, talkGroup: tg.name });
          else members.push(rules.renumbersTalkGroupRefsOnWrite ? member : slot - 1);
        }
        const same =
          members.length === group.talkGroupIndices.length && members.every((m, i) => m === group.talkGroupIndices[i]);
        return same ? group : { ...group, talkGroupIndices: members };
      });

  return { talkGroups, channels: outChannels, rxGroups: outGroups, clearedChannels, removedMembers };
}

export interface TalkGroupDeletePlan {
  channels: Channel[];
  /** Channels whose TX contact is the deleted talk group. */
  clearedChannels: { number: number; name: string }[];
  /** Whether those channels are set to no TX contact here, rather than left for the write. */
  contactsCleared: boolean;
  /** RX groups after the delete, where members are talk group slots that follow it here. */
  rxGroups?: RXGroup[];
  /** RX groups the deleted talk group is taken out of. */
  leftGroups?: string[];
  /** References the delete pushed below the read's slots, where they can't be named, so cleared. */
  unplaceable?: { what: string; talkGroup: string }[];
}

export interface TalkGroupDeleteContext {
  /** The talk groups before the delete, in order, the deleted one among them. */
  talkGroups: readonly QuickContact[];
  rxGroups: readonly RXGroup[];
  /** How many talk groups the read found (`talkgroupCountAtRead`); undefined without a read. */
  countAtRead?: number;
}

/**
 * Deleting one talk group, which moves every talk group after it up one slot.
 *
 * As with an import, references follow their talk group. On the DM-32 the
 * channels move here. A radio whose write moves references itself (the DA-7X2)
 * renumbers what names a talk group by the slot it was READ from, but not what
 * names one by its position: a talk group added since the read, or any when there
 * was no read (see rxGroupMembers.ts). Those references move here, channels and
 * RX group members alike, or they would land on the talk group after. One pushed
 * down among the read's slots can't be named until the radio is written and read
 * again, so it is cleared and reported.
 */
export function planTalkGroupDelete(
  channels: readonly Channel[],
  deleted: QuickContact,
  rules: Pick<RadioCapabilities, 'renumbersTalkGroupRefsOnWrite' | 'rxGroupMembersBySlot'>,
  context?: TalkGroupDeleteContext
): TalkGroupDeletePlan {
  if (!rules.renumbersTalkGroupRefsOnWrite || !context) {
    const slot = slotBefore(deleted);
    const clearedChannels = channels
      .filter((ch) => ch.contactId === slot)
      .map((ch) => ({ number: ch.number, name: ch.name }));
    if (rules.renumbersTalkGroupRefsOnWrite) return { channels: [...channels], clearedChannels, contactsCleared: false };
    const moved = channels.map((ch) =>
      ch.contactId === slot ? { ...ch, contactId: 0 } : ch.contactId > slot ? { ...ch, contactId: ch.contactId - 1 } : ch
    );
    return { channels: moved, clearedChannels, contactsCleared: true };
  }

  const { talkGroups, countAtRead } = context;
  const position = talkGroups.indexOf(deleted);
  const readSlot = countAtRead !== undefined ? deleted.readSlot : undefined;
  const nameAt = (ref: number) => talkGroups[ref]?.name ?? `slot ${ref + 1}`;
  // A 0-based reference names a talk group by position when there was no read,
  // or past the slots the read found. Below them it is a read slot, the write's.
  const byPosition = (ref: number) => countAtRead === undefined || ref >= countAtRead;

  const clearedChannels: TalkGroupDeletePlan['clearedChannels'] = [];
  const unplaceable: NonNullable<TalkGroupDeletePlan['unplaceable']> = [];
  let contactsCleared = false;
  const outChannels = channels.map((ch) => {
    if (ch.contactId <= 0) return ch;
    const ref = ch.contactId - 1;
    if (!byPosition(ref)) {
      // The write renumbers this, and refuses one whose talk group is gone.
      if (ref === readSlot) clearedChannels.push({ number: ch.number, name: ch.name });
      return ch;
    }
    if (ref < position) return ch;
    if (ref === position) {
      clearedChannels.push({ number: ch.number, name: ch.name });
      contactsCleared = true;
      return { ...ch, contactId: 0 };
    }
    if (byPosition(ref - 1)) return { ...ch, contactId: ref };
    unplaceable.push({ what: `channel ${ch.number} ${ch.name}`, talkGroup: nameAt(ref) });
    return { ...ch, contactId: 0 };
  });

  const leftGroups: string[] = [];
  const rxGroups = rules.rxGroupMembersBySlot
    ? context.rxGroups.map((group) => {
        const members: number[] = [];
        for (const ref of group.talkGroupIndices) {
          if (!byPosition(ref) || ref < position) members.push(ref);
          else if (ref === position) leftGroups.push(group.name);
          else if (byPosition(ref - 1)) members.push(ref - 1);
          else unplaceable.push({ what: `RX group "${group.name}"`, talkGroup: nameAt(ref) });
        }
        const same =
          members.length === group.talkGroupIndices.length && members.every((m, i) => m === group.talkGroupIndices[i]);
        return same ? group : { ...group, talkGroupIndices: members };
      })
    : undefined;

  return { channels: outChannels, clearedChannels, contactsCleared, rxGroups, leftGroups, unplaceable };
}

/** What a talk group delete touches, for the confirmation. Empty when nothing uses it. */
export function describeTalkGroupDelete(plan: TalkGroupDeletePlan): string {
  const sentences: string[] = [];
  const n = plan.clearedChannels.length;
  if (n > 0) {
    const shown = plan.clearedChannels.slice(0, 5).map((c) => `${c.number} ${c.name}`).join(', ');
    const more = n > 5 ? `, and ${n - 5} more` : '';
    const cleared = plan.contactsCleared ? ` ${n === 1 ? 'It' : 'They'} will have no TX contact.` : '';
    sentences.push(`${n} ${formatPlural(n, 'channel')} ${formatPlural(n, 'uses', 'use')} it: ${shown}${more}.${cleared}`);
  }
  const groups = plan.leftGroups ?? [];
  if (groups.length > 0) {
    sentences.push(`It is taken out of ${formatPlural(groups.length, 'RX group')} ${groups.join(', ')}.`);
  }
  const lost = plan.unplaceable ?? [];
  if (lost.length > 0) {
    const shown = lost.slice(0, 5).map((u) => `${u.what} (${u.talkGroup})`).join(', ');
    const more = lost.length > 5 ? `, and ${lost.length - 5} more` : '';
    sentences.push(
      `Talk groups added since the last read can't be named below the slots that read found, so ` +
        `${lost.length === 1 ? 'this loses its talk group' : 'these lose their talk groups'} until the radio is ` +
        `written and read again: ${shown}${more}.`
    );
  }
  return sentences.join(' ');
}

/** What going ahead would clear or remove, for the confirmation. Empty when nothing. */
export function describeTalkGroupImportLosses(plan: TalkGroupImportPlan): string {
  const some = <T>(items: T[], show: (item: T) => string) =>
    items.slice(0, 5).map(show).join(', ') + (items.length > 5 ? `, and ${items.length - 5} more` : '');
  const lines: string[] = [];
  const channels = plan.clearedChannels.length;
  if (channels > 0) {
    lines.push(
      `${channels} ${formatPlural(channels, 'channel')} ${formatPlural(channels, 'uses', 'use')} a talk group the file ` +
        `leaves out, and will have no TX contact: ${some(plan.clearedChannels, (c) => `${c.number} ${c.name}`)}.`
    );
  }
  const members = plan.removedMembers.length;
  if (members > 0) {
    lines.push(
      `${members} RX group ${formatPlural(members, 'member')} ${formatPlural(members, 'names', 'name')} a talk group the ` +
        `file leaves out, and will be removed: ${some(plan.removedMembers, (m) => `${m.talkGroup} from ${m.group}`)}.`
    );
  }
  return lines.join('\n\n');
}
