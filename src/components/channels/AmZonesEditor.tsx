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
  const { tables, setTable } = useRadioStore();
  const [newName, setNewName] = useState('');
  if (!tables.amZones) return null;

  const zones = tables.amZones;
  /**
   * Remove one member, keeping the position-indexed fields aligned.
   *
   * `aChannel` and `scan` are both indexed by POSITION in this list, so
   * dropping a member shifts everything after it. Filtering members alone would
   * leave the A Channel naming a different station and every scan flag off by
   * one — the same failure the zone-slot and AM-index bugs had today.
   */
  const removeMember = (zone: D890AmZone, position: number) => {
    const members = zone.members.filter((_, i) => i !== position);
    const scan = zone.scan?.filter((_, i) => i !== position);
    let aChannel = zone.aChannel;
    if (aChannel !== undefined) {
      if (aChannel === position) aChannel = 0;         // it named the one removed
      else if (aChannel > position) aChannel -= 1;     // it named a later one
    }
    update(zone.index, { members, scan, aChannel });
  };

  const addMember = (zone: D890AmZone, channelIndex: number) => {
    update(zone.index, {
      members: [...zone.members, channelIndex],
      // New members default to scanned, matching what the vendor CPS writes:
      // every zone came back with a bit set for each of its members.
      scan: zone.scan ? [...zone.scan, true] : undefined,
    });
  };

  const toggleScan = (zone: D890AmZone, position: number) =>
    update(zone.index, {
      scan: (zone.scan ?? zone.members.map(() => true)).map((v, i) => (i === position ? !v : v)),
    });

  const update = (index: number, patch: Partial<D890AmZone>) =>
    setTable(
      'amZones',
      zones.map((z) => {
        if (z.index !== index) return z;
        const next = { ...z, ...patch };
        // `currentChannel` is an ABSOLUTE index into the AM table, not a
        // position in this list — confirmed on hardware 2026-09-03, when zones
        // left pointing at index 0 made the radio display the leftover name of
        // a deleted channel. Keep it on a member that actually exists, so the
        // zone can never name a channel it does not contain.
        if (next.members.length > 0 && !next.members.includes(next.currentChannel)) {
          next.currentChannel = next.members[0]!;
        }
        // aChannel is a POSITION, so it must stay inside the list.
        if (next.aChannel !== undefined && next.aChannel >= next.members.length) {
          next.aChannel = next.members.length > 0 ? 0 : undefined;
        }
        // scan is aligned to members by position; keep the lengths equal so a
        // later member can never read a flag that belongs to a removed one.
        if (next.scan && next.scan.length !== next.members.length) {
          next.scan = next.members.map((_, i) => next.scan?.[i] ?? true);
        }
        return next;
      })
    );

  const addZone = () => {
    // Slots are fixed hardware positions, so a new zone takes the lowest free
    // index rather than being appended — the index IS the address.
    const used = new Set(zones.map((z) => z.index));
    let index = 0;
    while (used.has(index)) index += 1;
    if (index >= D890_AM_ZONES.SLOTS) return;
    const name = newName.trim() || `AM Zone ${index + 1}`;
    setTable('amZones', 
      // currentChannel is fixed up by `update` as soon as the zone gets a
      // member; an empty zone has no channel it could legitimately name.
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
                  onClick={() => setTable('amZones', zones.filter((z) => z.index !== zone.index))}
                  className="ml-auto px-1.5 py-0.5 text-red-400 hover:text-red-300 border border-red-600 border-opacity-30 hover:border-opacity-60 rounded text-xs"
                  title="Delete this AM zone"
                >
                  ×
                </button>
              </div>

              {/* "A Channel" — the vendor CPS's own name for this column.
                  A POSITION in this zone's member list, NOT an AM channel
                  index: confirmed 2026-09-03 from the CPS's own write frames,
                  where zones of 6/7/16 members holding A Channel = their last
                  entry wrote 5, 6 and 15. It lives at A_CHANNEL_TABLE, outside
                  the zone record. There is no B channel — the CPS shows one
                  column here, unlike main zones. */}
              {zone.members.length > 0 && zone.aChannel !== undefined && (
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-cool-gray text-xs">A Channel:</span>
                  <select
                    value={zone.aChannel}
                    onChange={(e) =>
                      update(zone.index, { aChannel: parseInt(e.target.value, 10) })
                    }
                    className="bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-1.5 py-0.5 text-white text-xs focus:outline-none focus:border-neon-cyan"
                  >
                    {zone.members.map((m, position) => (
                      <option key={position} value={position}>{label(m)}</option>
                    ))}
                  </select>
                </div>
              )}

              {zone.members.length > 0 && (
                <div className="text-cool-gray text-[11px] mb-1">
                  {zone.scan
                    ? <>Channels in this zone — <span className="text-neon-cyan">ticked</span> ones
                        are included when scanning it</>
                    : 'Channels in this zone'}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-1">
                {zone.members.map((member, position) => (
                  <span
                    key={`${member}-${position}`}
                    className={
                      'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs border ' +
                      (zone.scan && !zone.scan[position]
                        // Not scanned: muted, so a zone's scan set is legible
                        // without reading every checkbox individually.
                        ? 'bg-transparent border-panel text-muted'
                        : 'bg-neon-cyan bg-opacity-10 border-neon-cyan border-opacity-30 text-white')
                    }
                  >
                    {/* Scan is per (zone, member), not per channel — the same
                        AM channel in two zones can be scanned in one and not
                        the other, which is why it lives here and not as a
                        column on the AM channel table. */}
                    {zone.scan && (
                      <input
                        type="checkbox"
                        checked={zone.scan[position] ?? true}
                        onChange={() => toggleScan(zone, position)}
                        title={
                          zone.scan[position]
                            ? `${label(member)} is scanned in ${zone.name}`
                            : `${label(member)} is skipped when scanning ${zone.name}`
                        }
                        className="mr-1"
                      />
                    )}
                    {label(member)}
                    <button
                      onClick={() => removeMember(zone, position)}
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
                    addMember(zone, parseInt(e.target.value, 10));
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
