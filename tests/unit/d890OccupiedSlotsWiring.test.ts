/**
 * The slot set has to reach the plan, not merely exist.
 *
 * `findDanglingReferences` learned about holes, and `buildD890WriteOriginals`
 * built the slot set for it — but `planCodeplug` never passed it into
 * `channelInput`, so the gate silently fell back to counting. Every test proving
 * the hole logic called `findDanglingReferences` DIRECTLY and so agreed with
 * itself while the real path was broken.
 *
 * Caught on hardware 2026-09-10 by the dry run, before any bytes were sent: a
 * radio holding its only scan list in SLOT 1 has a count of 1, and all 59
 * channels referencing list 2 were refused as out-of-range.
 */

import { describe, it, expect } from 'vitest';
import { D890UVProtocol } from '../../src/radios/d890uv/protocol';
import { D890_ADDR } from '../../src/radios/d890uv/constants';
import type { Channel } from '../../src/models/Channel';

/** A channel pointing at scan list 2 (one-based) — i.e. hardware slot 1. */
const channel = (number: number): Channel =>
  ({ number, name: `CH${number}`, rxFrequency: 440, txFrequency: 440, scanListId: 2 } as Channel);

function plan(occupiedSlots?: { ScanList?: ReadonlySet<number> }) {
  const proto = new D890UVProtocol();
  const readLog = new Map<number, Uint8Array>();
  readLog.set(D890_ADDR.ZONE_SET, new Uint8Array(D890_ADDR.ZONE_SET_SIZE));
  proto.setWriteOriginals({
    channelRecords: new Map(),
    channelMask: new Uint8Array(D890_ADDR.CHANNEL_SET_SIZE ?? 512),
    counts: {
      // ONE scan list — the count a hole makes misleading.
      DMRTalkGroups: 0, ScanList: 1, DMRReceiveGroupCallList: 0,
      RadioIDList: 0, AESEncryptionCode: 0,
    },
    occupiedSlots,
    referencingTables: [],
    readLog,
  });
  return () => proto.planCodeplug([channel(2)], [], [], {});
}

describe('occupiedSlots reaches the reference gate', () => {
  it('ACCEPTS a reference to the occupied slot even though the count says one', () => {
    // Slot 1 occupied, slot 0 a hole. Count-based: "list 2 but ScanList has 1".
    // Slot-based: 2 is one-based, so it means slot 1, which exists.
    expect(plan({ ScanList: new Set([1]) })).not.toThrow(/would not resolve/);
  });

  it('still REFUSES a reference to a slot that is genuinely empty', () => {
    // The gate must not become a rubber stamp: with only slot 0 occupied, a
    // channel pointing at list 2 (slot 1) really is dangling.
    expect(plan({ ScanList: new Set([0]) })).toThrow(/would not resolve/);
  });

  it('falls back to the count when no slot set is supplied', () => {
    // Documents the OLD behaviour so the fallback stays deliberate: with one
    // entry and no slot set, list 2 is out of range.
    expect(plan(undefined)).toThrow(/would not resolve/);
  });
});
