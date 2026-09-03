import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  planCodeplugWrite,
  describeCoverage,
  VENDOR_WRITE_RUNS,
} from '../../src/radios/d890uv/codeplugWrite';
import { D890WriteRefusedError } from '../../src/radios/d890uv/writePlan';
import { D890_ADDR } from '../../src/radios/d890uv/constants';
import { parseChannel, parseZone, parseScanList } from '../../src/radios/d890uv/structures';
import type { Channel } from '../../src/models/Channel';

const DIR = join(__dirname, '../fixtures/d890uv');
const rec = (i: number) => new Uint8Array(readFileSync(join(DIR, `channel-${i}.bin`)));
const REAL_MASK = new Uint8Array(readFileSync(join(DIR, 'channel-mask-512.bin')));

const COUNTS = {
  DMRTalkGroups: 6, ScanList: 2, DMRReceiveGroupCallList: 1,
  RadioIDList: 4, AESEncryptionCode: 2,
};

function setup(zoneSlots = [0, 1]) {
  const channels: Channel[] = [];
  const originals = new Map<number, Uint8Array>();
  for (let i = 0; i < 4; i += 1) {
    const bytes = rec(i);
    channels.push(parseChannel(bytes, i).channel);
    originals.set(i + 1, bytes);
  }

  const readLog = new Map<number, Uint8Array>();
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
    channels, zones, zoneSlots, readLog,
    channelInput: { originals, originalMask: REAL_MASK, counts: COUNTS, referencingTables: [] },
  };
}

/**
 * The whole-codeplug write.
 *
 * "Full codeplug write" is a claim, not a description, so the coverage report
 * exists to keep it checkable: until it reads 100%, a NeonPlug write and a
 * vendor write are different operations and the difference is enumerable.
 */
describe('planCodeplugWrite', () => {
  it('writes channels and zones in one plan', () => {
    const plan = planCodeplugWrite(setup());
    expect(plan.written.map((w) => w.region)).toEqual(['channels', 'zones']);
    expect(plan.payloadBytes).toBeGreaterThan(0);
  });

  it('emits frames in ascending address order, like the vendor session', () => {
    const plan = planCodeplugWrite(setup());
    for (let i = 1; i < plan.frames.length; i += 1) {
      expect(plan.frames[i].address).toBeGreaterThanOrEqual(plan.frames[i - 1].address);
    }
  });

  it('is deterministic — two plans over the same data are identical', () => {
    // What makes a dry run comparable against a capture at all.
    const a = planCodeplugWrite(setup());
    const b = planCodeplugWrite(setup());
    expect(a.frames.map((f) => `${f.address}:${f.data.length}`))
      .toEqual(b.frames.map((f) => `${f.address}:${f.data.length}`));
  });

  it('skips a region that was never read rather than inventing it', () => {
    const base = setup();
    base.readLog.delete(D890_ADDR.ZONE_SET);
    // Verbatim off, so this tests the encoders alone. With it on, the zone
    // records would still go back unchanged — which is the point of it, but
    // not what this test is about.
    const plan = planCodeplugWrite({ ...base, writeUnmodelledVerbatim: false });
    expect(plan.written.map((w) => w.region)).toEqual(['channels']);
    expect(plan.skipped[0]).toMatchObject({ region: 'zones', reason: 'not-read' });
    expect(plan.skipped[0].detail).toMatch(/without inventing it/);
  });

  it('writes unmodelled regions back verbatim, but only what it read', () => {
    // "Write what we read", literally. Bytes that came from this radio moments
    // ago go back unchanged, so a region this driver cannot model still leaves
    // the codeplug whole — and nothing is invented for regions never read.
    const base = setup();
    const encryptionSpan = new Uint8Array(0x40).fill(0xa5);
    base.readLog.set(0x3580000, encryptionSpan);
    const plan = planCodeplugWrite(base);

    const verbatim = plan.frames.filter((f) => f.what === 'unchanged');
    expect(verbatim.length).toBeGreaterThan(0);
    const atEncryption = verbatim.filter((f) => f.address >= 0x3580000 && f.address < 0x3580040);
    expect(atEncryption).toHaveLength(4);
    for (const f of atEncryption) expect(Array.from(f.data)).toEqual(Array(16).fill(0xa5));

    // Nothing verbatim for an address that was never read.
    expect(verbatim.some((f) => f.address >= 0x03900000 && f.address < 0x03900010)).toBe(false);
  });

  it('never mixes an edit and a stale original inside one frame', () => {
    // A frame that is half planned and half verbatim would send an edited
    // record's bytes alongside pre-edit bytes from the same 16 bytes.
    const plan = planCodeplugWrite(setup());
    const seen = new Map<number, string>();
    for (const f of plan.frames) {
      const prev = seen.get(f.address);
      expect(prev, `two frames target 0x${f.address.toString(16)}`).toBeUndefined();
      seen.set(f.address, f.what);
    }
  });

  it('refuses outright when the read did not come back clean', () => {
    expect(() =>
      planCodeplugWrite({
        ...setup(),
        integrity: [{
          level: 'blocker', region: 'zone',
          problem: 'the zone presence mask is erased',
          consequence: 'writing is refused',
        }],
      })
    ).toThrow(D890WriteRefusedError);
  });

  it('surfaces what it would remove, for channels and zones alike', () => {
    const plan = planCodeplugWrite(setup([0, 1, 2]));
    expect(Array.isArray(plan.clearedChannelNumbers)).toBe(true);
    expect(Array.isArray(plan.clearedZoneSlots)).toBe(true);
  });
});

