/**
 * Deleting a broadcast memory, with the references that point at it.
 *
 * AM/FM channel indices are hardware SLOTS, not display numbers: the record's
 * address is derived from its index, an AM zone's members are absolute indices
 * into this table, and so is its `currentChannel`. Closing the gap after a
 * delete is therefore only safe if every reference moves in the same step.
 *
 * Doing the shift without the remap would leave each zone naming the station
 * one slot along — silently, and indistinguishable from correct until someone
 * keyed up. That is the same class of failure as the AM-001 pointer found on
 * hardware 2026-09-03, where a zone aimed at a DELETED slot displayed the
 * leftover name still sitting in those bytes.
 *
 * Rewriting the whole table costs ~1.8 KB for a full airband list, which is
 * nothing beside a 138 KB codeplug write — so the gap is not worth keeping.
 */

import type { D890BroadcastChannel } from './broadcastChannels';
import type { D890AmZone } from './amZones';

export interface BroadcastDeleteResult {
  channels: D890BroadcastChannel[];
  zones: D890AmZone[];
  /** Old index -> new index for every channel that survived. */
  remap: Map<number, number>;
}

/**
 * Remove `index`, renumber what remains from 0, and move every reference with it.
 *
 * `zones` may be empty for FM, which has no zone table.
 */
export function deleteBroadcastChannel(
  all: readonly D890BroadcastChannel[],
  index: number,
  zones: readonly D890AmZone[] = []
): BroadcastDeleteResult {
  return deleteBroadcastChannels(all, new Set([index]), zones);
}

/**
 * Remove SEVERAL channels in one step.
 *
 * Deliberately not a loop over the single-delete: each delete compacts, so the
 * second index in a sequence would name a different channel from the one the
 * user picked. Removing the whole set first and renumbering once is the only
 * way selection order cannot change the outcome.
 */
export function deleteBroadcastChannels(
  all: readonly D890BroadcastChannel[],
  indices: ReadonlySet<number>,
  zones: readonly D890AmZone[] = []
): BroadcastDeleteResult {
  const remaining = all
    .filter((c) => !indices.has(c.index))
    .sort((a, b) => a.index - b.index);

  const remap = new Map<number, number>();
  const channels = remaining.map((c, i) => {
    remap.set(c.index, i);
    return { ...c, index: i };
  });

  const remapped = zones.map((z) => {
    const members = z.members
      .map((m) => remap.get(m))
      .filter((m): m is number => m !== undefined);
    // A zone pointing AT the deleted channel has nothing to remap to. Fall back
    // to a member that still exists rather than leaving it aimed at a slot
    // whose bytes now belong to a different station.
    const current = remap.get(z.currentChannel);
    return { ...z, members, currentChannel: current ?? members[0] ?? 0 };
  });

  return { channels, zones: remapped, remap };
}
