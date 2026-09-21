/**
 * Radio limits for a list an import is about to put in place.
 *
 * Each check returns the problems it found and the list trimmed to fit, so the
 * import can warn and let the user trim and continue, or abort. They run on the
 * list that would result, after Add or Replace, because adding can push a list
 * past a limit that neither the file nor the current list breaks on its own.
 */

import type { Channel, Contact, Zone, ScanList, RXGroup, DMRRadioID, QuickContact } from '../../models';
import type { RadioCapabilities } from '../../types/radioCapabilities';
import { formatPlural } from '../../utils/formatPlural';

export interface LimitCheck<T> {
  /** One sentence per problem. Empty when the list fits. */
  issues: string[];
  /** The list cut down to fit. Unchanged when there are no issues. */
  trimmed: T[];
}

type Caps = RadioCapabilities | null | undefined;

function capCount<T>(list: T[], max: number | undefined, noun: string, issues: string[]): T[] {
  if (max === undefined || list.length <= max) return list;
  const over = list.length - max;
  issues.push(
    `${list.length} ${formatPlural(list.length, noun)}, but the radio holds ${max}. ` +
      `Trimming drops the last ${over}.`
  );
  return list.slice(0, max);
}

export function checkChannelLimits(channels: Channel[], caps: Caps): LimitCheck<Channel> {
  const issues: string[] = [];
  return { issues, trimmed: capCount(channels, caps?.maxChannels, 'channel', issues) };
}

export function checkZoneLimits(zones: Zone[], caps: Caps): LimitCheck<Zone> {
  const issues: string[] = [];
  const perZone = caps?.maxZoneChannels;
  const trimmed = capCount(zones, caps?.maxZones, 'zone', issues).map((zone) => {
    if (perZone === undefined || zone.channels.length <= perZone) return zone;
    issues.push(
      `Zone "${zone.name}" has ${zone.channels.length} channels, but a zone holds ${perZone}. ` +
        `Trimming keeps the first ${perZone}.`
    );
    return { ...zone, channels: zone.channels.slice(0, perZone) };
  });
  return { issues, trimmed };
}

export function checkScanListLimits(scanLists: ScanList[], caps: Caps): LimitCheck<ScanList> {
  const issues: string[] = [];
  const perList = caps?.maxScanListChannels;
  const trimmed = capCount(scanLists, caps?.maxScanLists, 'scan list', issues).map((list) => {
    let next = list;
    if (perList !== undefined && next.channels.length > perList) {
      issues.push(
        `Scan list "${list.name}" has ${list.channels.length} channels, but a scan list holds ${perList}. ` +
          `Trimming keeps the first ${perList}.`
      );
      next = { ...next, channels: next.channels.slice(0, perList) };
    }
    // The DM-32 discards a priority channel that isn't a member. Checked after
    // the trim above, which can remove one.
    if (caps?.scanListPriorityMembersOnly) {
      const outside = (type: number | undefined, channel: number | undefined) =>
        type === 2 && channel !== undefined && !next.channels.includes(channel);
      if (outside(next.priority1Type, next.priorityChannel1)) {
        issues.push(
          `Scan list "${list.name}": priority channel 1 (channel ${next.priorityChannel1}) isn't in the list, ` +
            `so the radio would ignore it. Trimming clears it.`
        );
        next = { ...next, priority1Type: 0, priorityChannel1: undefined };
      }
      if (outside(next.priority2Type, next.priorityChannel2)) {
        issues.push(
          `Scan list "${list.name}": priority channel 2 (channel ${next.priorityChannel2}) isn't in the list, ` +
            `so the radio would ignore it. Trimming clears it.`
        );
        next = { ...next, priority2Type: 0, priorityChannel2: undefined };
      }
    }
    return next;
  });
  return { issues, trimmed };
}

export function checkRxGroupLimits(groups: RXGroup[], caps: Caps): LimitCheck<RXGroup> {
  const issues: string[] = [];
  const perGroup = caps?.maxRxGroupMembers;
  const trimmed = capCount(groups, caps?.digital?.limits?.RX_GROUPS_MAX, 'RX group', issues).map((group) => {
    if (perGroup === undefined || group.talkGroupIndices.length <= perGroup) return group;
    issues.push(
      `RX group "${group.name}" has ${group.talkGroupIndices.length} members, but a group holds ${perGroup}. ` +
        `Trimming keeps the first ${perGroup}.`
    );
    return { ...group, talkGroupIndices: group.talkGroupIndices.slice(0, perGroup) };
  });
  return { issues, trimmed };
}

export function checkRadioIdLimits(radioIds: DMRRadioID[], caps: Caps): LimitCheck<DMRRadioID> {
  const issues: string[] = [];
  return { issues, trimmed: capCount(radioIds, caps?.maxRadioIds, 'radio ID', issues) };
}

export function checkTalkGroupLimits(talkGroups: QuickContact[], caps: Caps): LimitCheck<QuickContact> {
  const issues: string[] = [];
  return { issues, trimmed: capCount(talkGroups, caps?.maxTalkGroups, 'talk group', issues) };
}

/** Contacts take a capacity rather than caps: a radio's own read can report more than its model default. */
export function checkContactLimits(contacts: Contact[], capacity: number | undefined): LimitCheck<Contact> {
  const issues: string[] = [];
  return { issues, trimmed: capCount(contacts, capacity, 'contact', issues) };
}
