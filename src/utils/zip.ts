/**
 * Minimal ZIP archive writer/reader over the browser's native
 * CompressionStream / DecompressionStream ('deflate-raw').
 *
 * Replaces jszip: NeonPlug only runs in Chromium-family browsers (WebSerial
 * requires it), where these APIs always exist. The writer emits standard
 * PKZIP archives (method 8 DEFLATE, or method 0 stored when deflate doesn't
 * help); the reader accepts methods 8 and 0 and takes sizes/offsets from the
 * central directory — which covers every archive the app has ever produced,
 * whether by jszip or by this writer. The .neonplug format is unchanged.
 */

export interface ZipEntry {
  name: string;
  data: Uint8Array | string | Blob;
}

// CRC-32 (IEEE), table-based.
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Narrow a view to an ArrayBuffer-backed one (copies only if SharedArrayBuffer-backed). */
function asBufferView(data: Uint8Array): Uint8Array<ArrayBuffer> {
  return data.buffer instanceof ArrayBuffer ? (data as Uint8Array<ArrayBuffer>) : data.slice();
}

async function pipe(data: Uint8Array, transform: GenericTransformStream): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new Blob([asBufferView(data)]).stream().pipeThrough(transform);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export function deflateRaw(data: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
  return pipe(data, new CompressionStream('deflate-raw'));
}

export function inflateRaw(data: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
  return pipe(data, new DecompressionStream('deflate-raw'));
}

function dosDateTime(date: Date): { time: number; day: number } {
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    day: ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

/** Build a ZIP archive. Entry names may contain '/' for folder paths. */
export async function createZip(entries: ZipEntry[]): Promise<Blob> {
  const enc = new TextEncoder();
  const stamp = dosDateTime(new Date());
  const localParts: Uint8Array<ArrayBuffer>[] = [];
  const centralParts: Uint8Array<ArrayBuffer>[] = [];
  let offset = 0;

  for (const entry of entries) {
    const raw: Uint8Array<ArrayBuffer> =
      typeof entry.data === 'string'
        ? enc.encode(entry.data)
        : entry.data instanceof Blob
          ? new Uint8Array(await entry.data.arrayBuffer())
          : asBufferView(entry.data);
    const nameBytes = enc.encode(entry.name);
    const crc = crc32(raw);
    const compressed = await deflateRaw(raw);
    const useDeflate = compressed.length < raw.length;
    const payload = useDeflate ? compressed : raw;
    const method = useDeflate ? 8 : 0;

    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true); // version needed to extract
    lv.setUint16(6, 0x0800, true); // general purpose flags: UTF-8 names
    lv.setUint16(8, method, true);
    lv.setUint16(10, stamp.time, true);
    lv.setUint16(12, stamp.day, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, payload.length, true);
    lv.setUint32(22, raw.length, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true); // extra field length
    local.set(nameBytes, 30);
    localParts.push(local, payload);

    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true); // version made by
    cv.setUint16(6, 20, true); // version needed to extract
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, method, true);
    cv.setUint16(12, stamp.time, true);
    cv.setUint16(14, stamp.day, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, payload.length, true);
    cv.setUint32(24, raw.length, true);
    cv.setUint16(28, nameBytes.length, true);
    // extra len / comment len / disk / internal attrs / external attrs all 0
    cv.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    centralParts.push(central);

    offset += local.length + payload.length;
  }

  const centralSize = centralParts.reduce((n, p) => n + p.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);

  return new Blob([...localParts, ...centralParts, eocd], { type: 'application/zip' });
}

/** Read a ZIP archive into a name → bytes map. Verifies each entry's CRC. */
export async function readZip(input: ArrayBuffer | Uint8Array): Promise<Map<string, Uint8Array>> {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  // Find the end-of-central-directory record (trailing comment can push it
  // back up to 64KB from the end).
  let eocd = -1;
  const scanFloor = Math.max(0, bytes.length - 22 - 0xffff);
  for (let i = bytes.length - 22; i >= scanFloor; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('Not a ZIP archive (no end-of-central-directory record)');

  const count = view.getUint16(eocd + 10, true);
  let pos = view.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  const files = new Map<string, Uint8Array>();

  for (let i = 0; i < count; i++) {
    if (view.getUint32(pos, true) !== 0x02014b50) {
      throw new Error('Corrupt ZIP: bad central directory entry');
    }
    const method = view.getUint16(pos + 10, true);
    const crc = view.getUint32(pos + 16, true);
    const compressedSize = view.getUint32(pos + 20, true);
    const nameLen = view.getUint16(pos + 28, true);
    const extraLen = view.getUint16(pos + 30, true);
    const commentLen = view.getUint16(pos + 32, true);
    const localOffset = view.getUint32(pos + 42, true);
    const name = dec.decode(bytes.subarray(pos + 46, pos + 46 + nameLen));

    // The local header's name/extra lengths can differ from the central copy.
    const localNameLen = view.getUint16(localOffset + 26, true);
    const localExtraLen = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;
    const payload = bytes.subarray(dataStart, dataStart + compressedSize);

    let data: Uint8Array;
    if (method === 8) {
      try {
        data = await inflateRaw(payload);
      } catch {
        throw new Error(`Corrupt ZIP: failed to decompress "${name}"`);
      }
    } else if (method === 0) {
      data = payload.slice();
    } else {
      throw new Error(`Unsupported ZIP compression method ${method} for "${name}"`);
    }
    if (crc32(data) !== crc) throw new Error(`Corrupt ZIP: CRC mismatch for "${name}"`);

    files.set(name, data);
    pos += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}
