/**
 * RX group members in the one form every radio's CSV can share: talk group DMR IDs.
 *
 * The radios store members differently. The DM-32 stores each member's DMR ID.
 * The DA-7X2 stores the member's talk group SLOT, 0-based, and its talk group
 * table compacts, so a delete moves the talk groups after it (see
 * radios/d890uv/talkgroupRenumber.ts). Raw members in a CSV would name
 * different talk groups on each radio, so the CSV always carries DMR IDs, and
 * slot radios convert on the way out and back in.
 */

import type { QuickContact, RXGroup } from '../../models';
import type { LimitCheck } from './importLimits';
import { formatPlural } from '../../utils/formatPlural';

const GROUP_CALL = 0x04;

/**
 * The slot a slot radio's RX group stores for a talk group: the one its write expects.
 *
 * After a read, a member names the slot its talk group was READ from
 * (`readSlot`), and the write moves it to follow the talk group when a delete
 * compacts the table. A talk group added since has no read slot, so it is named
 * by its position, which the write leaves alone only past the slots the read
 * found. A new talk group below that has no slot the write would keep, and gets
 * none.
 *
 * `countAtRead` is how many talk groups the read found. Without one, as for a
 * codeplug opened from a file, the write moves nothing and a slot is a position.
 */
export function memberSlotFor(
  talkGroups: readonly QuickContact[],
  talkGroup: QuickContact,
  countAtRead?: number
): number | undefined {
  if (countAtRead !== undefined && talkGroup.readSlot !== undefined) return talkGroup.readSlot;
  const position = talkGroups.indexOf(talkGroup);
  if (position < 0) return undefined;
  return countAtRead === undefined || position >= countAtRead ? position : undefined;
}

/** The talk group a slot radio's RX group member names, or undefined when it is gone. */
export function talkGroupForMemberSlot(
  talkGroups: readonly QuickContact[],
  slot: number,
  countAtRead?: number
): QuickContact | undefined {
  if (countAtRead === undefined) return talkGroups[slot];
  if (slot < countAtRead) return talkGroups.find((tg) => tg.readSlot === slot);
  const talkGroup = talkGroups[slot];
  return talkGroup?.readSlot === undefined ? talkGroup : undefined;
}

/** Members as DMR IDs, for export. A slot with no talk group behind it has nothing to name and is left out. */
export function rxGroupsWithDmrIdMembers(
  groups: RXGroup[],
  talkGroups: QuickContact[],
  membersBySlot: boolean,
  countAtRead?: number
): RXGroup[] {
  if (!membersBySlot) return groups;
  return groups.map((group) => ({
    ...group,
    talkGroupIndices: group.talkGroupIndices.flatMap((slot) => {
      const talkGroup = talkGroupForMemberSlot(talkGroups, slot, countAtRead);
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
  membersBySlot: boolean,
  countAtRead?: number
): LimitCheck<RXGroup> {
  if (!membersBySlot) return { issues: [], trimmed: groups };
  const issues: string[] = [];
  const trimmed = groups.map((group) => {
    const slots: number[] = [];
    const missing: number[] = [];
    const unplaceable: number[] = [];
    for (const dmrId of group.talkGroupIndices) {
      // A group call first: RX groups receive talk groups, and a private contact
      // can carry the same number.
      const talkGroup =
        talkGroups.find((tg) => tg.contactNumber === dmrId && tg.callType === GROUP_CALL) ??
        talkGroups.find((tg) => tg.contactNumber === dmrId);
      const slot = talkGroup ? memberSlotFor(talkGroups, talkGroup, countAtRead) : undefined;
      if (!talkGroup) missing.push(dmrId);
      else if (slot === undefined) unplaceable.push(dmrId);
      else slots.push(slot);
    }
    if (missing.length > 0) {
      issues.push(
        `RX group "${group.name}" lists ${formatPlural(missing.length, 'talk group')} ${missing.join(', ')}, ` +
          `which ${missing.length === 1 ? "isn't" : "aren't"} in the talk group list. Trimming drops ` +
          `${missing.length === 1 ? 'it' : 'them'}.`
      );
    }
    if (unplaceable.length > 0) {
      issues.push(
        `RX group "${group.name}" lists ${formatPlural(unplaceable.length, 'talk group')} ${unplaceable.join(', ')}, ` +
          'added after talk groups were deleted, which an RX group can only take once the radio is written and ' +
          `read again. Trimming drops ${unplaceable.length === 1 ? 'it' : 'them'}.`
      );
    }
    return { ...group, talkGroupIndices: slots };
  });
  return { issues, trimmed };
}
