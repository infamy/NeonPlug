import { describe, it, expect } from 'vitest';
import {
  FLAG,
  applyChannels,
  decodeFrequency,
  decodeTone,
  encodeChannel,
  encodeFrequency,
  encodeTone,
  isEmptySlot,
  parseAllChannels,
  parseChannel,
  slotOf,
} from '../../src/radios/rt950pro/structures';
import { RT950PRO_CHANNEL_SIZE, RT950PRO_IMAGE_SIZE } from '../../src/radios/rt950pro/constants';
import { createDefaultChannel } from '../../src/utils/channelHelpers';

/** A channel slot as the radio might hold one, with every field this app doesn't model set. */
function radioSlot(): Uint8Array {
  const slot = new Uint8Array(RT950PRO_CHANNEL_SIZE).fill(0xff);
  encodeFrequency(146.52, slot, 0);
  encodeFrequency(146.52, slot, 4);
  slot.set([0x75, 0x03], 8); // RX CTCSS 88.5
  slot.set([0x75, 0x03], 10); // TX CTCSS 88.5
  slot[12] = 0x03; // signalling group 3
  slot[13] = 0x02; // PTT ID 2
  slot[14] = 0x51; // scrambler 5, medium power
  slot[15] = FLAG.LEARN_FHSS | FLAG.ENCRYPTION | FLAG.SCAN | FLAG.TX_ENABLED;
  slot.set([0x12, 0x34, 0x56, 0xa0], 16); // a hopping code
  slot.set(Array.from('LOCAL', (c) => c.charCodeAt(0)), 20);
  return slot;
}

describe('RT-950 Pro frequencies', () => {
  it('round-trips little-endian BCD in tens of Hz, as the UV5R-Mini stores them', () => {
    const out = new Uint8Array(4);
    encodeFrequency(146.52, out, 0);
    expect(Array.from(out)).toEqual([0x00, 0x20, 0x65, 0x14]); // 14,652,000 tens of Hz
    expect(decodeFrequency(out)).toBeCloseTo(146.52, 6);
    encodeFrequency(446.00625, out, 0);
    expect(decodeFrequency(out)).toBeCloseTo(446.00625, 6);
  });

  it('reads a blank field as no frequency', () => {
    expect(decodeFrequency(Uint8Array.of(0xff, 0xff, 0xff, 0xff))).toBeNull();
    expect(decodeFrequency(Uint8Array.of(0, 0, 0, 0))).toBeNull();
  });
});

describe('RT-950 Pro tones', () => {
  it('reads CTCSS in tenths of Hz, and DCS by index with the inverted codes after the normal ones', () => {
    expect(decodeTone(0x75, 0x03)).toEqual({ type: 'CTCSS', value: 88.5 });
    expect(decodeTone(1, 0)).toEqual({ type: 'DCS', value: 23, polarity: 'N' });
    expect(decodeTone(105, 0)).toEqual({ type: 'DCS', value: 754, polarity: 'N' });
    expect(decodeTone(106, 0)).toEqual({ type: 'DCS', value: 23, polarity: 'P' });
    expect(decodeTone(210, 0)).toEqual({ type: 'DCS', value: 754, polarity: 'P' });
    expect(decodeTone(0, 0)).toEqual({ type: 'None' });
    expect(decodeTone(0xff, 0xff)).toEqual({ type: 'None' });
  });

  it('writes them back the same way', () => {
    expect(encodeTone({ type: 'CTCSS', value: 88.5 })).toEqual([0x75, 0x03]);
    expect(encodeTone({ type: 'DCS', value: 23, polarity: 'N' })).toEqual([1, 0]);
    expect(encodeTone({ type: 'DCS', value: 754, polarity: 'P' })).toEqual([210, 0]);
    expect(encodeTone({ type: 'None' })).toEqual([0, 0]);
  });

  it("refuses a DCS code the radio doesn't have instead of dropping the tone", () => {
    expect(() => encodeTone({ type: 'DCS', value: 999, polarity: 'N' })).toThrow("isn't a code");
  });
});