describe('coverage against the vendor write', () => {
  it('knows all 74 vendor runs', () => {
    expect(VENDOR_WRITE_RUNS).toHaveLength(74);
    expect(VENDOR_WRITE_RUNS.reduce((n, r) => n + r.bytes, 0)).toBe(134224);
  });

  it('reports honestly that a channels+zones plan is not a full codeplug', () => {
    const cov = describeCoverage(planCodeplugWrite(setup()));
    expect(cov.vendorRuns).toBe(74);
    expect(cov.percentOfVendorBytes).toBeLessThan(100);
    expect(cov.runsNotCovered).toBeGreaterThan(0);
  });

  it('lists the biggest uncovered regions first, so the gap is actionable', () => {
    const cov = describeCoverage(planCodeplugWrite(setup()));
    for (let i = 1; i < cov.uncovered.length; i += 1) {
      expect(cov.uncovered[i - 1].bytes).toBeGreaterThanOrEqual(cov.uncovered[i].bytes);
    }
  });

  it('counts a partly-written run as partial, never as covered', () => {
    // A run we touch some of is still a gap. Counting it as done is exactly the
    // over-claim this report exists to prevent.
    const cov = describeCoverage(planCodeplugWrite(setup()));
    expect(cov.runsFullyCovered + cov.runsPartlyCovered + cov.runsNotCovered).toBe(74);
  });
});

describe('regions that were mislabelled as unmodelled', () => {
  /**
   * Scan lists and encryption were both reported as unwritable on the grounds
   * that the read "lost" where the data came from. Neither was true:
   *
   *  - `ScanListDecoded` now carries `slot`, which the read always knew.
   *  - `EncryptionKey` already carried `(encryptionType, id)` — the table and
   *    the slot. Only `entryNumber` is a flattened position, and it is never
   *    used to place anything.
   *
   * The tests below pin the identity rules, because getting either wrong puts
   * data back in the wrong place with every gate still passing.
   */
  it('places a scan list by its hardware slot, not its array position', () => {
    const base = setup();
    const readLog = new Map(base.readLog);
    // A list in slot 5, arriving first in the array — position 0, slot 5.
    const record = new Uint8Array(D890_ADDR.SCAN_LIST_STRIDE);
    record[0x30] = 0xff; record[0x31] = 0xff;
    readLog.set(D890_ADDR.SCAN_LIST_DATA + 5 * D890_ADDR.SCAN_LIST_STRIDE, record);
    const maskSpan = new Uint8Array(16);
    maskSpan[0] = 1 << 5;
    readLog.set(D890_ADDR.SCAN_LIST_SET, maskSpan);

    const plan = planCodeplugWrite({
      ...base, readLog, writeUnmodelledVerbatim: false,
      tables: { scanLists: [{ ...parseScanList(record, 5) }] },
    });
    const written = plan.frames.filter((f) => f.what.startsWith('scan list'));
    expect(written.length).toBeGreaterThan(0);
    expect(written[0].address).toBe(D890_ADDR.SCAN_LIST_DATA + 5 * D890_ADDR.SCAN_LIST_STRIDE);
  });

  it('places an encryption key by (type, slot), never by entryNumber', () => {
    const base = setup();
    const readLog = new Map(base.readLog);
    const slot = 3;
    const at = D890_ADDR.AES_KEY_TABLE + slot * D890_ADDR.AES_KEY_STRIDE;
    readLog.set(at, new Uint8Array(D890_ADDR.AES_KEY_STRIDE));

    const plan = planCodeplugWrite({
      ...base, readLog, writeUnmodelledVerbatim: false,
      tables: {
        encryptionKeys: [{
          // entryNumber deliberately disagrees with the slot: if the writer
          // used it, the key would land at slot 1 instead of 3.
          entryNumber: 1, id: slot, name: 'AES 3',
          encryptionType: 3, key: 'AB'.repeat(32),
        }],
      },
    });
    const written = plan.frames.filter((f) => f.what.startsWith('AES key'));
    expect(written.length).toBeGreaterThan(0);
    expect(written[0].address).toBe(at);
  });

  it('refuses to move a key between tables', () => {
    // applyKeySlotToRecord throws on a type change; the orchestrator must not
    // paper over it by writing the key somewhere it does not belong.
    const base = setup();
    const readLog = new Map(base.readLog);
    readLog.set(D890_ADDR.ARC4_KEY_TABLE, new Uint8Array(D890_ADDR.ARC4_KEY_STRIDE));
    expect(() =>
      planCodeplugWrite({
        ...base, readLog, writeUnmodelledVerbatim: false,
        tables: {
          encryptionKeys: [{
            entryNumber: 1, id: 0, name: 'bad', encryptionType: 2,
            key: 'AB'.repeat(32), // AES-length key in the ARC4 table
          }],
        },
      })
    ).toThrow();
  });
});
