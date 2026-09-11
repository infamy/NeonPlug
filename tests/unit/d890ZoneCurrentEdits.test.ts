/**
 * A zone's current A/B channel edit has to reach the radio.
 *
 * The write path resolves A/B from the READ-TIME, id-keyed
 * `writeOriginals.zoneCurrentById`, which is right for every zone the user did
 * not touch and wrong for every zone they did. On 2026-09-11 an A/B edit staged
 * before a hardware write produced NO region in the dry-run diff at all: the
 * read-time value simply won, and the edit was dropped silently. The Zones tab
 * had written it to a position-indexed table that nothing consulted.
 *
 * Position cannot be the key — add, delete or reorder a zone and it points at
 * the wrong one, which is the bug that made the id-keyed baseline necessary in
 * the first place. So edits are id-keyed too, and overlaid on the baseline here.
 */

import { describe, it, expect } from 'vitest';
import { resolveZoneCurrentBySlot } from '../../src/services/d890WriteInput';

const zones = (...ids: string[]) => ids.map((id) => ({ id }));

/** Two zones, read from slots 0 and 1, both sitting on A=0 B=0. */
const baseline = {
  z1: { a: 0, b: 0 },
  z2: { a: 3, b: 4 },
};

describe('an A/B edit reaches the plan', () => {
  it('lets the EDIT win over the value read from the radio', () => {
    const got = resolveZoneCurrentBySlot(
      zones('z1', 'z2'), [0, 1], baseline, { z1: { a: 7 } }
    );
    expect(got?.a.get(0)).toBe(7);
  });

  it('edits one field without disturbing the other', () => {
    // Editing A must not drag B to a fabricated 0 — B still holds what the
    // radio holds, and writing 0 over it would move the user's VFO.
    const got = resolveZoneCurrentBySlot(
      zones('z1', 'z2'), [0, 1], baseline, { z2: { a: 9 } }
    );
    expect(got?.a.get(1)).toBe(9);
    expect(got?.b.get(1)).toBe(4);
  });

  it('leaves an unedited zone on its read value', () => {
    const got = resolveZoneCurrentBySlot(
      zones('z1', 'z2'), [0, 1], baseline, { z1: { a: 7 } }
    );
    expect(got?.a.get(1)).toBe(3);
    expect(got?.b.get(1)).toBe(4);
  });
});

describe('zone IDENTITY is the key, not position', () => {
  it('follows a zone that moved position since the read', () => {
    // z2 is now first and written to slot 1; its edit must travel with the id.
    const got = resolveZoneCurrentBySlot(
      zones('z2', 'z1'), [1, 0], baseline, { z2: { b: 11 } }
    );
    expect(got?.b.get(1)).toBe(11);   // z2's slot, z2's edit
    expect(got?.b.get(0)).toBe(0);    // z1 untouched, still its own baseline
  });

  it('writes a NEW zone only where the user set something', () => {
    const got = resolveZoneCurrentBySlot(
      zones('z1', 'zNew'), [0, 5], baseline, { zNew: { a: 2 } }
    );
    expect(got?.a.get(5)).toBe(2);
    // Nothing known about B for a zone the radio has never held. Absent means
    // the encoder does not touch those bytes, rather than writing a guess.
    expect(got?.b.has(5)).toBe(false);
  });

  it('ignores a zone with no slot to write to', () => {
    const got = resolveZoneCurrentBySlot(zones('z1'), [], baseline, { z1: { a: 7 } });
    expect(got?.a.size).toBe(0);
  });
});

describe('what happens with nothing to go on', () => {
  it('returns undefined when there is neither a baseline nor an edit', () => {
    // The caller then falls back to the position-indexed table — still better
    // than writing a fabricated pointer.
    expect(resolveZoneCurrentBySlot(zones('z1'), [0], undefined, undefined)).toBeUndefined();
  });

  it('applies edits even with no read baseline at all', () => {
    const got = resolveZoneCurrentBySlot(zones('z1'), [0], undefined, { z1: { a: 4 } });
    expect(got?.a.get(0)).toBe(4);
    expect(got?.b.has(0)).toBe(false);
  });
});
