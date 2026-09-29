/**
 * A zone block the scan found but the read never fetched must fail the parse.
 * It used to be skipped without moving past it, so every block after the gap
 * was parsed 4 KB early — zones from one block showing up as another's.
 */
import { describe, it, expect } from 'vitest';
import { DM32UVProtocol } from '../../src/radios/dm32uv/protocol';
import { METADATA, BLOCK_SIZE } from '../../src/radios/dm32uv/constants';

/** Two zone blocks in the scan; `present` says which of them were read. */
function protocolWithZoneBlocks(present: number[]): DM32UVProtocol {
  const proto = new DM32UVProtocol();
  (proto as unknown as { radioInfo: unknown }).radioInfo = { model: 'DM-32UV' };
  const data = new Map<number, Uint8Array>();
  const meta = new Map<number, { metadata: number; type: string }>();
  for (const i of [0, 1]) {
    const address = 0x10000 + i * BLOCK_SIZE.STANDARD;
    meta.set(address, { metadata: METADATA.ZONE_FIRST + i, type: 'zone' });
    if (present.includes(i)) data.set(address, new Uint8Array(BLOCK_SIZE.STANDARD));
  }
  proto.restoreCacheFromStore(data, meta);
  return proto;
}

describe('joining the cached zone blocks', () => {
  it('fails when a block the scan found was never read', async () => {
    await expect(protocolWithZoneBlocks([0]).readZones()).rejects.toThrow('was not read');
    await expect(protocolWithZoneBlocks([1]).readZones()).rejects.toThrow('was not read');
  });

  it('parses when every block is there', async () => {
    await expect(protocolWithZoneBlocks([0, 1]).readZones()).resolves.toBeDefined();
  });
});
