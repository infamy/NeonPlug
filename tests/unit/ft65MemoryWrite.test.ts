import { describe, it, expect } from 'vitest';
import {
  clearUnwrittenMemories,
  encodeChannel,
  isChannelEnabled,
  isScanIncluded,
  parseChannel,
  setChannelEnabled,
  setScanIncluded,
} from '../../src/radios/ft65/structures';
import {
  FT65_ADDR_CHANNELS,
  FT65_ADDR_NAMES,
  FT65_ADDR_TXFREQS,
  FT65_CHANNEL_SIZE,
  FT65_MEM_SIZE,
  OFFSET_FACTOR_FT65,
  SLOT,
  SQL,
} from '../../src/radios/ft65/constants';
import { createDefaultChannel } from '../../src/utils/channelHelpers';

/** An image as a read left it: memory 1 scanned, memory 2 skipped, and PMS memory L1 stored. */
function readImage(): Uint8Array {
  const image = new Uint8Array(FT65_MEM_SIZE);
  setChannelEnabled(image, 0, true);
  setScanIncluded(image, 0, true);
  setChannelEnabled(image, 1, true);
  setScanIncluded(image, 1, false);
  image.set([0x50, 0x4d, 0x53, 0x31], FT65_ADDR_NAMES + 200 * 8);
  image.set([0x14, 0x65, 0x20, 0x00], FT65_ADDR_TXFREQS + 200 * 4);
  setChannelEnabled(image, 200, true);
  return image;
}

const channel = (number: number) =>
  createDefaultChannel({ number, name: `CH${number}`, rxFrequency: 146.52, txFrequency: 146.52 });

function write(image: Uint8Array, numbers: number[]) {
  const channels = numbers.map(channel);
  clearUnwrittenMemories(image, new Set(channels.map((ch) => ch.number - 1)));
  for (const ch of channels) encodeChannel(image, ch, OFFSET_FACTOR_FT65);
}

describe('writing FT-65 memories', () => {
  it('deletes a memory the write leaves out by its enable bit alone, and moves no other', () => {
    const image = readImage();
    write(image, [1, 3]);
    expect([0, 1, 2].map((idx) => isChannelEnabled(image, idx))).toEqual([true, false, true]);
    expect(isScanIncluded(image, 1)).toBe(false);
  });

  it('keeps the scan setting of a memory the radio had, and scans a new one', () => {
    const image = readImage();
    write(image, [1, 2, 3]);
    expect([0, 1, 2].map((idx) => isScanIncluded(image, idx))).toEqual([true, false, true]);
  });

  it('leaves the PMS memories alone', () => {
    const image = readImage();
    const before = image.slice();
    write(image, []);
    expect(isChannelEnabled(image, 200)).toBe(true);
    const pmsNames = [FT65_ADDR_NAMES + 200 * 8, FT65_ADDR_NAMES + 220 * 8] as const;
    const pmsTx = [FT65_ADDR_TXFREQS + 200 * 4, FT65_ADDR_TXFREQS + 220 * 4] as const;
    expect(image.subarray(...pmsNames)).toEqual(before.subarray(...pmsNames));
    expect(image.subarray(...pmsTx)).toEqual(before.subarray(...pmsTx));
  });
});

/** Where memory `number` starts. */
const slotOf = (number: number) => FT65_ADDR_CHANNELS + (number - 1) * FT65_CHANNEL_SIZE;

/**
 * A memory as the radio holds one: written by the CPS, with a tuning step, the
 * radio's own simplex code, a leftover CTCSS default and 0xff in the unused
 * byte. Only the first is a field this app shows.
 */
function memoryAsTheRadioWroteIt(image: Uint8Array, number: number): void {
  encodeChannel(image, channel(number), OFFSET_FACTOR_FT65);
  const base = slotOf(number);
  image[base + SLOT.STEP] = 7; // 25 kHz
  image[base + SLOT.DUPLEX] = 1; // the radio's simplex, not this app's 4
  image[base + SLOT.TX_CTCSS] = 13; // a tone the memory doesn't use
  image[base + 15] = 0xff;
}

describe('patching a memory the radio already has', () => {
  it('keeps the fields this app does not model', () => {
    const image = new Uint8Array(FT65_MEM_SIZE);
    memoryAsTheRadioWroteIt(image, 1);
    const base = slotOf(1);

    write(image, [1]);

    expect(image[base + SLOT.STEP]).toBe(7);
    expect(image[base + 15]).toBe(0xff);
    expect(image[base + SLOT.TX_CTCSS]).toBe(13);
  });

  it('keeps the radio\'s own way of saying simplex when the frequency has not changed', () => {
    const image = new Uint8Array(FT65_MEM_SIZE);
    memoryAsTheRadioWroteIt(image, 1);

    write(image, [1]);

    expect(image[slotOf(1) + SLOT.DUPLEX]).toBe(1);
  });

  it('writes the shift when the TX frequency does change', () => {
    const image = new Uint8Array(FT65_MEM_SIZE);
    memoryAsTheRadioWroteIt(image, 1);
    const shifted = createDefaultChannel({ number: 1, name: 'RPT', rxFrequency: 146.52, txFrequency: 147.12 });

    encodeChannel(image, shifted, OFFSET_FACTOR_FT65);

    const parsed = parseChannel(image, 0, OFFSET_FACTOR_FT65);
    expect(parsed?.txFrequency).toBeCloseTo(147.12, 4);
    expect(image[slotOf(1) + SLOT.STEP]).toBe(7);
  });

  it('writes a DCS memory as DCS, not as tone squelch', () => {
    const image = new Uint8Array(FT65_MEM_SIZE);
    memoryAsTheRadioWroteIt(image, 1);
    const dcs = createDefaultChannel({
      number: 1,
      name: 'DCS',
      rxFrequency: 146.52,
      txFrequency: 146.52,
      txCtcssDcs: { type: 'DCS', value: 23 },
      rxCtcssDcs: { type: 'DCS', value: 23 },
    });

    encodeChannel(image, dcs, OFFSET_FACTOR_FT65);

    expect(image[slotOf(1) + SLOT.SQL_TYPE]).toBe(SQL.DCS);
    const parsed = parseChannel(image, 0, OFFSET_FACTOR_FT65);
    expect(parsed?.txCtcssDcs).toEqual({ type: 'DCS', value: 23, polarity: 'N' });
    expect(parsed?.rxCtcssDcs).toEqual({ type: 'DCS', value: 23, polarity: 'N' });
  });

  it('pads a name with spaces, as the CPS does', () => {
    const image = new Uint8Array(FT65_MEM_SIZE);
    write(image, [1]);
    const base = FT65_ADDR_NAMES;
    expect(Array.from(image.subarray(base, base + 8))).toEqual([0x43, 0x48, 0x31, 0x20, 0x20, 0x20, 0x20, 0x20]);
  });

  it('starts a memory new to a slot from zero, so a deleted one leaves nothing behind', () => {
    const image = new Uint8Array(FT65_MEM_SIZE);
    memoryAsTheRadioWroteIt(image, 1);
    clearUnwrittenMemories(image, new Set()); // the memory is deleted, its bytes stay

    write(image, [1]);

    expect(image[slotOf(1) + SLOT.STEP]).toBe(0);
    expect(image[slotOf(1) + 15]).toBe(0);
    expect(image[slotOf(1) + SLOT.TX_CTCSS]).toBe(0);
  });
});
