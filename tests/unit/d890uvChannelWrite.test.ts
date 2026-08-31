import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseChannel, decodeBcdAsHexU32 } from '../../src/radios/d890uv/structures';
import {
  applyChannelToRecord,
  encodeBcdAsHexU32,
  encodeFrequencyMHz,
  encodeWideCharString,
  channelRecordFrames,
  assertOriginalRecord,
  D890_CHANNEL_RECORD_BYTES,
} from '../../src/radios/d890uv/channelWrite';

/** Real channel records off a DA-7X2. */
const DIR = join(__dirname, '../fixtures/d890uv');
const CHANNELS = [0, 1, 2, 3].map((i) => new Uint8Array(readFileSync(join(DIR, `channel-${i}.bin`))));

describe('DA-7X2 channel write: patch, never rebuild', () => {
  it('round-trips a real record byte for byte through parse and apply', () => {
    // THE test this module exists to pass. Parse a record off the radio, hand the
    // result straight back, and the bytes must be identical — including the
    // sixteen marshaller-provenance fields whose meaning is unverified and the
    // bytes with no name at all.
    //
    // A from-scratch encoder would fail this by zeroing everything it does not
    // know about, and the failure would be invisible on a radio: the channel
    // would still tune.
    for (const [i, original] of CHANNELS.entries()) {
      const { channel } = parseChannel(original, i);
      const patched = applyChannelToRecord(original, channel);
      expect(Array.from(patched), `channel ${i} changed under a no-op edit`).toEqual(
        Array.from(original),
      );
    }
  });

  it('refuses to encode without the original record', () => {
    // A caller with no original is asking for a from-scratch record. Failing at
    // the call site beats handing back 128 plausible-looking wrong bytes.
    expect(() => assertOriginalRecord(null)).toThrow(/needs the original/);
    expect(() => assertOriginalRecord(new Uint8Array(16))).toThrow(/16 bytes/);
  });

  it('changes only the bytes a rename should touch', () => {
    const original = CHANNELS[0];
    const { channel } = parseChannel(original, 0);
    const patched = applyChannelToRecord(original, { ...channel, name: 'HILLTOP' });
    const differing = [...original.keys()].filter((i) => original[i] !== patched[i]);
    // Every differing byte must lie inside the name field 0x44..0x65.
    expect(differing.every((i) => i >= 0x44 && i < 0x66)).toBe(true);
    expect(parseChannel(patched, 0).channel.name).toBe('HILLTOP');
  });

  it('pads names with NUL, matching every record on the radio', () => {
    // The decoder's comment claimed 0xFF padding. Every fixture says otherwise —
    // channels, zones, roaming zones and talkgroups all pad with 0x00. Writing
    // 0xFF would have flipped 16 bytes per name on every channel, and reads would
    // never have shown it because the decoder stops on either terminator.
    const field = encodeWideCharString('AB', 8);
    expect(Array.from(field)).toEqual([0x41, 0x00, 0x42, 0x00, 0x00, 0x00, 0x00, 0x00]);
  });

  it('has BCD encode and decode as exact inverses', () => {
    for (const v of [0, 1, 43506250, 14550000, 99999999]) {
      expect(decodeBcdAsHexU32(encodeBcdAsHexU32(v))).toBe(v);
    }
    // 435.06250 MHz -> the bytes VFO A actually held
    expect(Array.from(encodeFrequencyMHz(435.0625))).toEqual([0x43, 0x50, 0x62, 0x50]);
  });

  it('rejects a frequency that cannot be represented', () => {
    expect(() => encodeBcdAsHexU32(1e9)).toThrow(/outside/);
    expect(() => encodeBcdAsHexU32(-1)).toThrow(/outside/);
  });

  it('splits a record into eight frames, matching what the CPS sends', () => {
    // The captured vendor session writes every touched channel as all eight
    // frames — never partially. The record, not the frame, is the unit of work.
    const frames = channelRecordFrames(0x1000000, CHANNELS[0]);
    expect(frames).toHaveLength(8);
    expect(frames[0].address).toBe(0x1000000);
    expect(frames[7].address).toBe(0x1000070);
    expect(frames.every((f) => f.data.length === 0x10)).toBe(true);
    expect(D890_CHANNEL_RECORD_BYTES).toBe(0x80);
  });

  it('refuses a record of the wrong size rather than sending a short one', () => {
    expect(() => channelRecordFrames(0x1000000, new Uint8Array(64))).toThrow(/exactly/);
  });
});
