/**
 * zlib-format text compression over the browser's native CompressionStream
 * ('deflate' = zlib wrapper). Replaces pako for codeplug snapshots; output is
 * byte-compatible with pako.deflate, so snapshots written by older app
 * versions stay readable.
 */

async function pipe(data: Uint8Array, transform: GenericTransformStream): Promise<Uint8Array<ArrayBuffer>> {
  const view = data.buffer instanceof ArrayBuffer ? (data as Uint8Array<ArrayBuffer>) : data.slice();
  const stream = new Blob([view]).stream().pipeThrough(transform);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export function compressText(text: string): Promise<Uint8Array<ArrayBuffer>> {
  return pipe(new TextEncoder().encode(text), new CompressionStream('deflate'));
}

export async function decompressText(data: Uint8Array): Promise<string> {
  return new TextDecoder().decode(await pipe(data, new DecompressionStream('deflate')));
}
