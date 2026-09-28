import { describe, it, expect } from 'vitest';
import { FT70Protocol } from '../../src/radios/ft70/protocol';

// The connection hook relies on this surface to keep FT-70 writes safe:
// bufferedSettingsWrite makes it stage settings BEFORE writeChannels, and
// get/setMemoryImage carry the read image across protocol instances so a
// write doesn't zero the radio's non-channel memory (settings, APRS, GM, banks).
describe('FT70Protocol memory image handling', () => {
  it('declares bufferedSettingsWrite so the hook stages settings before writeChannels', () => {
    expect(new FT70Protocol().bufferedSettingsWrite).toBe(true);
  });

  it('has no memory image before a read', () => {
    expect(new FT70Protocol().getMemoryImage()).toBeNull();
  });

  it('setMemoryImage stores a defensive copy retrievable via getMemoryImage', () => {
    const proto = new FT70Protocol();
    const image = new Uint8Array([1, 2, 3, 4]);
    proto.setMemoryImage(image);

    const cached = proto.getMemoryImage();
    expect(cached).toEqual(image);
    expect(cached).not.toBe(image); // mutation of the caller's array must not affect the cache

    image[0] = 99;
    expect(proto.getMemoryImage()![0]).toBe(1);
  });

  it('refuses to write channels without a memory image (would zero radio settings)', async () => {
    const proto = new FT70Protocol();
    // Bypass the connection guard to reach the image guard.
    (proto as unknown as { conn: object }).conn = {};
    await expect(proto.writeChannels([])).rejects.toThrow(/Read the radio first/);
  });
});
