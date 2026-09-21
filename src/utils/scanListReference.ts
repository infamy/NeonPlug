/**
 * The number a channel stores to reference a scan list, and the lookup back.
 *
 * Which number that is belongs to the radio (`caps.scanListsBySlot`), never to
 * whether a list happens to carry a slot. The DA-7X2 references a scan list by
 * its hardware SLOT (a channel's `scanListId` is slot + 1), and its table keeps
 * holes: delete a list and the survivors keep their slots, so a radio holding one
 * list in slot 1 has it at position 0 but referenced as 2. Mapping by position
 * there would label that list missing and, picked from a dropdown, point the
 * channel at the wrong list.
 *
 * The DM-32 writes its lists in order and references them by 1-based position.
 * The editor's add handler still assigns every new list a slot, and the DM-32
 * never reads it, so on the DM-32 a slot must be ignored: after a delete it no
 * longer matches the position the list will be written at.
 */

import type { ScanList } from '../models/ScanList';

export function scanListReference(list: ScanList, index: number, bySlot: boolean): number {
  return bySlot && list.slot !== undefined ? list.slot + 1 : index + 1;
}

export function scanListByReference(
  lists: readonly ScanList[],
  reference: number,
  bySlot: boolean
): ScanList | undefined {
  if (reference <= 0) return undefined;
  return lists.find((list, index) => scanListReference(list, index, bySlot) === reference);
}
