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
