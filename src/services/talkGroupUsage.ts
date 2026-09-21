/**
 * Where each talk group is used, and finding talk groups by search.
 *
 * Nothing answered "which channels transmit on this talk group?" or "which RX
 * groups list it?", and the table had no search, with up to 10,000 rows on a
 * DA-7X2. References follow the same rules as a delete and the write: a channel
 * names its TX contact by 1-based slot (csv/talkGroupImport.ts), and an RX group
 * member is a DMR ID, or a slot where caps.rxGroupMembersBySlot
 * (csv/rxGroupMembers.ts).
 */

import type { Channel, QuickContact, RXGroup } from '../models';
import type { RadioCapabilities } from '../types/radioCapabilities';
import { formatPlural } from '../utils/formatPlural';
import { memberSlotFor } from './csv/rxGroupMembers';

export interface TalkGroupUsage {
  channels: { number: number; name: string }[];
  rxGroups: string[];
}

type ReferenceRules = Pick<RadioCapabilities, 'renumbersTalkGroupRefsOnWrite' | 'rxGroupMembersBySlot'>;

/**
 * The `contactId` a channel holds for this talk group, or undefined where nothing
 * can name it: on a radio whose write renumbers read slots, a talk group added
 * since the read that sits below the slots the read found.
 */
export function channelContactIdFor(
  talkGroup: QuickContact,
  position: number,
  rules: ReferenceRules,
  countAtRead?: number
): number | undefined {
  if (!rules.renumbersTalkGroupRefsOnWrite) {
    return talkGroup.readSlot !== undefined ? talkGroup.readSlot + 1 : talkGroup.index;
  }
  if (countAtRead !== undefined && talkGroup.readSlot !== undefined) return talkGroup.readSlot + 1;
  return countAtRead === undefined || position >= countAtRead ? position + 1 : undefined;
}

export function talkGroupUsage(
  talkGroups: readonly QuickContact[],
  channels: readonly Channel[],
  rxGroups: readonly RXGroup[],
  rules: ReferenceRules,
  countAtRead?: number
): Map<QuickContact, TalkGroupUsage> {
  const channelsByContact = new Map<number, TalkGroupUsage['channels']>();
  for (const ch of channels) {
    if (ch.contactId <= 0) continue;
    const entry = { number: ch.number, name: ch.name };
    const list = channelsByContact.get(ch.contactId);
    if (list) list.push(entry);
    else channelsByContact.set(ch.contactId, [entry]);
  }
  const groupsByMember = new Map<number, string[]>();
  for (const group of rxGroups) {
    for (const member of new Set(group.talkGroupIndices)) {
      const list = groupsByMember.get(member);
      if (list) list.push(group.name);
      else groupsByMember.set(member, [group.name]);
    }
  }

  const usage = new Map<QuickContact, TalkGroupUsage>();
  talkGroups.forEach((talkGroup, position) => {
    const contactId = channelContactIdFor(talkGroup, position, rules, countAtRead);
    const member = rules.rxGroupMembersBySlot
      ? memberSlotFor(talkGroups, talkGroup, countAtRead, position)
      : talkGroup.contactNumber;
    usage.set(talkGroup, {
      channels: (contactId !== undefined && channelsByContact.get(contactId)) || [],
      rxGroups: (member !== undefined && groupsByMember.get(member)) || [],
    });
  });
  return usage;
}

/** "3 channels · 1 RX group" for the table, and the names for its tooltip. */
export function describeTalkGroupUsage(usage: TalkGroupUsage | undefined): { text: string; detail: string } {
  const channels = usage?.channels ?? [];
  const groups = usage?.rxGroups ?? [];
  const parts: string[] = [];
  const lines: string[] = [];
  if (channels.length > 0) {
    parts.push(`${channels.length} ${formatPlural(channels.length, 'channel')}`);
    const more = channels.length > 10 ? `, and ${channels.length - 10} more` : '';
    lines.push(`Channels: ${channels.slice(0, 10).map((c) => `${c.number} ${c.name}`).join(', ')}${more}`);
  }
  if (groups.length > 0) {
    parts.push(`${groups.length} RX ${formatPlural(groups.length, 'group')}`);
    lines.push(`RX groups: ${groups.join(', ')}`);
  }
  return parts.length > 0
    ? { text: parts.join(' · '), detail: lines.join('\n') }
    : { text: '—', detail: 'No channel or RX group uses it.' };
}

const CALL_TYPES: Record<number, string> = { 0x03: 'private call', 0x04: 'group call', 0x05: 'all call' };

/** Whether a talk group matches a lowercased search: its name, the start of its ID, or its call type. */
export function talkGroupMatchesSearch(talkGroup: QuickContact, query: string): boolean {
  if (!query) return true;
  return (
    talkGroup.name.toLowerCase().includes(query) ||
    String(talkGroup.contactNumber).startsWith(query) ||
    (CALL_TYPES[talkGroup.callType] ?? '').startsWith(query)
  );
}
