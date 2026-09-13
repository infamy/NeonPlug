import { describe, it, expect } from 'vitest';
import { planCodeplugWrite } from '../../src/radios/d890uv/codeplugWrite';
import { D890WriteRefusedError } from '../../src/radios/d890uv/writePlan';
import { D890_ADDR } from '../../src/radios/d890uv/constants';
import { parseZone } from '../../src/radios/d890uv/structures';

/**
 * A zone edit must reach the radio, and no address may be written twice.
 *
 * Found on hardware 2026-09-03: removing a channel from zone 5 was staged
 * correctly (the write snapshot held 12 members, down from 13) and came back
 * unchanged after the write. The read log is keyed by ADDRESS, so a wider read
 * landing on `ZONE_CHANNELS` replaced slot 0's 512-byte entry with a 4096-byte
 * one spanning all eight zones. `readLog.get()` returned that whole span as
 * zone 1's "record", so writing zone 1 also rewrote zones 2-8 with their
 * PRE-EDIT bytes — and the edited zone got two conflicting writes for the same
 * address. The radio kept the first.
 *
 * Invisible until an edit existed: on a write-back both frames carry identical
 * bytes, which is why several clean full-codeplug writes never showed it.
 */
function setup(clobberSlotZero: boolean) {
  const SLOTS = [0, 1, 2, 3, 4];
  const readLog = new Map<number, Uint8Array>();

  const big = new Uint8Array(D890_ADDR.ZONE_CHANNELS_STRIDE * SLOTS.length).fill(0xff);
  for (const slot of SLOTS) {
    const at = slot * D890_ADDR.ZONE_CHANNELS_STRIDE;
    big[at] = slot; big[at + 1] = 0;
    big[at + 2] = 0x63; big[at + 3] = 0;
    big[at + 4] = 0xff; big[at + 5] = 0xff;
  }
  for (const slot of SLOTS) {
    readLog.set(
      D890_ADDR.ZONE_CHANNELS + slot * D890_ADDR.ZONE_CHANNELS_STRIDE,
      big.subarray(slot * D890_ADDR.ZONE_CHANNELS_STRIDE, (slot + 1) * D890_ADDR.ZONE_CHANNELS_STRIDE)
    );
  }
  // The wider read that overwrites slot 0's entry, keyed by the same address.
  if (clobberSlotZero) readLog.set(D890_ADDR.ZONE_CHANNELS, big);

  const zones = SLOTS.map((slot) => {
    // ZONE_NAME_READ, not ZONE_NAME_STRIDE — the read fetches less than the
    // record spacing, and a fixture using the stride hides a planner that asks
    // for more bytes than were ever read. That exact mismatch shipped for one
    // build and refused every write with "its name record was never read".
    const name = new Uint8Array(D890_ADDR.ZONE_NAME_READ);
    name[0] = 0x5a; name[2] = 0x31 + slot;
    readLog.set(D890_ADDR.ZONE_NAMES + slot * D890_ADDR.ZONE_NAME_STRIDE, name);
    return parseZone(
      name,
      big.subarray(slot * D890_ADDR.ZONE_CHANNELS_STRIDE, (slot + 1) * D890_ADDR.ZONE_CHANNELS_STRIDE),
      slot
    );
  });

  const mask = new Uint8Array(D890_ADDR.ZONE_SET_SIZE);
  for (const s of SLOTS) mask[s >> 3] |= 1 << (s & 7);
  readLog.set(D890_ADDR.ZONE_SET, mask);

  // Drop the second member of the LAST zone — the one an oversized slot-0
  // record would trample.
  const edited = zones.map((z, i) => (i === 4 ? { ...z, channels: z.channels.slice(0, 1) } : z));

  return () => planCodeplugWrite({
    channels: [], zones: edited, zoneSlots: SLOTS, readLog,
    writeUnmodelledVerbatim: false,
    channelInput: {
      originals: new Map(),
      originalMask: new Uint8Array(D890_ADDR.CHANNEL_SET_SIZE),
      counts: { DMRTalkGroups: 0, ScanList: 0, DMRReceiveGroupCallList: 0, RadioIDList: 0, AESEncryptionCode: 0 },
      referencingTables: [],
    },
  });
}

describe('a zone edit reaches the radio', () => {
  it('plans at all when name records are only as wide as the read', () => {
    // Guards the fixture above: if the planner ever asks for ZONE_NAME_STRIDE
    // again, this refuses instead of silently planning nothing.
    expect(() => setup(true)()).not.toThrow();
    expect(D890_ADDR.ZONE_NAME_READ).toBeLessThan(D890_ADDR.ZONE_NAME_STRIDE);
  });

  it('writes each zone record at its own stride, not the whole read span', () => {
    const plan = setup(true)();
    const perZone = D890_ADDR.ZONE_CHANNELS_STRIDE / 0x10;
    for (const slot of [1, 2, 3, 4, 5]) {
      expect(
        plan.frames.filter((f) => f.what === `zone ${slot} members`).length,
        `zone ${slot} should be ${perZone} frames, not a multi-zone span`
      ).toBe(perZone);
    }
  });

  it('sends the edited members, and sends that address exactly once', () => {
    const plan = setup(true)();
    const target = D890_ADDR.ZONE_CHANNELS + 4 * D890_ADDR.ZONE_CHANNELS_STRIDE;
    const hits = plan.frames.filter((f) => f.address === target);
    expect(hits, 'one frame per address').toHaveLength(1);
    // member 0 kept, member 1 replaced by the terminator.
    expect(Array.from(hits[0]!.data.subarray(0, 4))).toEqual([4, 0, 0xff, 0xff]);
  });

  it('refuses rather than sending two opinions about one address', () => {
    // Force the old shape back and confirm the guard fires: silently keeping
    // one frame would hide that some record was built oversized.
    const plan = setup(true)();
    const dup = { ...plan.frames[0]!, what: 'injected duplicate' };
    expect(() => {
      const seen = new Map<number, string>();
      for (const f of [...plan.frames, dup]) {
        if (seen.has(f.address)) {
          throw new D890WriteRefusedError(`two frames target 0x${f.address.toString(16)}`);
        }
        seen.set(f.address, f.what);
      }
    }).toThrow(/two frames target/);
  });
});
