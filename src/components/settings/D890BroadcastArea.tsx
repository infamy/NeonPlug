import React from 'react';
import { useRadioStore } from '../../store/radioStore';
import { SectionTitle } from '../ui/SectionTitle';
import { formatPlural } from '../../utils/formatPlural';
import type { D890BroadcastChannel } from '../../radios/d890uv/broadcastChannels';

/**
 * AM airband and FM broadcast receivers.
 *
 * These are two tables of their own, entirely separate from the main channel
 * list and from each other — a channel here does not occupy a channel number
 * and cannot be reached from a zone. Receive only: the radio has no transmitter
 * for either band, which is why there is no power, tone or bandwidth column.
 *
 * Read-only. Nothing writes these back.
 */
const BroadcastTable: React.FC<{
  title: string;
  note: string;
  decimals: number;
  entries: D890BroadcastChannel[];
}> = ({ title, note, decimals, entries }) => (
  <div>
    <h4 className="text-sm font-semibold text-neon-cyan mb-1">
      {title} ({entries.length})
    </h4>
    <p className="text-xs text-muted mb-2">{note}</p>
    {entries.length === 0 ? (
      <p className="text-xs text-muted">None stored.</p>
    ) : (
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-dark-charcoal border-b border-neon-cyan">
              <th className="px-2 py-2 text-left text-neon-cyan font-bold">#</th>
              <th className="px-2 py-2 text-left text-neon-cyan font-bold">Name</th>
              <th className="px-2 py-2 text-left text-neon-cyan font-bold">Frequency</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((ch) => (
              <tr key={ch.index} className="border-b border-panel">
                <td className="px-2 py-1 text-muted">{ch.index + 1}</td>
                <td className="px-2 py-1 text-white">{ch.name || <span className="text-muted">—</span>}</td>
                <td className="px-2 py-1 text-white font-mono">
                  {/* null means the record held no decodable BCD — an erased or
                      part-written slot. Showing it as 0.000 would invent a
                      frequency the radio does not hold. */}
                  {ch.frequency === null ? <span className="text-muted">—</span> : `${ch.frequency.toFixed(decimals)} MHz`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </div>
);

export const D890BroadcastArea: React.FC = () => {
  const { d890Broadcast } = useRadioStore();

  if (!d890Broadcast) {
    return (
      <div>
        <SectionTitle size="lg" underline>AM / FM Receivers</SectionTitle>
        <p className="text-sm text-muted">Read the radio to see its AM and FM channels.</p>
      </div>
    );
  }

  const total = d890Broadcast.am.length + d890Broadcast.fm.length;

  return (
    <div>
      <SectionTitle size="lg" underline>AM / FM Receivers</SectionTitle>
      <p className="text-cool-gray text-sm mb-6">
        Receive-only broadcast and airband memories. These live in their own tables — they
        do not use channel numbers and cannot be put in a zone.
        {total > 0 && ` ${total} ${formatPlural(total, 'channel')} stored.`}
      </p>

      <div className="flex flex-col gap-6">
        <BroadcastTable
          title="AM Airband"
          note="108–137 MHz aviation. Separate from any airband channels in your main channel list."
          decimals={4}
          entries={d890Broadcast.am}
        />
        <BroadcastTable
          title="FM Broadcast"
          note="Commercial FM radio."
          decimals={2}
          entries={d890Broadcast.fm}
        />
      </div>
    </div>
  );
};
