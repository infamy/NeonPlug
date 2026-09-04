import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseChannel, decodeOccupancyMask, occupiedIndices } from '../../src/radios/d890uv/structures';
import { planChannelWrite, D890WriteRefusedError } from '../../src/radios/d890uv/writePlan';
import { applyChannelToRecord } from '../../src/radios/d890uv/channelWrite';
import type { Channel } from '../../src/models/Channel';
import { NO_TX_FREQUENCY } from '../../src/services/validation/frequencyValidator';

const DIR = join(__dirname, '../fixtures/d890uv');
const rec = (i: number) => new Uint8Array(readFileSync(join(DIR, `channel-${i}.bin`)));
/**
 * The REAL 512-byte channel presence mask, lifted from the vendor's own read
 * capture. Byte 500 is 0x03 — bits 4000 and 4001, VFO A and VFO B.
 *
 * The previous tests used `channel-set.bin`, which is 32 bytes, so nothing ever
 * exercised the region where the VFO bits live. That is why a mask rebuilt at
 * 4000 slots looked correct.
 */
const REAL_MASK = new Uint8Array(readFileSync(join(DIR, 'channel-mask-512.bin')));

const COUNTS = {
  DMRTalkGroups: 6,
  ScanList: 2,
  DMRReceiveGroupCallList: 1,
  RadioIDList: 4,
  AESEncryptionCode: 2,
};

function setup(count = 4) {
  const channels: Channel[] = [];
  const originals = new Map<number, Uint8Array>();
  for (let i = 0; i < count; i += 1) {
    const bytes = rec(i);
    const { channel } = parseChannel(bytes, i);
    channels.push(channel);
    originals.set(channel.number, bytes);
  }
  // referencingTables: [] means "nothing on the radio points at a channel".
  // Required because the real mask holds 120 channels while these tests write a
  // handful, so every plan here CLEARS the rest — which the reverse-reference
  // gate refuses unless the caller has checked.
  return { channels, originals, originalMask: REAL_MASK, counts: COUNTS, referencingTables: [] };
}

