import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseChannel, decodeBcdAsHexU32 } from '../../src/radios/d890uv/structures';
import type { Channel } from '../../src/models/Channel';
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

describe('name length', () => {
  it('refuses a 17-character name rather than truncating it', () => {
    // The field is 34 bytes = 17 units, but the decoder reads 16 and the vendor
    // caps at 16 — a 17th character would fill the field with no terminator.
    // Silently truncating hides the loss from the user.
    const original = CHANNELS[0];
    const { channel } = parseChannel(original, 0);
    expect(() =>
      applyChannelToRecord(original, { ...channel, name: 'A'.repeat(17) }),
    ).toThrow(/at most 16/);
    // 16 is fine
    expect(() =>
      applyChannelToRecord(original, { ...channel, name: 'A'.repeat(16) }),
    ).not.toThrow();
  });
});

describe('edits actually land — the test class that was missing', () => {
  // Every earlier test here was a no-op round trip or an assertion about the
  // planner's own arithmetic. None could see that ~49 decoded fields were never
  // written, so an edit to any of them silently evaporated. These edit-then-
  // reparse cases are what catch that.
  const edit = (over: Partial<Channel>) => {
    const original = CHANNELS[0];
    const { channel } = parseChannel(original, 0);
    const patched = applyChannelToRecord(original, { ...channel, ...over });
    return parseChannel(patched, 0).channel;
  };

  it('writes colour code, contact, scan list, RX group and radio ID', () => {
    const c = edit({
      colorCode: 7, contactId: 3, scanListId: 2, rxGroupListId: 1, dmrRadioIdIndex: 2,
    });
    expect(c.colorCode).toBe(7);
    expect(c.contactId).toBe(3);
    expect(c.scanListId).toBe(2);
    expect(c.rxGroupListId).toBe(1);
    expect(c.dmrRadioIdIndex).toBe(2);
  });

  it('writes power and bandwidth without disturbing duplex', () => {
    const original = CHANNELS[0];
    const before = original[0x08] & 0xc0;
    const { channel } = parseChannel(original, 0);
    const patched = applyChannelToRecord(original, { ...channel, power: 'Turbo', bandwidth: '25kHz' });
    expect(parseChannel(patched, 0).channel.power).toBe('Turbo');
    expect(parseChannel(patched, 0).channel.bandwidth).toBe('25kHz');
    // duplex bits 7-6 preserved: changing them silently moves the TX frequency
    expect(patched[0x08] & 0xc0).toBe(before);
  });

  it('round-trips all four channel types, mixed modes included', () => {
    // 0 A-Analog, 1 D-Digital, 2 A+D TX A, 3 D+A TX D. The parser used to
    // collapse 2 and 3 into plain Analog/Digital, so re-writing a mixed channel
    // flattened it permanently. Both radios in this project have mixed modes.
    const expected = ['Analog', 'Digital', 'Fixed Analog', 'Fixed Digital'];
    for (let type = 0; type < 4; type += 1) {
      const original = Uint8Array.from(CHANNELS[0]);
      original[0x08] = (original[0x08] & 0xfc) | type;
      const { channel } = parseChannel(original, 0);
      expect(channel.mode).toBe(expected[type]);
      const patched = applyChannelToRecord(original, { ...channel, power: 'Low' });
      expect(patched[0x08] & 0x03, `type ${type} survived the write`).toBe(type);
    }
  });

  it('writes the 0x21 and 0x34 bitfields without touching the held-back bits', () => {
    const original = Uint8Array.from(CHANNELS[0]);
    original[0x21] = 0xff; // every bit set, including the excluded ones
    original[0x34] = 0xff;
    const { channel } = parseChannel(original, 0);
    const patched = applyChannelToRecord(original, {
      ...channel, slotSuit: false, aprsReceive: false, loneWorker: false,
      slotOperation: 0, autoScan: false, excludeFromRoaming: false,
    });
    // bit 6 of 0x21 (AES algorithm selector) and bits 5/6 of 0x34 survive
    expect((patched[0x21] >> 6) & 1).toBe(1);
    expect((patched[0x34] >> 5) & 1).toBe(1);
    expect((patched[0x34] >> 6) & 1).toBe(1);
    // and the writable ones cleared
    expect((patched[0x21] >> 4) & 1).toBe(0);
  });

  it('stores tone IDs zero-based, matching the vendor', () => {
    // The model is 1-based; the record is 0-based with 0xFF for none. Writing
    // the model value raw shifts every reference by one slot.
    const c = edit({ twoToneId: 4, fiveToneId: 1, dtmfId: 0 });
    expect(c.twoToneId).toBe(4);
    expect(c.fiveToneId).toBe(1);
    expect(c.dtmfId).toBe(0);
  });

  it('clears Busy Lock on a digital channel, as the radio itself does', () => {
    // Confirmed on hardware: switching a channel to digital zeroes 0x1a by
    // itself. Writing a value there would produce a read-back mismatch that is
    // the radio behaving correctly.
    const original = CHANNELS[0];
    const { channel } = parseChannel(original, 0);
    const patched = applyChannelToRecord(original, { ...channel, mode: 'Digital', busyLock: 2 });
    expect(patched[0x1a] & 0x0f).toBe(0);
  });
});

describe('encryption key slot (0x22)', () => {
  it('writes the key slot, 1-based with 0 meaning off', () => {
    // Confirmed on hardware 2026-08-31: enabling encryption on channel 56 and
    // picking a key from the CPS dropdown gave that channel 0x22 = 0x01 while
    // all 15 neighbours stayed 0x00. It is a SLOT index, not a free-form id.
    const original = CHANNELS[0];
    const { channel } = parseChannel(original, 0);
    const on = applyChannelToRecord(original, { ...channel, emergencySystemIndex: 1 });
    expect(on[0x22]).toBe(1);
    const off = applyChannelToRecord(original, { ...channel, emergencySystemIndex: 0 });
    expect(off[0x22]).toBe(0);
  });
});

describe('ARC4 key slot (0x3d)', () => {
  it('writes 0x22 and 0x3d together, so a key keeps its type', () => {
    // Hardware 2026-08-31: two channels given keys in the CPS —
    //   ch 56 ARC4 idx 1 -> 0x22 = 01, 0x3d = 01
    //   ch 57 AES  idx 2 -> 0x22 = 02, 0x3d = 00
    // Writing 0x22 alone would leave an ARC4 assignment indistinguishable from
    // an AES one, since 0x3d is the only byte that separates them.
    const original = CHANNELS[0];
    const { channel } = parseChannel(original, 0);
    const arc4 = applyChannelToRecord(original, {
      ...channel, emergencySystemIndex: 1, arc4Code: 1,
    });
    expect([arc4[0x22], arc4[0x3d]]).toEqual([1, 1]);
    const aes = applyChannelToRecord(original, {
      ...channel, emergencySystemIndex: 2, arc4Code: 0,
    });
    expect([aes[0x22], aes[0x3d]]).toEqual([2, 0]);
  });
});
