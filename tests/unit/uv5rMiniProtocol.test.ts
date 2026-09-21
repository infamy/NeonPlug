import { describe, it, expect } from 'vitest';
import { UV5RMiniProtocol } from '../../src/radios/uv5rmini/protocol';
import type { Channel } from '../../src/models';

// writeChannels fills a fresh image with 0xff (the radio's empty-channel marker)
// and uploads the whole channel region, so a call with no valid channels would
// erase every channel on the radio. The app UI guards this (Toolbar disables
// Write on an empty codeplug); the protocol must guard it too for direct
// callers such as the planned libneonplug library.
describe('UV5RMiniProtocol write guards', () => {
  it('refuses to write without a connection', async () => {
    const proto = new UV5RMiniProtocol();
    await expect(proto.writeChannels([])).rejects.toThrow(/Not connected/);
  });

  it('refuses to write an empty channel list', async () => {
    const proto = new UV5RMiniProtocol();
    // Bypass the connection guard to reach the empty-list guard.
    (proto as unknown as { connection: object }).connection = {};
    await expect(proto.writeChannels([])).rejects.toThrow(/Refusing to write/);
  });

  it('refuses when every channel is outside the valid number range', async () => {
    const proto = new UV5RMiniProtocol();
    (proto as unknown as { connection: object }).connection = {};
    const outOfRange = { number: 0 } as Channel;
    await expect(proto.writeChannels([outOfRange])).rejects.toThrow(/Refusing to write/);
  });
});