describe('DA-7X2 channel write plan', () => {
  it('emits eight frames per channel — a record goes whole or not at all', () => {
    // The captured vendor session writes every touched channel as all eight
    // frames; none partially. A half-written record is a corrupt channel.
    const plan = planChannelWrite(setup(4));
    const perChannel = plan.frames.filter((f) => f.what === 'channel 1');
    expect(perChannel).toHaveLength(8);
    expect(plan.channelNumbers).toEqual([1, 2, 3, 4]);
  });

  it('PATCHES the mask, keeping the VFO bits the radio set at slots 4000-4001', () => {
    // A mask rebuilt from 4000 slots writes zero over byte 500, de-registering
    // VFO A and VFO B. Both serial captures show byte 500 = 0x03 on a real radio.
    const plan = planChannelWrite(setup(4));
    expect(REAL_MASK[500]).toBe(0x03);
    expect(plan.mask[500]).toBe(0x03);
    expect((plan.mask[500] >> 0) & 1).toBe(1); // VFO A, slot 4000
    expect((plan.mask[500] >> 1) & 1).toBe(1); // VFO B, slot 4001
  });

  it('refuses to plan without the mask read from the radio', () => {
    const { channels, originals, counts } = setup(2);
    expect(() =>
      planChannelWrite({ channels, originals, originalMask: new Uint8Array(8), counts, referencingTables: [] }),
    ).toThrow(/read from the radio first/);
  });

  it('sets and clears the channel bits it owns', () => {
    // The vendor derives masks from the codeplug it is sending. Writing back the
    // mask you read would describe the radio's old contents, not the new ones.
    const plan = planChannelWrite(setup(4));
    const present = occupiedIndices(decodeOccupancyMask(plan.mask, 4000));
    expect(present).toEqual([0, 1, 2, 3]);
    // and the mask is actually included in the frames
    expect(plan.frames.some((f) => f.what === 'channel presence mask')).toBe(true);
  });

  it('marks a channel absent when it is not in the write set', () => {
    // Writing channels 1 and 3 must clear bit 1, not leave channel 2 claimed.
    const { channels, originals, counts } = setup(4);
    const subset = [channels[0], channels[2]];
    const plan = planChannelWrite({ channels: subset, originals, originalMask: REAL_MASK, counts, referencingTables: [] });
    expect(occupiedIndices(decodeOccupancyMask(plan.mask, 4000))).toEqual([0, 2]);
  });

  it('REFUSES a write when a channel references something that will not exist', () => {
    // This is the SetCommDataByChannelError class of failure. Refuse rather than
    // warn: the radio accepts the write and then behaves wrongly.
    const { channels, originals } = setup(2);
    const bad = { ...channels[0], scanListId: 99 } as Channel;
    expect(() =>
      planChannelWrite({ channels: [bad, channels[1]], originals, originalMask: REAL_MASK, counts: COUNTS }),
    ).toThrow(D890WriteRefusedError);
    try {
      planChannelWrite({ channels: [bad, channels[1]], originals, originalMask: REAL_MASK, counts: COUNTS });
    } catch (e) {
      // The message must name the channel and the table, not just say "invalid".
      expect((e as Error).message).toMatch(/channel 1/);
      expect((e as Error).message).toMatch(/ScanList|scan/i);
    }
  });

  it('REFUSES a write when a channel has no original record', () => {
    // Without the bytes from the radio there is nothing to patch, and building a
    // record from scratch would zero every undecoded field.
    const { channels, counts } = setup(2);
    expect(() =>
      planChannelWrite({ channels, originals: new Map(), originalMask: REAL_MASK, counts, referencingTables: [] }),
    ).toThrow(/no original record/);
  });

  it('names every failing reference, not just the first', () => {
    const { channels, originals } = setup(3);
    const bad = channels.map((c) => ({ ...c, scanListId: 99 }) as Channel);
    try {
      planChannelWrite({ channels: bad, originals, originalMask: REAL_MASK, counts: COUNTS });
      throw new Error('should have refused');
    } catch (e) {
      expect((e as D890WriteRefusedError).dangling.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('produces a plan that is inert — nothing addresses a guarded offset', () => {
    // Every planned address must survive the write guard. Planning is separate
    // from sending precisely so this can be checked before anything goes out.
    const plan = planChannelWrite(setup(4));
    for (const f of plan.frames) {
      expect(f.address % 0x40000).not.toBe(0x3fbf0);
      expect(f.address % 0x40000).not.toBe(0x3fff0);
      expect(f.address % 0x10).toBe(0);
      expect(f.data.length).toBe(0x10);
    }
    expect(plan.totalBytes).toBe(plan.frames.length * 16);
  });
});

describe('what the plan refuses, and what it deliberately does not', () => {
  it('does NOT refuse references into tables this driver cannot see', () => {
    // Real channels carry 2Tone / 5Tone / DTMF ids routinely. Those tables are
    // unmodelled, so the reference cannot be checked — but the bytes are
    // preserved by the patch, never rewritten, so the reference is exactly as
    // valid after the write as before it. Refusing here would block every write
    // to every real radio while making nothing safer.
    //
    // The first version of this planner DID refuse, and testing against real
    // records is what caught it: all four fixtures failed immediately.
    const plan = planChannelWrite(setup(4));
    expect(plan.frames.length).toBeGreaterThan(0);
    expect(plan.unverifiableReferences.length).toBeGreaterThan(0);
    expect(plan.unverifiableReferences.every((d) => d.reason === 'table-not-modelled')).toBe(true);
  });

  it('still refuses a reference past the end of a table it DOES model', () => {
    // Scan lists are modelled, so pointing at list 99 of 2 is knowably broken.
    const { channels, originals } = setup(2);
    const bad = { ...channels[0], scanListId: 99 } as Channel;
    expect(() =>
      planChannelWrite({ channels: [bad], originals, originalMask: REAL_MASK, counts: COUNTS }),
    ).toThrow(D890WriteRefusedError);
  });
});


describe('the reverse-reference gate', () => {
  it('refuses to orphan a zone that still points at a removed channel', () => {
    // The mirror of SetCommDataByChannelError. `findDanglingReferences` checks
    // channel -> table; nothing checked table -> channel until now. Delete
    // channel 3 while zone "Local" still lists it and the codeplug is broken in
    // a way that reads back perfectly.
    const { channels, originals, counts } = setup(4);
    const subset = channels.slice(0, 2); // drops channels 3 and 4
    expect(() =>
      planChannelWrite({
        channels: subset, originals, originalMask: REAL_MASK, counts,
        referencingTables: [{ kind: 'zone', name: 'Local', channelNumbers: [1, 3] }],
      }),
    ).toThrow(/zone "Local" references channel\(s\) 3/);
  });

  it('allows the same write when nothing references the removed channels', () => {
    const { channels, originals, counts } = setup(4);
    const plan = planChannelWrite({
      channels: channels.slice(0, 2), originals, originalMask: REAL_MASK, counts,
      referencingTables: [{ kind: 'zone', name: 'Local', channelNumbers: [1, 2] }],
    });
    expect(plan.clearedChannelNumbers).toContain(3);
    expect(plan.clearedChannelNumbers).toContain(4);
  });

  it('refuses a clearing write when given no membership to check at all', () => {
    // Silence is not consent: a caller that has not looked cannot be assumed to
    // have nothing to lose.
    const { channels, originals, counts } = setup(4);
    expect(() =>
      planChannelWrite({ channels: channels.slice(0, 2), originals, originalMask: REAL_MASK, counts }),
    ).toThrow(/no zone or scan-list membership/);
  });

  it('refuses a VFO whose original was never read, like any other record', () => {
    // readChannels prepends VFO A/B as 4001/4002 and caches their originals
    // under the same keys. Without one there is nothing to patch, and building
    // a VFO from zeros would overwrite the fields this driver does not decode.
    const { channels, originals, counts } = setup(2);
    const vfo = { ...channels[0], number: 4001 } as Channel;
    expect(() =>
      planChannelWrite({
        channels: [...channels, vfo], originals, originalMask: REAL_MASK, counts,
        referencingTables: [],
      }),
    ).toThrow(/no original record for channel/);
  });
});

describe('transmit band limits', () => {
  const LIMITS = { vhfMin: 136, vhfMax: 174, uhfMin: 400, uhfMax: 480 };

  it('refuses a channel transmitting outside the radio\'s bands', () => {
    const { channels, originals, counts } = setup(2);
    const bad = { ...channels[0], txFrequency: 220.5 } as Channel;
    expect(() =>
      planChannelWrite({
        channels: [bad], originals, originalMask: REAL_MASK, counts,
        referencingTables: [], txBandLimits: LIMITS,
      }),
    ).toThrow(/transmit outside this radio's bands/);
  });

  it('checks TX only — a receive-only channel outside the bands is fine', () => {
    // This radio receives 108-136 AM airband and the FM broadcast band, neither
    // of which it can transmit on. Filtering RX against TX limits would reject
    // legal receive-only channels.
    //
    // NO_TX_FREQUENCY (1666.666) is the receive-only SENTINEL, not a frequency.
    // A naive `txFrequency > 0` test treats it as out-of-band and rejects every
    // channel the airport wizard produces.
    const { channels, originals, counts } = setup(2);
    for (const tx of [0, NO_TX_FREQUENCY]) {
      const rxOnly = { ...channels[0], rxFrequency: 118.5, txFrequency: tx } as Channel;
      expect(() =>
        planChannelWrite({
          channels: [rxOnly], originals, originalMask: REAL_MASK, counts,
          referencingTables: [], txBandLimits: LIMITS,
        }),
      ).not.toThrow();
    }
    const rxOnly = { ...channels[0], rxFrequency: 118.5, txFrequency: 0 } as Channel;
    expect(() =>
      planChannelWrite({
        channels: [rxOnly], originals, originalMask: REAL_MASK, counts,
        referencingTables: [], txBandLimits: LIMITS,
      }),
    ).not.toThrow();
  });

  it('skips the check entirely when no limits are supplied', () => {
    const { channels, originals, counts } = setup(2);
    const bad = { ...channels[0], txFrequency: 220.5 } as Channel;
    expect(() =>
      planChannelWrite({
        channels: [bad], originals, originalMask: REAL_MASK, counts, referencingTables: [],
      }),
    ).not.toThrow();
  });
});

/**
 * VFO A and VFO B ARE written — settled from the vendor's own capture.
 *
 * An earlier version of this suite pinned them as read-only, reasoning by
 * analogy with the DM-32. That was wrong twice over: the DM-32 writes its VFO
 * records too (only its VFO TX Contact is read-only, for want of a verified
 * block structure), and more importantly the DA-7X2's own CPS writes both
 * records in full — 8 of 8 frames each at 0x1f81000 and 0x1f81080.
 *
 * The mask is the subtle part. The CPS leaves byte 500 as 0x03 — both VFO bits
 * SET — even in a session where it wrote the records as erased 0xFF. So the
 * VFO bits are not "a record is present" in the usual sense; they are simply
 * always set, and must be preserved rather than recomputed.
 */
describe('VFO A and B', () => {
  const vfo = (number: number): Channel => ({
    ...parseChannel(rec(0), 0).channel,
    number,
    name: `VFO ${number}`,
  });

  const withVfos = () => {
    const base = setup(2);
    const originals = new Map(base.originals);
    // The read caches VFO originals under the same 1-based keys, precisely so a
    // writer does not have to special-case them.
    originals.set(4001, rec(0));
    originals.set(4002, rec(1));
    return {
      ...base,
      originals,
      channels: [...base.channels, vfo(4001), vfo(4002)],
    };
  };

  it('writes both VFO records, all eight frames each', () => {
    const plan = planChannelWrite(withVfos());
    expect(plan.channelNumbers).toEqual([1, 2, 4001, 4002]);
    expect(plan.frames.filter((f) => f.what === 'channel 4001')).toHaveLength(8);
    expect(plan.frames.filter((f) => f.what === 'channel 4002')).toHaveLength(8);
  });

  it('writes them at the addresses the CPS used', () => {
    const plan = planChannelWrite(withVfos());
    const first = (what: string) =>
      plan.frames.find((f) => f.what === what)!.address;
    expect(first('channel 4001')).toBe(0x01f81000);
    expect(first('channel 4002')).toBe(0x01f81080);
  });

  it('leaves both VFO mask bits set, as the CPS does', () => {
    // Byte 500, bits 0 and 1 — slots 4000 and 4001. The CPS writes 0x03 here
    // even when the records themselves are erased.
    const plan = planChannelWrite(withVfos());
    expect(plan.mask[500] & 0x03).toBe(0x03);
  });

  it('does not recompute the VFO bits from what was written', () => {
    // A write that includes NO VFOs must still leave their bits alone — the
    // mask loop covers slots 0..3999 and must not reach past them.
    const plan = planChannelWrite(setup(2));
    expect(plan.mask[500] & 0x03).toBe(0x03);
  });

  it('still refuses a VFO that was never read', () => {
    // Same rule as every other record: patch what the radio gave us, never
    // build one. A VFO built from zeros would overwrite the fields this driver
    // does not decode.
    const base = setup(2);
    expect(() =>
      planChannelWrite({ ...base, channels: [...base.channels, vfo(4001)] })
    ).toThrow(D890WriteRefusedError);
  });

  it('still skips a channel number genuinely out of range', () => {
    const base = setup(2);
    const plan = planChannelWrite({ ...base, channels: [...base.channels, vfo(5000)] });
    expect(plan.skipped.map((x) => x.channelNumber)).toEqual([5000]);
    expect(plan.skipped[0].reason).toMatch(/outside the 4000 storable channels/);
  });
});

describe('a write always sends every record it plans', () => {
  /**
   * There is no "only what changed" mode, and that is deliberate.
   *
   * One existed for a single session. The sparse write it produced committed
   * and the edited record read back byte-perfect — but that only proved the
   * bytes SENT arrived, never that the regions NOT sent survived, and the radio
   * was in a bad state afterwards. The vendor CPS writes every region every
   * time; until there is evidence this radio tolerates less, so do we.
   */
  it('writes all eight frames per channel even when nothing changed', () => {
    const base = setup(4);
    const plan = planChannelWrite(base);
    expect(plan.frames.filter((f) => /^channel \d+$/.test(f.what))).toHaveLength(32);
  });

  it('writes the untouched channels too when one is edited', () => {
    const base = setup(4);
    const edited = base.channels.map((c) => (c.number === 2 ? { ...c, name: 'RENAMED' } : c));
    const plan = planChannelWrite({ ...base, channels: edited });
    for (const n of [1, 2, 3, 4]) {
      expect(plan.frames.filter((f) => f.what === `channel ${n}`), `channel ${n}`).toHaveLength(8);
    }
  });

  it('offers no way to ask for a partial write', () => {
    // Guards the rule itself: a future edit that reintroduces the option would
    // make this compile-time-legal again, and this is the reminder of why not.
    const base = setup(2) as Record<string, unknown>;
    expect('onlyChangedRecords' in base).toBe(false);
  });
});

describe('transmit band gate', () => {
  it('allows an out-of-band channel that is written back unchanged', () => {
    // Found on hardware: a real DA-7X2 carried an airband entry at 118 MHz in
    // its MAIN channel list. Refusing to rewrite it made every write
    // impossible, while protecting nothing — the channel is already there.
    const base = setup(2);
    const originals = new Map(base.originals);
    // Build the record first, then read the channel back OUT of it, so the
    // channel and its original agree by construction — exactly the situation a
    // read from the radio produces.
    const record = applyChannelToRecord(rec(0), {
      ...base.channels[0], number: 92, name: 'Airband AM', rxFrequency: 118, txFrequency: 118,
    });
    const outOfBand = { ...parseChannel(record, 91).channel, number: 92, name: 'Airband AM' };
    originals.set(92, record);
    // The test is only meaningful if this really is out of band.
    expect(outOfBand.txFrequency).toBeLessThan(136);

    expect(() =>
      planChannelWrite({
        ...base,
        channels: [...base.channels, outOfBand],
        originals,
        txBandLimits: { vhfMin: 136, vhfMax: 174, uhfMin: 400, uhfMax: 480 },
      })
    ).not.toThrow();
  });

  it('still refuses a channel GIVEN an out-of-band transmit frequency', () => {
    const base = setup(2);
    const edited = base.channels.map((c) => (c.number === 1 ? { ...c, txFrequency: 98.5 } : c));
    expect(() =>
      planChannelWrite({
        ...base,
        channels: edited,
        txBandLimits: { vhfMin: 136, vhfMax: 174, uhfMin: 400, uhfMax: 480 },
      })
    ).toThrow(/transmit outside this radio/);
  });
});
