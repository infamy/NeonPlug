/**
 * RX group members in the one form every radio's CSV can share: talk group DMR IDs.
 *
 * The radios store members differently. The DM-32 stores each member's DMR ID.
 * The DA-7X2 stores the member's talk group SLOT, 0-based, and its talk group
 * table compacts, so slot s is the talk group at position s in the list (see
 * radios/d890uv/talkgroupRenumber.ts). Raw members in a CSV would name
 * different talk groups on each radio, so the CSV always carries DMR IDs, and
 * slot radios convert on the way out and back in.
 */

import type { QuickContact, RXGroup } from '../../models';
import type { LimitCheck } from './importLimits';
import { formatPlural } from '../../utils/formatPlural';

const GROUP_CALL = 0x04;

/** Members as DMR IDs, for export. A slot with no talk group behind it has nothing to name and is left out. */
export function rxGroupsWithDmrIdMembers(
  groups: RXGroup[],
  talkGroups: QuickContact[],
  membersBySlot: boolean
): RXGroup[] {
  if (!membersBySlot) return groups;
  return groups.map((group) => ({
    ...group,
    talkGroupIndices: group.talkGroupIndices.flatMap((slot) => {
      const talkGroup = talkGroups[slot];
      return talkGroup ? [talkGroup.contactNumber] : [];
    }),
  }));
}

/**
 * Members back in the radio's own form, for import. A DMR ID that isn't in the
 * talk group list is reported, and trimming drops it.
 */
export function rxGroupsWithRadioMembers(
  groups: RXGroup[],
  talkGroups: QuickContact[],
  membersBySlot: boolean
): LimitCheck<RXGroup> {
  if (!membersBySlot) return { issues: [], trimmed: groups };
  const issues: string[] = [];
  const trimmed = groups.map((group) => {
    const slots: number[] = [];
    const missing: number[] = [];
    for (const dmrId of group.talkGroupIndices) {
      // A group call first: RX groups receive talk groups, and a private contact
      // can carry the same number.
      let slot = talkGroups.findIndex((tg) => tg.contactNumber === dmrId && tg.callType === GROUP_CALL);
      if (slot < 0) slot = talkGroups.findIndex((tg) => tg.contactNumber === dmrId);
      if (slot < 0) missing.push(dmrId);
      else slots.push(slot);
    }
    if (missing.length > 0) {
      issues.push(
        `RX group "${group.name}" lists ${formatPlural(missing.length, 'talk group')} ${missing.join(', ')}, ` +
          `which ${missing.length === 1 ? "isn't" : "aren't"} in the talk group list. Trimming drops ` +
          `${missing.length === 1 ? 'it' : 'them'}.`
      );
    }
    return { ...group, talkGroupIndices: slots };
  });
  return { issues, trimmed };
}
