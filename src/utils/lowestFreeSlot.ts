/**
 * The lowest slot index not already in use.
 *
 * Record tables on the D890 keep HOLES: deleting an entry clears its presence
 * bit and leaves every survivor where it is, so the number of entries is not the
 * next free slot. A radio holding radio IDs in slots 0, 1 and 3 has three
 * entries — allocating slot 3 for a new one would overwrite `RID Max`, and slot
 * 2 would never be reused.
 *
 * Returns undefined when the table is full, so callers must handle it rather
 * than writing past the end.
 */
export function lowestFreeSlot(used: Iterable<number>, slots: number): number | undefined {
  const taken = used instanceof Set ? used : new Set(used);
  for (let slot = 0; slot < slots; slot += 1) {
    if (!taken.has(slot)) return slot;
  }
  return undefined;
}
