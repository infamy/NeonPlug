/**
 * Baofeng UV5R-Mini read/write frames and decrypt (from chirp-baofeng-uv5rmini.js).
 */

import {
  BAOFENG_BLOCK_SIZE,
  BAOFENG_READ_RESPONSE_LEN,
} from './constants';

/** Magics for read mode (3rd magic last byte 0x00). */
export const BAOFENG_MAGICS_READ: Array<{ send: Uint8Array; responseLen: number }> = [
  { send: new Uint8Array([0x46]), responseLen: 16 },
  { send: new Uint8Array([0x4d]), responseLen: 15 },
  {
    send: new Uint8Array([
      0x53, 0x45, 0x4e, 0x44, 0x21, 0x05, 0x0d, 0x01, 0x01, 0x01, 0x04, 0x11,
      0x08, 0x05, 0x0d, 0x0d, 0x01, 0x11, 0x0f, 0x09, 0x12, 0x09, 0x10, 0x04, 0x00,
    ]),
    responseLen: 1,
  },
];

/** Magics for write/upload mode (3rd magic last byte 0x01). */
export const BAOFENG_MAGICS_UPLOAD: Array<{ send: Uint8Array; responseLen: number }> = [
  { send: new Uint8Array([0x46]), responseLen: 16 },
  { send: new Uint8Array([0x4d]), responseLen: 15 },
  {
    send: new Uint8Array([
      0x53, 0x45, 0x4e, 0x44, 0x21, 0x05, 0x0d, 0x01, 0x01, 0x01, 0x04, 0x11,
      0x08, 0x05, 0x0d, 0x0d, 0x01, 0x11, 0x0f, 0x09, 0x12, 0x09, 0x10, 0x04, 0x01,
    ]),
    responseLen: 1,
  },
];

const TBL_ENCRYPT = [
  [0x42, 0x48, 0x54, 0x20],
  [0x43, 0x4f, 0x20, 0x37],
  [0x41, 0x20, 0x45, 0x53],
  [0x20, 0x45, 0x49, 0x59],
  [0x4d, 0x20, 0x50, 0x51],
  [0x58, 0x4e, 0x20, 0x59],
  [0x52, 0x56, 0x42, 0x20],
  [0x20, 0x48, 0x51, 0x50],
  [0x57, 0x20, 0x52, 0x43],
  [0x4d, 0x53, 0x20, 0x4e],
  [0x20, 0x53, 0x41, 0x54],
  [0x4b, 0x20, 0x44, 0x48],
  [0x5a, 0x4f, 0x20, 0x52],
  [0x43, 0x20, 0x53, 0x4c],
  [0x36, 0x52, 0x42, 0x20],
  [0x20, 0x4a, 0x43, 0x47],
  [0x50, 0x4e, 0x20, 0x56],
  [0x4a, 0x20, 0x50, 0x4b],
  [0x45, 0x4b, 0x20, 0x4c],
  [0x49, 0x20, 0x4c, 0x5a],
];

/** Symmetric encrypt/decrypt (encrsym 1 = "CO 7"). */
export function baofengDecrypt(symbolIndex: number, buffer: Uint8Array): Uint8Array {
  const sym = TBL_ENCRYPT[symbolIndex] ?? TBL_ENCRYPT[0];
  const out = new Uint8Array(buffer.length);
  for (let i = 0; i < buffer.length; i++) {
    const b = buffer[i];
    const s = sym[i % 4];
    const xor =
      s !== 32 && b !== 0 && b !== 255 && b !== s && b !== (s ^ 255);
    out[i] = xor ? b ^ s : b;
  }
  return out;
}

/** Build read frame: 0x52 + addr (2 BE) + length (1). */
export function buildBaofengReadFrame(addr: number, length: number): Uint8Array {
  const frame = new Uint8Array(4);
  frame[0] = 0x52;
  frame[1] = (addr >>> 8) & 0xff;
  frame[2] = addr & 0xff;
  frame[3] = length & 0xff;
  return frame;
}

/** Build write frame: 0x57 + addr (2 BE) + 0x40 + encrypted 64-byte block. */
export function buildBaofengWriteFrame(
  addr: number,
  block: Uint8Array,
  encrsym: number = 1
): Uint8Array {
  if (block.length !== BAOFENG_BLOCK_SIZE) throw new Error('Block must be 64 bytes');
  const payload = baofengDecrypt(encrsym, block);
  const frame = new Uint8Array(4 + BAOFENG_BLOCK_SIZE);
  frame[0] = 0x57;
  frame[1] = (addr >>> 8) & 0xff;
  frame[2] = addr & 0xff;
  frame[3] = 0x40;
  frame.set(payload, 4);
  return frame;
}

/** Parse read response (68 bytes): skip 4-byte header, return decrypted 64-byte block. */
export function parseBaofengReadResponse(
  raw68: Uint8Array,
  useDecrypt: boolean = true,
  encrsym: number = 1
): Uint8Array {
  if (raw68.length < BAOFENG_READ_RESPONSE_LEN)
    throw new Error('Baofeng read response too short');
  const payload = raw68.subarray(4, 4 + BAOFENG_BLOCK_SIZE);
  return useDecrypt ? baofengDecrypt(encrsym, payload) : payload.slice(0);
}
