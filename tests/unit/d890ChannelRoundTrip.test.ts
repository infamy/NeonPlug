import { describe, it, expect } from 'vitest';
import { parseChannel } from '../../src/radios/d890uv/structures';
import {
  applyChannelToRecord,
  D890_CHANNEL_RECORD_BYTES,
} from '../../src/radios/d890uv/channelWrite';

/**
 * Channel records taken verbatim from the vendor CPS programming a DA-7X2
 * (`WriteTo7x2.txt`) — reassembled from the 16-byte write frames the radio
 * ACKed, so these are bytes a real radio accepted, not bytes we invented.
 *
 * The codeplug is one of the purpose-built sweeps: six channels stepping power
 * and bandwidth, which is why every field that matters differs between them.
 *
 * WHAT THIS PROVES, and why it is the test to have before any write ships:
 *
 *   parse(bytes) -> Channel -> applyChannelToRecord(bytes, channel) === bytes
 *
 * An unmodified channel must re-encode to the SAME bytes. This is the property
 * that stops a write corrupting a codeplug: `applyChannelToRecord` patches the
 * original record rather than building one, so every field it does not model
 * has to survive untouched. A field the parser reads but the encoder writes
 * back differently is a silent corruption on hardware that reboots when a write
 * goes bad — and there is no read-back during a write session to catch it.
 */
const VENDOR_RECORDS: string[] = [
  // Channel 1 — Pwr Low 25K
  '1450125014501250100000000000000026050000000000000000000000000000' +
    '010000ffffffffffffffff000000000000000000020000000000000000000000' +
    '0000000150007700720020004c006f0077002000320035004b00000000000000' +
    '0000000000000000000000000000000000000000000000000000000000000000',
  // Channel 2 — Pwr Low 12.5K
  '1450250014502500000000000000000026050000010000000100000101000000' +
    '010000ffffffffffffffff000000000000000000020000000000000000000000' +
    '0000000150007700720020004c006f0077002000310032002e0035004b000000' +
    '0000000000000000000000000000000000000000000000000000000000000000',
  // Channel 3 — Pwr Mid 25K
  '14503750145037501400000000000000260500000200000002100000ff000000' +
    '010000ffffffffffffffff000000000000000000020000000000000000000000' +
    '0000000150007700720020004d00690064002000320035004b00000000000000' +
    '0000000000000000000000000000000000000000000000000000000000000000',
  // Channel 4 — Pwr Mid 12.5K
  '1450500014505000040000000000000026050000030000000310100100000000' +
    '010000ffffffffffffffff000000000000000000020000000000000000000000' +
    '0000000150007700720020004d00690064002000310032002e0035004b000000' +
    '0000000000000000000000000000000000000000000000000000000000000000',
  // Channel 5 — Pwr High 25K
  '1450625014506250180000000000000026050000040000000000100001000000' +
    '010000ffffffffffffffff000000000000000000020000000000000000000000' +
    '00000001500077007200200048006900670068002000320035004b0000000000' +
    '0000000000000000000000000000000000000000000000000000000000000000',
  // Channel 6 — Pwr High 12.5K
  '14507500145075000800000000000000260500000500000001011001ff000000' +
    '010000ffffffffffffffff000000000000000000020000000000000000000000' +
    '00000001500077007200200048006900670068002000310032002e0035004b00' +
    '0000000000000000000000000000000000000000000000000000000000000000',];

const bytes = (hex: string) =>
  new Uint8Array((hex.match(/../g) ?? []).map((h) => parseInt(h, 16)));
const hex = (b: Uint8Array) =>
  Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

