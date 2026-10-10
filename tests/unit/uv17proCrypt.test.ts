import { describe, it, expect } from 'vitest';
import { negotiatedKeyIndex, uv17proCrypt } from '../../src/radios/shared/uv17proCrypt';
import { BAOFENG_MAGICS_READ } from '../../src/radios/uv5rmini/baofengProtocol';
import { RT950PRO_KEY_FRAME } from '../../src/radios/rt950pro/constants';

describe('the UV17Pro family scrambling', () => {
  it('undoes itself', () => {
    const block = Uint8Array.from({ length: 128 }, (_, i) => (i * 37 + 11) & 0xff);
    for (let key = 0; key < 20; key++) {
      expect(uv17proCrypt(key, uv17proCrypt(key, block))).toEqual(block);
    }
  });

  it('leaves 0x00, 0xFF, the key byte and its complement alone, and skips a space in the key', () => {
    // Key 1 is "CO 7": C=0x43, O=0x4f, space, 7=0x37.
    const input = Uint8Array.of(0x00, 0xff, 0x41, 0x37 ^ 0xff, 0x43, 0x4f, 0x99, 0x10);
    expect(Array.from(uv17proCrypt(1, input))).toEqual([
      0x00, // 0x00 passes
      0xff, // 0xFF passes
      0x41, // key byte is a space
      0x37 ^ 0xff, // the key byte's complement passes
      0x43, // equal to the key byte
      0x4f, // equal to the key byte
      0x99, // key byte is a space
      0x10 ^ 0x37,
    ]);
  });

  it('works out key 1 from the frame CHIRP sends the UV5R-Mini', () => {
    expect(negotiatedKeyIndex(BAOFENG_MAGICS_READ[2].send)).toBe(1);
    expect(negotiatedKeyIndex(RT950PRO_KEY_FRAME)).toBe(1);
  });

  it('reads the key index from where byte 4 points', () => {
    const frame = new Uint8Array(25);
    frame.set([0x53, 0x45, 0x4e, 0x44]);
    frame[4] = 0x10; // bit 5 clear: (0x10 - 0x10) * 2 + 1 → byte 5
    frame[5] = 7;
    expect(negotiatedKeyIndex(frame)).toBe(7);
    frame[4] = 0x22; // bit 5 set: (0x22 - 0x20) * 2 + 2 → byte 10
    frame[10] = 13;
    expect(negotiatedKeyIndex(frame)).toBe(13);
  });
});
