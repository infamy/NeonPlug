import { describe, it, expect } from 'vitest';
import { planZoneWrite, D890WriteRefusedError } from '../../src/radios/d890uv/writePlan';
import { D890_ADDR, D890_LIMITS } from '../../src/radios/d890uv/constants';
import { parseZone } from '../../src/radios/d890uv/structures';
import type { Zone } from '../../src/models/Zone';

/**
 * Zone writes.
 *
 * A zone is TWO records in two regions sharing ONE mask, and it is indexed by
 * hardware SLOT rather than by position in the zones array. Both facts are
 * places a write silently corrupts a codeplug, so both are pinned here.
 */

const memberRecord = (channels: number[]) => {
  const rec = new Uint8Array(D890_ADDR.ZONE_CHANNELS_STRIDE);
  let at = 0;
  for (const c of channels) { rec[at] = (c - 1) & 0xff; rec[at + 1] = (c - 1) >> 8; at += 2; }
  rec[at] = 0xff; rec[at + 1] = 0xff;
  return rec;
};
const nameRecord = (name: string) => {
  const rec = new Uint8Array(D890_ADDR.ZONE_NAME_STRIDE);
  for (let i = 0; i < name.length; i += 1) {
    rec[i * 2] = name.charCodeAt(i) & 0xff;
    rec[i * 2 + 1] = name.charCodeAt(i) >> 8;
  }
  return rec;
};

function setup(slots: number[]) {
  const memberOriginals = new Map<number, Uint8Array>();
  const nameOriginals = new Map<number, Uint8Array>();
  const zones: Zone[] = [];
  for (const slot of slots) {
    const members = memberRecord([slot + 1, slot + 2]);
    const name = nameRecord(`Z${slot + 1}`);
    memberOriginals.set(slot, members);
    nameOriginals.set(slot, name);
    zones.push(parseZone(name, members, slot));
  }
  const originalMask = new Uint8Array(D890_ADDR.ZONE_SET_SIZE);
  for (const slot of slots) originalMask[slot >> 3] |= 1 << (slot & 7);
  return { zones, memberOriginals, nameOriginals, originalMask, slotOf: (_z: Zone, i: number) => slots[i] };
}

describe('zone write plan', () => {
  it('writes BOTH records for a zone, never one alone', () => {
    const base = setup([0, 1]);
    const plan = planZoneWrite({ ...base, zones: base.zones.map((z, i) => ({ ...z, name: `NEW${i}` })) });
    for (const slot of [1, 2]) {
      expect(plan.frames.some(f => f.what === `zone ${slot} members`), `slot ${slot} members`).toBe(true);
      expect(plan.frames.some(f => f.what === `zone ${slot} name`), `slot ${slot} name`).toBe(true);
    }
  });

  it('addresses each record in its own region', () => {
    const base = setup([1]);
    const plan = planZoneWrite({ ...base, zones: [{ ...base.zones[0], name: 'RENAMED' }] });
    const members = plan.frames.filter(f => f.what === 'zone 2 members');
    const name = plan.frames.filter(f => f.what === 'zone 2 name');
    expect(members[0].address).toBe(D890_ADDR.ZONE_CHANNELS + 1 * D890_ADDR.ZONE_CHANNELS_STRIDE);
    expect(name[0].address).toBe(D890_ADDR.ZONE_NAMES + 1 * D890_ADDR.ZONE_NAME_STRIDE);
  });

  it('indexes by hardware SLOT, not by array position', () => {
    // Slot 5 is the third zone the radio holds; empty slots are dropped on read,
    // so writing by array position would move it to slot 2 and overwrite
    // whatever lives there.
    const base = setup([0, 3, 5]);
    const plan = planZoneWrite({ ...base, zones: base.zones.map(z => ({ ...z, name: 'X' })) });
    expect(plan.written).toEqual([0, 3, 5]);
    const third = plan.frames.find(f => f.what === 'zone 6 name');
    expect(third?.address).toBe(D890_ADDR.ZONE_NAMES + 5 * D890_ADDR.ZONE_NAME_STRIDE);
  });

  it('shares one mask between both records', () => {
    const base = setup([0, 3]);
    const plan = planZoneWrite({ ...base, zones: base.zones.map(z => ({ ...z, name: 'X' })) });
    const maskFrames = plan.frames.filter(f => f.what === 'zone presence mask');
    expect(maskFrames).toHaveLength(D890_ADDR.ZONE_SET_SIZE / 16);
    expect(plan.mask[0] & 0b1001).toBe(0b1001);
  });

  it('reports a zone the radio has that this plan would remove', () => {
    const base = setup([0, 1, 2]);
    const plan = planZoneWrite({ ...base, zones: [base.zones[0]], slotOf: () => 0 });
    expect(plan.cleared).toEqual([1, 2]);
  });

  it('refuses when either record was never read', () => {
    const base = setup([0]);
    expect(() => planZoneWrite({ ...base, nameOriginals: new Map() }))
      .toThrow(D890WriteRefusedError);
    expect(() => planZoneWrite({ ...base, memberOriginals: new Map() }))
      .toThrow(/membership record was never read/);
  });

  it('writes every zone it plans, changed or not', () => {
    // No "only what changed" mode exists, deliberately — a sparse write left a
    // radio in a bad state. Both records of both zones go, unmodified or not.
    const base = setup([0, 1]);
    const plan = planZoneWrite(base);
    const records = plan.frames.filter(f => f.what.startsWith('zone ') && !f.what.endsWith('mask'));
    const perRecord = D890_ADDR.ZONE_CHANNELS_STRIDE / 16 + 32 / 16;
    expect(records.length).toBe(2 * perRecord);
    expect(plan.written).toEqual([0, 1]);
  });

  it('leaves mask bits above the zone count alone', () => {
    const base = setup([0]);
    const originalMask = new Uint8Array(D890_ADDR.ZONE_SET_SIZE).fill(0xff);
    const plan = planZoneWrite({ ...base, originalMask });
    const lastByte = (D890_LIMITS.ZONES_MAX - 1) >> 3;
    for (let i = lastByte + 1; i < D890_ADDR.ZONE_SET_SIZE; i += 1) {
      expect(plan.mask[i], `byte ${i} is past the zone count`).toBe(0xff);
    }
  });
});