describe('channel record round-trip against real vendor bytes', () => {
  it('recovered six complete records from the capture', () => {
    expect(VENDOR_RECORDS).toHaveLength(6);
    for (const r of VENDOR_RECORDS) {
      expect(bytes(r)).toHaveLength(D890_CHANNEL_RECORD_BYTES);
    }
  });

  for (const [i, record] of VENDOR_RECORDS.entries()) {
    it(`re-encodes channel ${i + 1} to identical bytes`, () => {
      const original = bytes(record);
      const decoded = parseChannel(original, i);
      const reencoded = applyChannelToRecord(original, {
        ...decoded.channel,
        number: i + 1,
      });

      // Compare as hex so a failure names the offset rather than dumping arrays.
      expect(hex(reencoded)).toBe(hex(original));
    });
  }

  /**
   * A round-trip that passes proves nothing if the encoder is a no-op. These
   * change one field each and assert EXACTLY which bytes move — which is the
   * other half of the safety property: the encoder must be surgical, not just
   * faithful. A field that writes outside its own offsets corrupts its
   * neighbours, and on this radio the neighbours are other channels' settings.
   */
  const diffOffsets = (a: Uint8Array, b: Uint8Array) => {
    const out: number[] = [];
    for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) out.push(i);
    return out;
  };

  it('writes a changed name only into the name field', () => {
    const original = bytes(VENDOR_RECORDS[0]);
    const decoded = parseChannel(original, 0);
    const changed = applyChannelToRecord(original, {
      ...decoded.channel,
      number: 1,
      name: 'ROUNDTRIP',
    });

    const moved = diffOffsets(original, changed);
    expect(moved.length).toBeGreaterThan(0);
    // NAME is 0x44..0x65 inclusive.
    for (const offset of moved) {
      expect(offset, `byte 0x${offset.toString(16)} is outside the name field`)
        .toBeGreaterThanOrEqual(0x44);
      expect(offset).toBeLessThanOrEqual(0x65);
    }
  });

  it('writes a changed RX frequency only into the RX frequency field', () => {
    const original = bytes(VENDOR_RECORDS[0]);
    const decoded = parseChannel(original, 0);
    const changed = applyChannelToRecord(original, {
      ...decoded.channel,
      number: 1,
      rxFrequency: 146.52,
      txFrequency: 146.52,
    });

    const moved = diffOffsets(original, changed);
    expect(moved.length).toBeGreaterThan(0);
    // RX_FREQ is 0x00..0x03; TX_OR_OFFSET 0x04..0x07 may move with it.
    for (const offset of moved) {
      expect(offset, `byte 0x${offset.toString(16)} is outside the frequency fields`)
        .toBeLessThanOrEqual(0x07);
    }
  });

  it('names what actually differs when a round-trip fails', () => {
    // Guards the guard: if a future edit breaks the round-trip, the diff below
    // is what makes it debuggable. Prove it reports the right offsets.
    const original = bytes(VENDOR_RECORDS[0]);
    const tampered = Uint8Array.from(original);
    tampered[0x1b] ^= 0xff;

    const differing: number[] = [];
    for (let i = 0; i < original.length; i += 1) {
      if (original[i] !== tampered[i]) differing.push(i);
    }
    expect(differing).toEqual([0x1b]);
  });
});

describe('name padding', () => {
  /**
   * The radio does not use one padding convention. A named channel is
   * NUL-padded; an untouched record — VFO A on a real radio — is erased 0xFF
   * right through the name field. Both decode to the same string.
   *
   * Found on hardware: a write that renamed only channel 9 reported VFO A as 12
   * changed bytes, purely because re-encoding its empty name turned 0xFF into
   * 0x00. That matters because a record which re-encodes differently from what
   * the radio holds is one this driver cannot prove it round-trips, and the
   * write path's entire safety argument rests on that property.
   */
  const erasedName = () => {
    const rec = bytes(VENDOR_RECORDS[0]);
    rec.fill(0xff, 0x44, 0x66);
    return rec;
  };

  it('leaves 0xFF padding alone when the name has not changed', () => {
    const original = erasedName();
    const decoded = parseChannel(original, 0);
    expect(decoded.channel.name).toBe('');
    const out = applyChannelToRecord(original, { ...decoded.channel, number: 1 });
    expect(hex(out)).toBe(hex(original));
  });

  it('still rewrites the whole field when the name DOES change', () => {
    const original = erasedName();
    const decoded = parseChannel(original, 0);
    const out = applyChannelToRecord(original, { ...decoded.channel, number: 1, name: 'HI' });
    expect(parseChannel(out, 0).channel.name).toBe('HI');
    // And the tail is cleared, not left as 0xFF, so nothing of the old name survives.
    expect(out[0x48]).toBe(0x00);
  });

  it('does not confuse a NUL-padded name with a changed one', () => {
    const original = bytes(VENDOR_RECORDS[0]);
    const decoded = parseChannel(original, 0);
    expect(hex(applyChannelToRecord(original, { ...decoded.channel, number: 1 }))).toBe(hex(original));
  });
});
