import type { Channel } from '../../models/Channel';

/** Item shape consumed by OrderedItemPicker. */
export interface PickerItem {
  /** Stable identity as stored in the parent's ordered id list */
  id: number;
  /** Row/button label, e.g. "5: VE7RAG" */
  label: string;
  /** Extra text matched by the search box (label is always matched) */
  searchText?: string;
}

/**
 * A zone's or scan list's channels for its row in the list, by name:
 * "1 Local Rptr, 2 Simplex, 3 Airport +61 more". The rows showed bare numbers.
 */
export function channelListPreview(
  numbers: readonly number[],
  names: ReadonlyMap<number, string>,
  shown = 3
): string {
  const label = (n: number) => {
    const name = names.get(n);
    return name ? `${n} ${name}` : `${n}`;
  };
  const more = numbers.length - shown;
  return numbers.slice(0, shown).map(label).join(', ') + (more > 0 ? ` +${more} more` : '');
}

/** Build a PickerItem for a channel (shared by zone and scan list editors). */
export function channelPickerItem(ch: Channel): PickerItem {
  return {
    id: ch.number,
    label: `${ch.number}: ${ch.name}`,
    searchText: [
      ch.number,
      ch.name,
      ch.rxFrequency.toFixed(4),
      ch.txFrequency.toFixed(4),
      ch.mode,
      ch.bandwidth,
      ch.power,
    ].join(' '),
  };
}
