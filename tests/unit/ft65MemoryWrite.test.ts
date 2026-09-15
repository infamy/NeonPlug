import { describe, it, expect } from 'vitest';
import {
  clearUnwrittenMemories,
  encodeChannel,
  isChannelEnabled,
  isScanIncluded,
  setChannelEnabled,
  setScanIncluded,
} from '../../src/radios/ft65/structures';
import {
  FT65_ADDR_NAMES,
  FT65_ADDR_TXFREQS,
  FT65_MEM_SIZE,
  OFFSET_FACTOR_FT65,
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
