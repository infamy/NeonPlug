/**
 * The byte scrambling on every clone block of the UV17Pro family of radios —
 * the Baofeng UV5R-Mini and the Radtel RT-950 Pro among them (CHIRP's
 * baofeng_uv17Pro.py `_crypt`).
 *
 * The handshake's `SEND` frame picks one of twenty four-byte keys for the
 * session. Each payload byte is XORed with the key byte for its position in the
 * block, unless the key byte is a space or the payload byte is 0x00, 0xFF, the
 * key byte itself or its complement — those pass through unchanged. That makes
 * the function its own inverse: the same call scrambles and unscrambles.
 */

const KEYS: readonly (readonly number[])[] = [
  [0x42, 0x48, 0x54, 0x20], // "BHT "
  [0x43, 0x4f, 0x20, 0x37], // "CO 7"
  [0x41, 0x20, 0x45, 0x53], // "A ES"
  [0x20, 0x45, 0x49, 0x59], // " EIY"
  [0x4d, 0x20, 0x50, 0x51], // "M PQ"
  [0x58, 0x4e, 0x20, 0x59], // "XN Y"
  [0x52, 0x56, 0x42, 0x20], // "RVB "
  [0x20, 0x48, 0x51, 0x50], // " HQP"
  [0x57, 0x20, 0x52, 0x43], // "W RC"
  [0x4d, 0x53, 0x20, 0x4e], // "MS N"
  [0x20, 0x53, 0x41, 0x54], // " SAT"
  [0x4b, 0x20, 0x44, 0x48], // "K DH"
  [0x5a, 0x4f, 0x20, 0x52], // "ZO R"
  [0x43, 0x20, 0x53, 0x4c], // "C SL"
  [0x36, 0x52, 0x42, 0x20], // "6RB "
  [0x20, 0x4a, 0x43, 0x47], // " JCG"
  [0x50, 0x4e, 0x20, 0x56], // "PN V"
  [0x4a, 0x20, 0x50, 0x4b], // "J PK"
  [0x45, 0x4b, 0x20, 0x4c], // "EK L"
  [0x49, 0x20, 0x4c, 0x5a], // "I LZ"
];

/** Scramble or unscramble one block with key `keyIndex` (an unknown index uses key 0). */
export function uv17proCrypt(keyIndex: number, buffer: Uint8Array): Uint8Array {
  const key = KEYS[keyIndex] ?? KEYS[0];
  const out = new Uint8Array(buffer.length);
  for (let i = 0; i < buffer.length; i++) {
    const b = buffer[i];
    const k = key[i % 4];
    const scramble = k !== 0x20 && b !== 0x00 && b !== 0xff && b !== k && b !== (k ^ 0xff);
    out[i] = scramble ? b ^ k : b;
  }
  return out;
}

/**
 * The key a `SEND` frame asks for. Byte 4 says which later byte of the frame
 * holds the key's index: `(byte4 - 0x20) * 2 + 2` when bit 5 is set, else
 * `(byte4 - 0x10) * 2 + 1`, counted from byte 4 — the vendor CPS's rule, as the
 * RT-950 Pro CHIRP driver's notes describe it. The frame CHIRP sends to the
 * UV5R-Mini comes out as key 1, "CO 7", which is the key that driver has always
 * used.
 */
export function negotiatedKeyIndex(frame: Uint8Array): number {
  const code = frame[4];
  const step = code & 0x20 ? (code - 0x20) * 2 + 1 : (code - 0x10) * 2;
  return frame[4 + step + 1];
}
