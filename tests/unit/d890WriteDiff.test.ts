import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { planCodeplugWrite } from '../../src/radios/d890uv/codeplugWrite';
import { diffPlanAgainstRead, renderWriteDiff } from '../../src/radios/d890uv/writeDiff';
import { dryRunWrite } from '../../src/radios/d890uv/writeDryRun';
import { D890_ADDR } from '../../src/radios/d890uv/constants';
import { parseChannel, parseZone } from '../../src/radios/d890uv/structures';
import type { Channel } from '../../src/models/Channel';

const DIR = join(__dirname, '../fixtures/d890uv');
const rec = (i: number) => new Uint8Array(readFileSync(join(DIR, `channel-${i}.bin`)));
const REAL_MASK = new Uint8Array(readFileSync(join(DIR, 'channel-mask-512.bin')));

const COUNTS = {
  DMRTalkGroups: 6, ScanList: 2, DMRReceiveGroupCallList: 1,
  RadioIDList: 4, AESEncryptionCode: 2,
};

/**
 * The offline half of the sanity check the dry-run panel does on real hardware.
 *
 * "We write what we read" is a claim about bytes, so it is checkable: plan a
 * write from an UNMODIFIED codeplug and every frame should be identical to what
 * the radio sent. A difference is a real encoder bug, or a lossy decode whose
 * model cannot represent what the wire held — and the round-trip tests are
 * structurally blind to the second kind, because the encoder patches rather
 * than rebuilds and a skipped field trivially "round-trips".
 */
function setup(zoneSlots = [0, 1]) {
  const channels: Channel[] = [];
  const originals = new Map<number, Uint8Array>();
  const readLog = new Map<number, Uint8Array>();

  for (let i = 0; i < 4; i += 1) {
    const bytes = rec(i);
    channels.push(parseChannel(bytes, i).channel);
    originals.set(i + 1, bytes);
    // The channel records live in the read log too, so their frames are
    // comparable rather than counted 'unread'.
    for (let off = 0; off < bytes.length; off += 0x10) {
      readLog.set(
        D890_ADDR.CHANNEL_DATA + i * D890_ADDR.CHANNEL_STRIDE + off,
        bytes.subarray(off, off + 0x10)
      );
    }
  }

  const zoneMask = new Uint8Array(D890_ADDR.ZONE_SET_SIZE);
  for (const slot of zoneSlots) zoneMask[slot >> 3] |= 1 << (slot & 7);
  readLog.set(D890_ADDR.ZONE_SET, zoneMask);

  const zones = zoneSlots.map((slot) => {
    const members = new Uint8Array(D890_ADDR.ZONE_CHANNELS_STRIDE);
    members[0] = 0; members[1] = 0; members[2] = 0xff; members[3] = 0xff;
    const name = new Uint8Array(D890_ADDR.ZONE_NAME_STRIDE);
    name[0] = 0x5a; name[2] = 0x31 + slot;
    readLog.set(D890_ADDR.ZONE_CHANNELS + slot * D890_ADDR.ZONE_CHANNELS_STRIDE, members);
    readLog.set(D890_ADDR.ZONE_NAMES + slot * D890_ADDR.ZONE_NAME_STRIDE, name);
    return parseZone(name, members, slot);
  });

  return {
    plan: planCodeplugWrite({
      channels, zones, zoneSlots, readLog,
      channelInput: {
        originals, originalMask: REAL_MASK, counts: COUNTS, referencingTables: [],
      },
    }),
    readLog,
  };
}

describe('an unmodified codeplug plans the bytes it read', () => {
  it('changes nothing it can compare', () => {
    const { plan, readLog } = setup();
    const diff = diffPlanAgainstRead(plan.frames, readLog);
    // The report is the failure message: if this ever regresses, the region
    // table and the offending frames are printed rather than a bare count.
    expect(diff.differingFrames, renderWriteDiff(diff)).toBe(0);
    expect(diff.bytesChanged).toBe(0);
  });

  it('actually compared something, rather than passing on an empty diff', () => {
    // Guards the test above: 'differingFrames === 0' is trivially true when
    // every frame is 'unread', which is exactly what a broken read log gives.
    const { plan, readLog } = setup();
    const diff = diffPlanAgainstRead(plan.frames, readLog);
    expect(diff.identicalFrames).toBeGreaterThan(0);
    expect(diff.totalFrames).toBe(
      diff.identicalFrames + diff.differingFrames + diff.unreadFrames
    );
  });

  it('counts an unread frame as unread, never as identical', () => {
    const { plan } = setup();
    const diff = diffPlanAgainstRead(plan.frames, new Map());
    expect(diff.identicalFrames).toBe(0);
    expect(diff.unreadFrames).toBe(plan.frames.length);
  });

  it('reports a real edit as a difference, with the byte offsets', () => {
    const { plan, readLog } = setup();
    const tampered = plan.frames.map((f, i) =>
      i === 0 ? { ...f, data: Uint8Array.from(f.data, (b, j) => (j === 3 ? b ^ 0xff : b)) } : f
    );
    const diff = diffPlanAgainstRead(tampered, readLog);
    expect(diff.differingFrames).toBe(1);
    expect(diff.bytesChanged).toBe(1);
    expect(diff.diffs[0]!.offsets).toEqual([3]);
  });
});

describe('every planned frame is one the radio would actually be sent', () => {
  it('passes the real frame builder, checksum and address guards', () => {
    // The diff asks "are these the right bytes?". This asks "would they be sent
    // at all?" — dryRunWrite goes through buildWriteCommand, so a frame landing
    // on a forbidden flash-management offset throws instead of reaching a radio.
    const { plan } = setup();
    const validated = dryRunWrite(plan.frames);
    expect(validated.frames).toBe(plan.frames.length);
    expect(validated.payloadBytes).toBe(plan.payloadBytes);
    expect(validated.wireBytes).toBeGreaterThan(validated.payloadBytes);
  });

  it('never plans a frame on a forbidden flash-management offset', () => {
    // +0x3fbf0 and +0x3fff0 in every 0x40000 stride hold structured data in
    // otherwise-erased flash, and the vendor CPS writes them zero times.
    const { plan } = setup();
    for (const f of plan.frames) {
      const off = f.address % 0x40000;
      expect(off, `frame at 0x${f.address.toString(16)}`).not.toBe(0x3fbf0);
      expect(off, `frame at 0x${f.address.toString(16)}`).not.toBe(0x3fff0);
    }
  });
});
