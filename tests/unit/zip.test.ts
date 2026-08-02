import { describe, it, expect } from 'vitest';
import { createZip, readZip, crc32 } from '../../src/utils/zip';
import { compressText, decompressText } from '../../src/utils/compression';

// Archive produced by jszip 3.10 (DEFLATE level 6) before it was removed —
// contains codeplug.json with {"channels":[{"number":1,"name":"Test"}],"version":"1.0.0"}.
// Guards that .neonplug files written by older app versions stay readable.
const JSZIP_FIXTURE_B64 =
  'UEsDBAoAAAAIAM05Al2rhJbGPAAAADsAAAANAAAAY29kZXBsdWcuanNvbqtWSs5IzMtLzSlWsoquVsorzU1KLVKyMtRRykvMTVWyUgpJLS5Rqo3VUSpLLSrOzM8DChnqGegZKNUCAFBLAQIUAAoAAAAIAM05Al2rhJbGPAAAADsAAAANAAAAAAAAAAAAAAAAAAAAAABjb2RlcGx1Zy5qc29uUEsFBgAAAAABAAEAOwAAAGcAAAAAAA==';

// pako.deflate(JSON.stringify({snapshot:true,n:42}), {level:6}) — zlib format,
// generated before pako was removed. Guards that old localStorage snapshots
// stay readable through DecompressionStream('deflate').
const PAKO_FIXTURE_B64 = 'eJyrVirOSywozsgvUbIqKSpN1VHKU7IyMaoFAG1oCCU=';

function b64ToBytes(b64: string): Uint8Array {
  return new Uint8Array(Buffer.from(b64, 'base64'));
}

describe('zip writer/reader round trip', () => {
  it('round-trips string, binary, and folder-path entries', async () => {
    const binary = new Uint8Array([0x00, 0xff, 0x7f, 0x80, 1, 2, 3]);
    const blob = await createZip([
      { name: 'codeplug.json', data: '{"hello":"world"}' },
      { name: 'read/block-0x04.bin', data: binary },
    ]);
    const files = await readZip(await blob.arrayBuffer());

    expect([...files.keys()].sort()).toEqual(['codeplug.json', 'read/block-0x04.bin']);
    expect(new TextDecoder().decode(files.get('codeplug.json'))).toBe('{"hello":"world"}');
    expect(files.get('read/block-0x04.bin')).toEqual(binary);
  });

  it('reads archives produced by jszip (old .neonplug files)', async () => {
    const files = await readZip(b64ToBytes(JSZIP_FIXTURE_B64));
    const json = JSON.parse(new TextDecoder().decode(files.get('codeplug.json')));
    expect(json.version).toBe('1.0.0');
    expect(json.channels[0].name).toBe('Test');
  });

  it('throws on CRC mismatch (corrupted stored entry)', async () => {
    // High-entropy data doesn't shrink under deflate, so the writer stores it
    // (method 0) and a flipped payload byte reaches the CRC check directly.
    const noise = new Uint8Array(64);
    let seed = 1;
    for (let i = 0; i < noise.length; i++) {
      seed = (seed * 16807) % 2147483647;
      noise[i] = seed & 0xff;
    }
    const blob = await createZip([{ name: 'n.bin', data: noise }]);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    bytes[40] ^= 0xff; // payload starts at 30-byte header + 5-byte name = 35
    await expect(readZip(bytes)).rejects.toThrow(/CRC mismatch/);
  });

  it('throws a clear error on a corrupted deflate stream', async () => {
    const blob = await createZip([{ name: 'a.txt', data: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }]);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    bytes[35] ^= 0xff; // first byte of the deflate payload
    await expect(readZip(bytes)).rejects.toThrow(/failed to decompress/);
  });

  it('rejects non-zip data', async () => {
    await expect(readZip(new Uint8Array(100))).rejects.toThrow(/Not a ZIP archive/);
  });

  it('crc32 matches the known IEEE test vector', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });
});

describe('zlib text compression (snapshots)', () => {
  it('round-trips text', async () => {
    const text = JSON.stringify({ channels: [{ number: 1 }], big: 'x'.repeat(5000) });
    const compressed = await compressText(text);
    expect(compressed.length).toBeLessThan(text.length);
    expect(await decompressText(compressed)).toBe(text);
  });

  it('reads snapshots written by pako (old localStorage data)', async () => {
    const json = JSON.parse(await decompressText(b64ToBytes(PAKO_FIXTURE_B64)));
    expect(json).toEqual({ snapshot: true, n: 42 });
  });
});
