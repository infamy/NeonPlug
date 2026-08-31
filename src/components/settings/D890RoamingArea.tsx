import React from 'react';
import { useRadioStore } from '../../store/radioStore';
import { SectionTitle } from '../ui/SectionTitle';

const fmtFreq = (mhz: number) => (mhz > 0 ? `${mhz.toFixed(5)} MHz` : '—');

/**
 * Roaming channels and zones.
 *
 * Read-only. These are the fallback repeaters the radio hunts for when it loses
 * its current one — a separate table from the main channel list, with its own
 * membership indices, so a roaming zone's members are NOT channel numbers.
 *
 * Colour code and time slot are shown as "No Use" rather than as 16 and 2. The
 * radio stores those out-of-range values to mean "not set", and rendering them
 * as numbers would invent a colour code the user never chose.
 */
export const D890RoamingArea: React.FC = () => {
  const { d890Roaming } = useRadioStore();

  if (!d890Roaming) {
    return (
      <div>
        <SectionTitle size="lg" underline>Roaming</SectionTitle>
        <p className="text-sm text-muted">Read the radio to see its roaming channels and zones.</p>
      </div>
    );
  }

  const { channels, zones } = d890Roaming;

  return (
    <div>
      <SectionTitle size="lg" underline>Roaming</SectionTitle>
      <p className="text-cool-gray text-sm mb-6">
        Fallback repeaters the radio looks for when it loses the current one. These are
        a separate list from your channels — a roaming zone holds roaming channels, not
        channel numbers.
      </p>

      {channels.length === 0 && zones.length === 0 ? (
        <p className="text-sm text-muted">This radio has no roaming channels or zones set.</p>
      ) : (
        <div className="flex flex-col gap-6">
          <div>
            <h4 className="text-sm font-semibold text-neon-cyan mb-2">
              Roaming Channels ({channels.length})
            </h4>
            {channels.length === 0 ? (
              <p className="text-xs text-muted">None.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="bg-dark-charcoal border-b border-neon-cyan">
                      <th className="px-2 py-2 text-left text-neon-cyan font-bold">#</th>
                      <th className="px-2 py-2 text-left text-neon-cyan font-bold">Name</th>
                      <th className="px-2 py-2 text-left text-neon-cyan font-bold">Receive</th>
                      <th className="px-2 py-2 text-left text-neon-cyan font-bold">Transmit</th>
                      <th className="px-2 py-2 text-left text-neon-cyan font-bold">Colour Code</th>
                      <th className="px-2 py-2 text-left text-neon-cyan font-bold">Time Slot</th>
                    </tr>
                  </thead>
                  <tbody>
                    {channels.map((c) => (
                      <tr key={c.index} className="border-b border-panel">
                        <td className="px-2 py-1.5 text-muted">{c.index + 1}</td>
                        <td className="px-2 py-1.5 text-white">{c.name || '—'}</td>
                        <td className="px-2 py-1.5 font-mono text-cool-gray">{fmtFreq(c.rxFrequency)}</td>
                        <td className="px-2 py-1.5 font-mono text-cool-gray">{fmtFreq(c.txFrequency)}</td>
                        <td className="px-2 py-1.5 text-cool-gray">{c.colorCode ?? 'No Use'}</td>
                        <td className="px-2 py-1.5 text-cool-gray">
                          {c.slot === null ? 'No Use' : `TS${c.slot + 1}`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div>
            <h4 className="text-sm font-semibold text-neon-cyan mb-2">
              Roaming Zones ({zones.length})
            </h4>
            {zones.length === 0 ? (
              <p className="text-xs text-muted">None.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {zones.map((z) => (
                  <div key={z.index} className="p-3 bg-dark-charcoal rounded border-panel">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-sm text-white">{z.name || `Zone ${z.index + 1}`}</span>
                      <span className="text-xs text-muted">
                        {z.members.length} channel{z.members.length === 1 ? '' : 's'}
                      </span>
                    </div>
                    <p className="text-xs text-cool-gray mt-1">
                      {z.members.length === 0
                        ? 'Empty'
                        : z.members
                            .map((m) => channels.find((c) => c.index === m)?.name || `#${m + 1}`)
                            .join(' · ')}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