describe('RT-950 Pro channel slots', () => {
  it('reads a slot', () => {
    const ch = parseChannel(radioSlot(), 7)!;
    expect(ch).toMatchObject({
      number: 7,
      name: 'LOCAL',
      rxFrequency: 146.52,
      txFrequency: 146.52,
      power: 'Medium',
      bandwidth: '25kHz',
      scanAdd: true,
      forbidTx: false,
      busyLock: 0,
      rxCtcssDcs: { type: 'CTCSS', value: 88.5 },
    });
  });

  it('reads an empty slot as no channel', () => {
    expect(parseChannel(new Uint8Array(32).fill(0xff), 1)).toBeNull();
  });

  it('keeps every field it does not model when it rewrites a slot', () => {
    const slot = radioSlot();
    const edited = { ...parseChannel(slot, 1)!, name: 'EDITED', power: 'Low' as const };
    encodeChannel(slot, edited);

    expect(slot[12]).toBe(0x03); // signalling group
    expect(slot[13]).toBe(0x02); // PTT ID
    expect(slot[14]).toBe(0x52); // scrambler kept, power now low
    expect(slot[15] & (FLAG.LEARN_FHSS | FLAG.ENCRYPTION)).toBe(FLAG.LEARN_FHSS | FLAG.ENCRYPTION);
    expect(Array.from(slot.subarray(16, 20))).toEqual([0x12, 0x34, 0x56, 0xa0]);
    expect(parseChannel(slot, 1)!.name).toBe('EDITED');
  });

  it('changes nothing at all when nothing changed', () => {
    const slot = radioSlot();
    const before = slot.slice();
    encodeChannel(slot, parseChannel(slot, 1)!);
    expect(slot).toEqual(before);
  });

  it("leaves a name alone when it hasn't changed, whatever bytes spell it", () => {
    const slot = radioSlot();
    slot.set([0x4c, 0x41, 0x42, 0x00, 0xaa], 20); // "LAB", then a stray 0x00 terminator and junk
    const before = slot.slice();
    encodeChannel(slot, parseChannel(slot, 1)!);
    expect(slot).toEqual(before);
  });

  it('keeps a blank TX blank when the channel is not edited', () => {
    const slot = radioSlot();
    slot.fill(0xff, 4, 8);
    const before = slot.slice();
    encodeChannel(slot, parseChannel(slot, 1)!);
    expect(slot).toEqual(before);
  });

  it('starts a channel new to its slot from a blank one, transmit allowed', () => {
    const slot = new Uint8Array(32).fill(0xff);
    encodeChannel(slot, createDefaultChannel({ number: 1, name: 'NEW', rxFrequency: 446.1, txFrequency: 446.1 }));
    expect(slot[12]).toBe(0);
    expect(slot[13]).toBe(0);
    expect(slot[15] & FLAG.TX_ENABLED).toBe(FLAG.TX_ENABLED);
    expect(slot[15] & FLAG.AM).toBe(0);
    expect(Array.from(slot.subarray(16, 20))).toEqual([0xff, 0xff, 0xff, 0xff]);
    expect(Array.from(slot.subarray(20, 32))).toEqual([0x4e, 0x45, 0x57, ...Array(9).fill(0xff)]);
  });

  it('makes a new airband channel AM and receive-only', () => {
    const slot = new Uint8Array(32).fill(0xff);
    encodeChannel(slot, createDefaultChannel({ number: 1, name: 'TOWER', rxFrequency: 118.3, txFrequency: 118.3 }));
    expect(slot[15] & FLAG.AM).toBe(FLAG.AM);
    expect(slot[15] & FLAG.TX_ENABLED).toBe(0);
    expect(parseChannel(slot, 1)!.forbidTx).toBe(true);
  });

  it('writes inverted DCS and busy lock', () => {
    const slot = radioSlot();
    encodeChannel(slot, {
      ...parseChannel(slot, 1)!,
      busyLock: 1,
      txCtcssDcs: { type: 'DCS', value: 71, polarity: 'P' },
      rxCtcssDcs: { type: 'DCS', value: 71, polarity: 'P' },
    });
    const ch = parseChannel(slot, 1)!;
    expect(ch.busyLock).toBe(1);
    expect(ch.txCtcssDcs).toEqual({ type: 'DCS', value: 71, polarity: 'P' });
  });
});

describe('RT-950 Pro image', () => {
  function imageWith(numbers: number[]): Uint8Array {
    const image = new Uint8Array(RT950PRO_IMAGE_SIZE).fill(0xff);
    for (const n of numbers) slotOf(image, n).set(radioSlot());
    // Something in every region past the channels, so a write that touched it would show.
    for (let i = 0x7800; i < RT950PRO_IMAGE_SIZE; i++) image[i] = (i * 7) & 0xff;
    return image;
  }

  it('writes back what it read byte for byte', () => {
    const image = imageWith([1, 2, 500, 960]);
    const copy = image.slice();
    applyChannels(copy, parseAllChannels(image));
    expect(copy).toEqual(image);
  });

  it('empties the slot of a deleted channel and moves no other', () => {
    const image = imageWith([1, 2, 3]);
    applyChannels(image, parseAllChannels(image).filter((ch) => ch.number !== 2));
    expect(isEmptySlot(slotOf(image, 2))).toBe(true);
    expect(parseAllChannels(image).map((ch) => ch.number)).toEqual([1, 3]);
  });
});
