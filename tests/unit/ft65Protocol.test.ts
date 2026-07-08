import { describe, it, expect } from 'vitest';
import { FT65Protocol } from '../../src/radios/ft65/protocol';
import { ID_PREFIX_FT65, OFFSET_FACTOR_FT65, MAX_NAME_LEN_FT65 } from '../../src/radios/ft65/constants';

function makeProtocol(): FT65Protocol {
  return new FT65Protocol('FT-65', [ID_PREFIX_FT65], OFFSET_FACTOR_FT65, MAX_NAME_LEN_FT65);
}

// The connection hook relies on this surface to fix two write-path bugs:
// bufferedSettingsWrite makes it stage settings BEFORE writeChannels, and
// get/setMemoryImage carry the read image across protocol instances so a
// write doesn't zero the radio's non-channel memory.
describe('FT65Protocol memory image handling', () => {
  it('declares bufferedSettingsWrite so the hook stages settings before writeChannels', () => {
    expect(makeProtocol().bufferedSettingsWrite).toBe(true);
  });

  it('has no memory image before a read', () => {
    expect(makeProtocol().getMemoryImage()).toBeNull();
  });

  it('setMemoryImage stores a defensive copy retrievable via getMemoryImage', () => {
    const proto = makeProtocol();
    const image = new Uint8Array([1, 2, 3, 4]);
    proto.setMemoryImage(image);

    const cached = proto.getMemoryImage();
    expect(cached).toEqual(image);
    expect(cached).not.toBe(image); // mutation of the caller's array must not affect the cache

    image[0] = 99;
    expect(proto.getMemoryImage()![0]).toBe(1);
  });

  it('refuses to write channels without a memory image (would zero radio settings)', async () => {
    const proto = makeProtocol();
    // Bypass the connection guard to reach the image guard.
    (proto as unknown as { conn: object }).conn = {};
    await expect(proto.writeChannels([])).rejects.toThrow(/Read the radio first/);
  });
});
