import React, { useState } from 'react';
import { useRadioStore } from '../../store/radioStore';
import { D890_AM_ZONES } from '../../radios/d890uv/amZones';
import type { D890AmZone } from '../../radios/d890uv/amZones';
import type { D890BroadcastChannel } from '../../radios/d890uv/broadcastChannels';

/**
 * AM zones — a separate zone system over the airband table.
 *
 * Members are AM channel INDICES, not channel numbers, so every add and remove
 * works in the AM table's own numbering. Mixing the two would put a main-list
 * channel number into an AM zone, which the radio has no way to resolve.
 */
export const AmZonesEditor: React.FC<{ channels: D890BroadcastChannel[] }> = ({ channels }) => {
  const { d890AmZones, setD890AmZones } = useRadioStore();
  const [newName, setNewName] = useState('');
  if (!d890AmZones) return null;

  const zones = d890AmZones;
  const update = (index: number, patch: Partial<D890AmZone>) =>
    setD890AmZones(zones.map((z) => (z.index === index ? { ...z, ...patch } : z)));

  const addZone = () => {
    // Slots are fixed hardware positions, so a new zone takes the lowest free
    // index rather than being appended — the index IS the address.
    const used = new Set(zones.map((z) => z.index));
    let index = 0;
    while (used.has(index)) index += 1;
    if (index >= D890_AM_ZONES.SLOTS) return;
    const name = newName.trim() || `AM Zone ${index + 1}`;
    setD890AmZones(
      [...zones, { index, name, members: [], currentChannel: 0 }].sort((a, b) => a.index - b.index)
    );
    setNewName('');
  };

  const label = (i: number) => channels.find((c) => c.index === i)?.name || `#${i + 1}`;

  return (
    <div className="mb-3 bg-neon-cyan bg-opacity-5 border border-neon-cyan border-opacity-30 rounded-lg p-3">
      <div className="flex items-center justify-between mb-2 gap-2">
        <h4 className="text-neon-cyan font-medium text-xs">
          AM Zones ({zones.length}/{D890_AM_ZONES.SLOTS})
        </h4>
        <div className="flex items-center gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addZone()}
            placeholder="Zone name…"
            maxLength={16}
            className="bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-white text-xs w-36 focus:outline-none focus:border-neon-cyan"
          />
          <button
            onClick={addZone}
            disabled={zones.length >= D890_AM_ZONES.SLOTS}
            className="px-2 py-1 text-xs text-cool-gray hover:text-neon-cyan border border-neon-cyan border-opacity-20 hover:border-opacity-50 rounded disabled:opacity-30"
          >
            + Add
          </button>
        </div>
      </div>

      {zones.length === 0 ? (
        <p className="text-xs text-muted">No AM zones. Add one to group airband channels.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {zones.map((zone) => (
            <div key={zone.index} className="border-t border-panel pt-2 first:border-t-0 first:pt-0">
              <div className="flex items-center gap-2 mb-1">
                <input
                  value={zone.name}
                  onChange={(e) => update(zone.index, { name: e.target.value })}
                  maxLength={16}
                  className="bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-white text-xs w-40 focus:outline-none focus:border-neon-cyan"
                />
                <span className="text-muted text-xs">
                  {zone.members.length} {zone.members.length === 1 ? 'channel' : 'channels'}
                </span>
                <button
                  onClick={() => setD890AmZones(zones.filter((z) => z.index !== zone.index))}
                  className="ml-auto px-1.5 py-0.5 text-red-400 hover:text-red-300 border border-red-600 border-opacity-30 hover:border-opacity-60 rounded text-xs"
                  title="Delete this AM zone"
                >
                  ×
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-1">
                {zone.members.map((member, position) => (
                  <span
                    key={`${member}-${position}`}
                    className="inline-flex items-center gap-1 bg-neon-cyan bg-opacity-10 border border-neon-cyan border-opacity-30 rounded px-1.5 py-0.5 text-xs text-white"
                  >
                    {label(member)}
                    <button
                      onClick={() =>
                        update(zone.index, {
                          members: zone.members.filter((_, i) => i !== position),
                        })
                      }
                      className="text-cool-gray hover:text-red-300"
                      title="Remove from this zone"
                    >
                      ×
                    </button>
                  </span>
                ))}

                {/* Only offers channels not already in the zone — the radio
                    resolves a member by index, so the same one twice is a
                    duplicate, not a second entry. */}
                <select
                  value=""
                  onChange={(e) => {
                    if (!e.target.value) return;
                    update(zone.index, {
                      members: [...zone.members, parseInt(e.target.value, 10)],
                    });
                  }}
                  className="bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-1.5 py-0.5 text-cool-gray text-xs focus:outline-none focus:border-neon-cyan"
                >
                  <option value="">+ add channel…</option>
                  {channels
                    .filter((c) => !zone.members.includes(c.index))
                    .map((c) => (
                      <option key={c.index} value={c.index}>
                        {c.name || `#${c.index + 1}`}
                      </option>
                    ))}
                </select>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
