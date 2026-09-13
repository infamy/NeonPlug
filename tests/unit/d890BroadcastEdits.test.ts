import { describe, it, expect } from 'vitest';
import {
  deleteBroadcastChannel,
  deleteBroadcastChannels,
} from '../../src/radios/d890uv/broadcastEdits';
import type { D890BroadcastChannel } from '../../src/radios/d890uv/broadcastChannels';
import type { D890AmZone } from '../../src/radios/d890uv/amZones';

/**
 * Compacting a broadcast table must move its references with it.
 *
 * The indices are hardware slots. An AM zone's members are absolute indices
 * into this table and so is its `currentChannel`, so a shift that renumbers the
 * channels but not the references leaves every zone naming the station one slot
 * along — silently, and indistinguishable from correct until someone listens.
 */
const ch = (index: number, name: string): D890BroadcastChannel =>
  ({ index, name, frequency: 118 + index / 100 });

const zone = (name: string, members: number[], currentChannel: number): D890AmZone =>
  ({ index: 0, name, members, currentChannel });

describe('deleting a broadcast channel', () => {
  const table = [ch(0, 'A'), ch(1, 'B'), ch(2, 'C'), ch(3, 'D')];

  it('closes the gap and renumbers from zero', () => {
    const { channels } = deleteBroadcastChannel(table, 1);
    expect(channels.map((c) => [c.index, c.name])).toEqual([
      [0, 'A'], [1, 'C'], [2, 'D'],
    ]);
  });

  it('moves zone members with the channels they name', () => {
    // Members A(0), C(2), D(3). After deleting B(1) they must still be A, C, D
    // — now 0, 1, 2. Getting this wrong would leave them naming A, B, C.
    const { channels, zones } = deleteBroadcastChannel(table, 1, [zone('Z', [0, 2, 3], 2)]);
    expect(zones[0]!.members).toEqual([0, 1, 2]);
    const named = zones[0]!.members.map((m) => channels.find((c) => c.index === m)!.name);
    expect(named, 'the same stations as before the delete').toEqual(['A', 'C', 'D']);
  });

  it('keeps currentChannel on the SAME station, not the same number', () => {
    // Pointed at C(2). C becomes 1, so the pointer must become 1.
    const { channels, zones } = deleteBroadcastChannel(table, 1, [zone('Z', [0, 2, 3], 2)]);
    expect(zones[0]!.currentChannel).toBe(1);
    expect(channels.find((c) => c.index === zones[0]!.currentChannel)!.name).toBe('C');
  });

  it('re-points a zone that pointed AT the deleted channel', () => {
    // Nothing to remap to — it must land on a surviving member rather than stay
    // aimed at a slot whose bytes now belong to a different station.
    const { channels, zones } = deleteBroadcastChannel(table, 1, [zone('Z', [0, 1, 2], 1)]);
    expect(zones[0]!.members).toEqual([0, 1]);
    expect(zones[0]!.currentChannel).toBe(0);
    expect(channels.find((c) => c.index === zones[0]!.currentChannel)!.name).toBe('A');
  });

  it('drops the deleted channel from every zone that held it', () => {
    const zones = [zone('Z1', [0, 1], 0), zone('Z2', [1, 2, 3], 3)];
    const out = deleteBroadcastChannel(table, 1, zones);
    expect(out.zones[0]!.members).toEqual([0]);
    expect(out.zones[1]!.members).toEqual([1, 2]);
    // Z2 pointed at D(3), which is now 2.
    expect(out.zones[1]!.currentChannel).toBe(2);
  });

  it('leaves an emptied zone with a defined pointer', () => {
    const out = deleteBroadcastChannel([ch(0, 'A')], 0, [zone('Z', [0], 0)]);
    expect(out.channels).toEqual([]);
    expect(out.zones[0]!.members).toEqual([]);
    expect(out.zones[0]!.currentChannel).toBe(0);
  });

  it('handles a table that already had gaps', () => {
    // Deleting from a sparse table compacts the whole thing, so a member at 5
    // has to follow to its new home rather than being dropped.
    const sparse = [ch(0, 'A'), ch(2, 'C'), ch(5, 'F')];
    const out = deleteBroadcastChannel(sparse, 2, [zone('Z', [0, 5], 5)]);
    expect(out.channels.map((c) => [c.index, c.name])).toEqual([[0, 'A'], [1, 'F']]);
    expect(out.zones[0]!.members).toEqual([0, 1]);
    expect(out.zones[0]!.currentChannel).toBe(1);
  });

  it('does not touch zones for FM, which has none', () => {
    const { channels, zones } = deleteBroadcastChannel(table, 0);
    expect(zones).toEqual([]);
    expect(channels.map((c) => c.name)).toEqual(['B', 'C', 'D']);
  });
});

describe('deleting several channels at once', () => {
  const table = [ch(0, 'A'), ch(1, 'B'), ch(2, 'C'), ch(3, 'D'), ch(4, 'E')];

  it('removes the whole set and renumbers once', () => {
    const { channels } = deleteBroadcastChannels(table, new Set([1, 3]));
    expect(channels.map((c) => [c.index, c.name])).toEqual([[0, 'A'], [1, 'C'], [2, 'E']]);
  });

  it('is NOT the same as deleting one at a time', () => {
    // The bug this guards. Deleting 1 compacts C,D,E to 1,2,3 — so a second
    // delete of "3" would remove E, not D. Order would decide the outcome.
    let seq = deleteBroadcastChannel(table, 1).channels;
    seq = deleteBroadcastChannel(seq, 3).channels;
    expect(seq.map((c) => c.name)).toEqual(['A', 'C', 'D']);      // E gone — wrong

    const atOnce = deleteBroadcastChannels(table, new Set([1, 3])).channels;
    expect(atOnce.map((c) => c.name)).toEqual(['A', 'C', 'E']);   // D gone — right
  });

  it('gives the same result whatever order the set is built in', () => {
    const a = deleteBroadcastChannels(table, new Set([3, 1, 4])).channels.map((c) => c.name);
    const b = deleteBroadcastChannels(table, new Set([1, 4, 3])).channels.map((c) => c.name);
    expect(a).toEqual(b);
    expect(a).toEqual(['A', 'C']);
  });

  it('remaps zone members across a multi-delete', () => {
    // Members A,C,E survive; B,D go. They must still name A, C, E.
    const zones = [zone('Z', [0, 1, 2, 3, 4], 4)];
    const out = deleteBroadcastChannels(table, new Set([1, 3]), zones);
    const named = out.zones[0]!.members.map(
      (m) => out.channels.find((c) => c.index === m)!.name
    );
    expect(named).toEqual(['A', 'C', 'E']);
    // Pointed at E(4), now 2.
    expect(out.zones[0]!.currentChannel).toBe(2);
    expect(out.channels.find((c) => c.index === out.zones[0]!.currentChannel)!.name).toBe('E');
  });

  it('deleting nothing changes nothing', () => {
    const out = deleteBroadcastChannels(table, new Set());
    expect(out.channels.map((c) => c.name)).toEqual(['A', 'B', 'C', 'D', 'E']);
  });
});
