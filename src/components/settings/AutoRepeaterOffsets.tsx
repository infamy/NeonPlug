import React from 'react';
import { Card } from '../ui/Card';
import { SectionTitle } from '../ui/SectionTitle';
import { useRadioStore } from '../../store/radioStore';
import { D890_AUTO_REPEATER } from '../../radios/d890uv/autoRepeater';
import { formatPlural } from '../../utils/formatPlural';

/**
 * Auto-repeater offsets — 250 slots, only the used ones shown.
 *
 * The slot NUMBER is shown and never renumbered. What CONSUMES the index is
 * not yet known — an earlier version of this comment claimed the
 * `autoRepeater1Uhf` / `autoRepeater1Vhf` settings were u8 selectors into the
 * table, which the CPS's own Auto repeater tab disproves: both are Off/on-style
 * dropdowns, and auto-repeater there is a VFO feature with per-band frequency
 * windows.
 *
 * Keeping gaps is still right regardless. A slot's position is the only handle
 * anything could have on it, and renumbering on delete would break any consumer
 * we have not found yet — the opposite of AM airband, where nothing indexes a
 * channel and compaction is correct.
 */
export const AutoRepeaterOffsets: React.FC = () => {
  const { tables, setTable } = useRadioStore();
  const offsets = tables.autoRepeaterOffsets;
  if (!offsets) return null;

  const used = offsets
    .map((mhz, index) => ({ mhz, index }))
    .filter((o): o is { mhz: number; index: number } => o.mhz !== null);

  const set = (index: number, mhz: number | null) =>
    setTable('autoRepeaterOffsets', offsets.map((v, i) => (i === index ? mhz : v)));

  const add = () => {
    const free = offsets.findIndex((v) => v === null);
    if (free < 0) return;
    set(free, 0.6);
  };

  return (
    <div className="mb-8">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <SectionTitle as="h3" size="xl">Auto-Repeater Offsets</SectionTitle>
          <p className="text-cool-gray text-sm">
            Offsets the radio can apply automatically on repeater bands.{' '}
            {used.length} of {D890_AUTO_REPEATER.SLOTS} {formatPlural(used.length, 'slot')} in use.
          </p>
        </div>
        <button
          onClick={add}
          disabled={used.length >= D890_AUTO_REPEATER.SLOTS}
          className="px-3 py-1.5 rounded border border-neon-cyan text-neon-cyan
                     hover:bg-neon-cyan hover:bg-opacity-10 disabled:opacity-40 text-sm"
        >
          + Add offset
        </button>
      </div>

      <Card padding={used.length === 0 ? undefined : 'none'}>
        {used.length === 0 ? (
          <p className="text-muted text-sm">
            No offsets stored. Add one to use it from{' '}
            <span className="text-white">Auto Repeater1 (UHF/VHF)</span> in Settings.
          </p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-dark-charcoal border-b border-neon-cyan">
                <th
                  className="px-3 py-2 text-left text-neon-cyan font-bold w-20"
                  title="The slot number the Auto Repeater1 (UHF/VHF) settings select by — it never changes"
                >
                  Slot
                </th>
                <th className="px-3 py-2 text-left text-neon-cyan font-bold">Offset</th>
                <th className="px-3 py-2 text-right text-neon-cyan font-bold w-20">Actions</th>
              </tr>
            </thead>
            <tbody>
              {used.map(({ mhz, index }) => (
                <tr key={index} className="border-b border-panel">
                  <td className="px-3 py-2 text-muted font-mono">{index}</td>
                  <td className="px-3 py-2 font-mono">
                    <input
                      key={`${index}-${mhz}`}
                      defaultValue={mhz.toFixed(5)}
                      onBlur={(e) => {
                        const v = Number.parseFloat(e.target.value.trim());
                        if (Number.isFinite(v)) set(index, v);
                        else e.target.value = mhz.toFixed(5);
                      }}
                      className="bg-transparent text-white border-none outline-none
                                 focus:bg-panel focus:px-1 rounded w-32"
                    />
                    <span className="text-muted ml-1">MHz</span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    {/* Clears the slot; the gap stays, because the number is
                        what the settings select by. */}
                    <button
                      onClick={() => set(index, null)}
                      title={`Clear slot ${index} — the slot number stays free rather than renumbering the rest`}
                      className="text-muted hover:text-red-400 px-2"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
};
