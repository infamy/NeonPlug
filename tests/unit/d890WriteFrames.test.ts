import { describe, it, expect } from 'vitest';
import { buildWriteCommand } from '../../src/radios/d890uv/framing';

/**
 * Real write frames from the vendor CPS programming a DA-7X2 (`WriteTo7x2.txt`,
 * 8,389 frames). Every one is the same shape:
 *
 *   57 <addr:4 BE> 10 <16 data bytes> <checksum> 06
 *
 * and the radio answers each with a bare `06`. The CPS never uses any payload
 * length but 16 — it does not negotiate a larger write the way reads do.
 *
 * This is the zero-risk check `framing.ts` has always wanted: the frame the
 * radio ACKed is the ground truth for our own arithmetic, so `buildWriteCommand`
 * has to reproduce it byte for byte. Getting a checksum wrong is not a bug that
 * shows up as a wrong value somewhere — it is a write the radio rejects, on
 * hardware that reboots when a write goes bad.
 */
const VENDOR_FRAMES = [
  // First two frames of the session — the channel region at 0x1000000.
  { address: 0x01000000, data: '14501250145012501000000000000000',
    frame: '57010000001014501250145012501000000000000000ad06' },
  { address: 0x01000010, data: '26050000000000000000000000000000',
    frame: '570100001010260500000000000000000000000000004c06' },
  // An all-zero payload — checksum comes only from the address and length.
  { address: 0x03580a80, data: '00000000000000000000000000000000',
    frame: '5703580a801000000000000000000000000000000000f506' },
  // An all-0xFF payload, the erased-flash case, where the sum wraps repeatedly.
  { address: 0x03901c20, data: 'ffffffffffffffffffffffffffffffff',
    frame: '5703901c2010ffffffffffffffffffffffffffffffffcf06' },
  // The last frame of the session, and the highest address written.
  { address: 0x18080070, data: 'ffffffffffffffffffffffffffff0000',
    frame: '571808007010ffffffffffffffffffffffffffff00009206' },
];

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
const bytes = (s: string) =>
  new Uint8Array((s.match(/../g) ?? []).map((h) => parseInt(h, 16)));

describe('buildWriteCommand against real vendor frames', () => {
  for (const v of VENDOR_FRAMES) {
    it(`reproduces the CPS frame for 0x${v.address.toString(16)}`, () => {
      expect(hex(buildWriteCommand(v.address, bytes(v.data)))).toBe(v.frame);
    });
  }

  it('computes the checksum over address+length+data, not the command byte', () => {
    // sum(frame[1..21]) & 0xFF — including 0x57 would give 0x04, not 0xad.
    const frame = bytes(VENDOR_FRAMES[0].frame);
    const sum = frame.slice(1, 22).reduce((a, b) => (a + b) & 0xff, 0);
    expect(sum).toBe(frame[22]);
    expect(frame[23]).toBe(0x06);
  });

  it('refuses a payload that is not exactly 16 bytes', () => {
    // The CPS used 16 for all 8,389 writes; anything else is our bug, and a
    // short write to a radio is not something to discover on hardware.
    expect(() => buildWriteCommand(0x01000000, new Uint8Array(8))).toThrow();
    expect(() => buildWriteCommand(0x01000000, new Uint8Array(240))).toThrow();
  });

  it('refuses an unaligned address', () => {
    expect(() => buildWriteCommand(0x01000001, new Uint8Array(16))).toThrow();
  });
});
