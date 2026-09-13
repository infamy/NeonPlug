import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseAmZone, parseAmZoneTable, D890_AM_ZONES } from '../../src/radios/d890uv/amZones';

/**
 * 4 KB read from 0x3888000 on a real DA-7X2, 2026-08-31, with one AM zone set.
 * The radio's AM table held AM-001 / TEST1 / TEST2 at indices 0/1/2, and its
 * owner confirmed the zone contains TEST1 and TEST2.
 */
const DUMP = new Uint8Array(readFileSync(join(__dirname, '../fixtures/d890uv/am-zones.bin')));

describe('DA-7X2 AM zones', () => {
  it('reads the zone that was set on the radio', () => {
    expect(parseAmZoneTable(DUMP)).toEqual([
      { index: 0, name: 'AMZONETEST', members: [1, 2], currentChannel: 0 },
    ]);
  });

  it('holds AM channel indices, not the members of the main zone table', () => {
    // Members 1 and 2 are TEST1 and TEST2. AM-001 is index 0 and is NOT a
    // member — which is the observation that separates the current-channel
    // field from the member list.
    const zone = parseAmZone(DUMP.subarray(0, D890_AM_ZONES.STRIDE), 0)!;
    expect(zone.members).toEqual([1, 2]);
    expect(zone.members).not.toContain(0);
  });

  it('keeps currentChannel raw rather than resolving it', () => {
    // Whether this is a position in the member list (as the main zone table's
    // A/B channels are) or an AM channel index is NOT established. Storing it
    // raw means a wrong guess cannot silently name the wrong channel.
    expect(parseAmZone(DUMP.subarray(0, D890_AM_ZONES.STRIDE), 0)!.currentChannel).toBe(0);
  });

  it('treats an unused slot as absent', () => {
    // Slot 1 is erased on this radio.
    const slot1 = DUMP.subarray(D890_AM_ZONES.STRIDE, D890_AM_ZONES.STRIDE * 2);
    expect(slot1.every((b) => b === 0xff)).toBe(true);
    expect(parseAmZone(slot1, 1)).toBeNull();
  });

  it('stops the member list at the 0xFFFF terminator', () => {
    // Without the terminator the erased tail would decode as 32 members at
    // channel 65535 — a zone full of channels that do not exist.
    const zone = parseAmZone(DUMP.subarray(0, D890_AM_ZONES.STRIDE), 0)!;
    expect(zone.members).toHaveLength(2);
  });
});
