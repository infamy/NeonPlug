import React, { useState } from 'react';
import { formatPlural } from '../../utils/formatPlural';
import type { PickerItem } from './pickerItems';

/**
 * OrderedItemPicker — the shared "ordered selected list + searchable available
 * list" editor used by zones, scan lists, and RX groups.
 *
 * Ordering semantics (the reason this component exists — keep them):
 * - Add APPENDS to the end. The list order is what gets written to the radio
 *   (knob/scan order), so adding must never re-sort a manually arranged list.
 * - Reorder/remove/add all operate on the RESOLVED list and write back its ids.
 *   A stored id that no longer resolves (stale reference from an import or an
 *   old codeplug) is therefore dropped on the first edit, and reorder indices
 *   always match the rows on screen.
 */

interface OrderedItemPickerProps {
  /** Ordered ids as stored; may contain ids that no longer resolve */
  selectedIds: number[];
  /** Addable items, in display order (exclude already-selected + domain filtering) */
  availableItems: PickerItem[];
  /** Resolve a stored id for display; return undefined for stale references */
  resolveItem: (id: number) => PickerItem | undefined;
  onChange: (ids: number[]) => void;
  maxItems: number;
  /** e.g. 'channel', 'talk group' */
  itemNoun: string;
  /** e.g. 'zone', 'scan list', 'RX group' */
  containerNoun: string;
  onAlert: (message: string) => void;
  /** Stretch to fill the parent column (zone editor layout) */
  fillHeight?: boolean;
  /** Disable the root padding when nested in an already-padded container */
  padded?: boolean;
  /** Optional per-row controls rendered next to the reorder buttons
      (e.g. the scan list's priority toggles) */
  renderRowExtras?: (id: number) => React.ReactNode;
}

export const OrderedItemPicker: React.FC<OrderedItemPickerProps> = ({
  selectedIds,
  availableItems,
  resolveItem,
  onChange,
  maxItems,
  itemNoun,
  containerNoun,
  onAlert,
  fillHeight = false,
  padded = true,
  renderRowExtras,
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  const itemNounPlural = formatPlural(2, itemNoun);
  const resolved = selectedIds
    .map(id => resolveItem(id))
    .filter((item): item is PickerItem => item !== undefined);
  const staleCount = selectedIds.length - resolved.length;
  const resolvedIds = resolved.map(item => item.id);

  const handleAdd = (id: number) => {
    if (selectedIds.length >= maxItems) {
      onAlert(`Maximum of ${maxItems} ${itemNounPlural} per ${containerNoun} allowed.`);
      return;
    }
    if (!resolvedIds.includes(id)) {
      onChange([...resolvedIds, id]);
    }
  };

  const handleRemove = (id: number) => {
    onChange(resolvedIds.filter(existing => existing !== id));
  };

  const handleReorder = (fromIndex: number, toIndex: number) => {
    const next = [...resolvedIds];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    onChange(next);
  };

  const query = searchQuery.toLowerCase().trim();
  const filteredAvailable = query
    ? availableItems.filter(
        item =>
          item.label.toLowerCase().includes(query) ||
          item.searchText?.toLowerCase().includes(query)
      )
    : availableItems;

  return (
    <div className={`${padded ? 'p-4 ' : ''}space-y-4 ${fillHeight ? 'flex flex-col h-full' : ''}`}>
      <div className={fillHeight ? 'flex-shrink-0' : ''}>
        <h4 className="text-white font-medium mb-2">
          {`${itemNounPlural.charAt(0).toUpperCase()}${itemNounPlural.slice(1)}`} in{' '}
          {containerNoun} ({selectedIds.length}/{maxItems})
        </h4>
        {staleCount > 0 && (
          <p className="text-yellow-400 text-xs mb-2">
            {staleCount} {formatPlural(staleCount, 'entry', 'entries')} no longer{' '}
            {staleCount === 1 ? 'resolves' : 'resolve'} and will be removed on the next edit.
          </p>
        )}
        {selectedIds.length === 0 ? (
          <p className="text-cool-gray text-sm">No {itemNounPlural} in this {containerNoun}</p>
        ) : (
          <div className={`space-y-1 overflow-y-auto ${fillHeight ? 'max-h-96' : 'max-h-64'}`}>
            {resolved.map((item, index) => (
              <div
                key={item.id}
                className="px-3 py-2 bg-neon-cyan bg-opacity-10 border border-neon-cyan border-opacity-30 rounded flex items-center justify-between hover:bg-opacity-20"
              >
                <div className="flex items-center gap-2">
                  <span className="text-cool-gray text-xs w-8">{index + 1}.</span>
                  <span className="text-white text-xs">{item.label}</span>
                </div>
                <div className="flex gap-1 items-center">
                  {renderRowExtras?.(item.id)}
                  {index > 0 && (
                    <button
                      onClick={() => handleReorder(index, index - 1)}
                      className="px-2 py-1 bg-deep-gray border border-neon-cyan border-opacity-30 rounded text-neon-cyan text-xs hover:bg-opacity-50"
                      title="Move up"
                    >
                      ↑
                    </button>
                  )}
                  {index < resolved.length - 1 && (
                    <button
                      onClick={() => handleReorder(index, index + 1)}
                      className="px-2 py-1 bg-deep-gray border border-neon-cyan border-opacity-30 rounded text-neon-cyan text-xs hover:bg-opacity-50"
                      title="Move down"
                    >
                      ↓
                    </button>
                  )}
                  <button
                    onClick={() => handleRemove(item.id)}
                    className="px-2 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className={fillHeight ? 'flex-1 flex flex-col min-h-0' : ''}>
        <h4 className={`text-white font-medium mb-2 ${fillHeight ? 'flex-shrink-0' : ''}`}>
          Available {`${itemNounPlural.charAt(0).toUpperCase()}${itemNounPlural.slice(1)}`} (
          {filteredAvailable.length} of {availableItems.length})
        </h4>
        {availableItems.length === 0 ? (
          <p className="text-cool-gray text-sm">All {itemNounPlural} are in this {containerNoun}</p>
        ) : selectedIds.length >= maxItems ? (
          <p className="text-cool-gray text-sm">
            {`${containerNoun.charAt(0).toUpperCase()}${containerNoun.slice(1)}`} is full ({maxItems}{' '}
            {itemNounPlural} maximum)
          </p>
        ) : (
          <>
            <div className={`mb-3 ${fillHeight ? 'flex-shrink-0' : ''}`}>
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={`Search ${itemNounPlural}...`}
                  className="w-full bg-transparent border border-neon-cyan border-opacity-30 rounded px-3 py-1.5 pl-9 text-white text-xs focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan"
                />
                <span className="absolute left-2.5 top-1/2 transform -translate-y-1/2 text-cool-gray text-xs">
                  🔍
                </span>
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 transform -translate-y-1/2 text-cool-gray hover:text-white text-sm"
                    title="Clear search"
                  >
                    ×
                  </button>
                )}
              </div>
            </div>
            {filteredAvailable.length === 0 ? (
              <p className="text-cool-gray text-sm">No {itemNounPlural} match your search</p>
            ) : (
              <div
                className={`flex flex-wrap gap-2 overflow-y-auto ${
                  fillHeight ? 'flex-1 min-h-0' : 'max-h-64'
                }`}
              >
                {filteredAvailable.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => handleAdd(item.id)}
                    className="px-3 py-1 bg-deep-gray border border-neon-cyan border-opacity-30 rounded text-white text-xs hover:bg-opacity-50 hover:border-neon-cyan transition-colors"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
