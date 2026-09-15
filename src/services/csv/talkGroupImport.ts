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
}

/**
 * Deleting one talk group, which moves every talk group after it up one slot.
 *
 * As with an import, channels follow their talk group. A radio whose write moves
 * references itself (the DA-7X2) is left to do that; on any other (the DM-32)
 * the channels move here. A channel whose TX contact was the deleted talk group
 * is listed, and on those radios cleared.
 */
export function planTalkGroupDelete(
  channels: readonly Channel[],
  deleted: QuickContact,
  rules: Pick<RadioCapabilities, 'renumbersTalkGroupRefsOnWrite'>
): TalkGroupDeletePlan {
  const slot = slotBefore(deleted);
  const clearedChannels = channels
    .filter((ch) => ch.contactId === slot)
    .map((ch) => ({ number: ch.number, name: ch.name }));
  if (rules.renumbersTalkGroupRefsOnWrite) return { channels: [...channels], clearedChannels };
  const moved = channels.map((ch) =>
    ch.contactId === slot ? { ...ch, contactId: 0 } : ch.contactId > slot ? { ...ch, contactId: ch.contactId - 1 } : ch
  );
  return { channels: moved, clearedChannels };
}

/** The channels a talk group delete touches, for the confirmation. Empty when none use it. */
export function describeTalkGroupDelete(
  plan: TalkGroupDeletePlan,
  rules: Pick<RadioCapabilities, 'renumbersTalkGroupRefsOnWrite'>
): string {
  const n = plan.clearedChannels.length;
  if (n === 0) return '';
  const shown = plan.clearedChannels.slice(0, 5).map((c) => `${c.number} ${c.name}`).join(', ');
  const more = n > 5 ? `, and ${n - 5} more` : '';
  const cleared = rules.renumbersTalkGroupRefsOnWrite ? '' : ` ${n === 1 ? 'It' : 'They'} will have no TX contact.`;
  return `${n} ${formatPlural(n, 'channel')} ${formatPlural(n, 'uses', 'use')} it: ${shown}${more}.${cleared}`;
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
