import React from 'react';
import { Card } from '../ui/Card';
import { EmptyState } from '../ui/EmptyState';
import type { D890BroadcastChannel } from '../../radios/d890uv/broadcastChannels';

/**
 * AM airband / FM broadcast memories.
 *
 * A separate table from the main channel list on the radio — these do not use
 * channel numbers and cannot be put in a zone — which is why this is a sibling
 * view of the channel table rather than rows inside it.
 *
 * Receive only: the radio has no transmitter for either band, so there is no
 * power, tone, bandwidth or TX column to show.
 */
export const BroadcastChannelsTable: React.FC<{
  entries: D890BroadcastChannel[];
  /** AM needs 4 decimals for 25 kHz airband spacing; FM only 2. */
  decimals: number;
  emptyMessage: string;
  /**
   * Index of the band's VFO record, if it is in `entries`. Shown as "VFO"
   * rather than as a channel number: it sits outside the numbered table and has
   * no mask bit, so calling it 101 would imply a memory slot that isn't one.
   */
  vfoIndex?: number;
}> = ({ entries, decimals, emptyMessage, vfoIndex }) => {
  // Decided ONCE for the whole table, then used for both the header and every
  // cell. Testing each row separately would emit a header with no cells (or the
  // reverse) the moment one row disagreed, and a row one cell short of its
  // header shifts every column after it — the exact bug fixed in ChannelRow.
  const showScan = entries.some((c) => c.scanAdd !== undefined);

  if (entries.length === 0) {
    return <EmptyState message={emptyMessage} secondary="Read the radio to load these memories" />;
  }

  return (
    <Card className="h-full overflow-auto" padding="none">
      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0 z-10">
          <tr className="bg-dark-charcoal border-b border-neon-cyan">
            <th className="px-3 py-2 text-left text-neon-cyan font-bold w-16">#</th>
            <th className="px-3 py-2 text-left text-neon-cyan font-bold">Name</th>
            <th className="px-3 py-2 text-left text-neon-cyan font-bold">Frequency</th>
            {/* Only FM carries a flat scan mask; AM's lives per-zone in a table
                we do not read, so the column is omitted rather than shown empty. */}
            {showScan && (
              <th className="px-3 py-2 text-left text-neon-cyan font-bold w-20">Scan</th>
            )}
          </tr>
        </thead>
        <tbody>
          {entries.map((ch) => (
            <tr key={ch.index} className="border-b border-panel hover:bg-neon-cyan hover:bg-opacity-5">
              <td className="px-3 py-2 text-muted">
                {ch.index === vfoIndex ? <span className="text-neon-cyan">VFO</span> : ch.index + 1}
              </td>
              <td className="px-3 py-2 text-white">
                {ch.name || <span className="text-muted">—</span>}
              </td>
              <td className="px-3 py-2 text-white font-mono">
                {/* null is a slot whose bytes held no decodable BCD — erased or
                    part-written. Rendering 0.0000 would invent a frequency. */}
                {ch.frequency === null
                  ? <span className="text-muted">—</span>
                  : `${ch.frequency.toFixed(decimals)} MHz`}
              </td>
              {showScan && (
                <td className="px-3 py-2">
                  {ch.scanAdd
                    ? <span className="text-neon-cyan">Add</span>
                    : <span className="text-muted">—</span>}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
};
