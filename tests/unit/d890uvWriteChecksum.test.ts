import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildWriteCommand,
  parseReadResponse,
  readResponseSize,
  checksum8,
  assertWritableAddress,
} from '../../src/radios/d890uv/framing';
import { D890_ADDR } from '../../src/radios/d890uv/constants';

/**
 * Step 1 of the write-validation ladder: prove the write checksum without
 * writing anything.
 *
 * The argument has two halves, and only one of them needs a radio:
 *
 *   a) The radio's checksum arithmetic matches `checksum8`. This is established
 *      by every successful read ever performed, because `parseReadResponse`
 *      recomputes the checksum and THROWS on mismatch. A read that returns data
 *      is a checksum that agreed.
 *   b) A write frame's checksummed span is identical to a read reply's. That is
 *      pure structure, proved below, no hardware involved.
 *
 * Together they mean a validated read reply is a validated write frame. The
 * tests here are half (b).
 */
const PAYLOAD = new Uint8Array(
  readFileSync(join(__dirname, '../fixtures/d890uv/encryption-ids.bin'))
).subarray(0, 16);

/** Build the read reply the radio would send for this address and payload. */
function syntheticReadReply(address: number, payload: Uint8Array): Uint8Array {
  const frame = new Uint8Array(readResponseSize(payload.length));
  frame[0] = 0x57;
  frame[1] = (address >>> 24) & 0xff;
  frame[2] = (address >>> 16) & 0xff;
  frame[3] = (address >>> 8) & 0xff;
  frame[4] = address & 0xff;
  frame[5] = payload.length;
  frame.set(payload, 6);
  const ci = 6 + payload.length;
  frame[ci] = checksum8(frame, 1, ci);
  frame[ci + 1] = 0x06;
  return frame;
}

describe('DA-7X2 write checksum, validated without writing', () => {
  const addr = D890_ADDR.ENCRYPTION_ID_TABLE;

  it('makes a 16-byte write command byte-identical to the matching read reply', () => {
    // This is the whole argument in one assertion. Both frames are
    // 'W' + addr(4) + len(1) + 16 data + checksum + 0x06, and the read path
    // checks frame[0] === 0x57 — the same opcode the write builder emits. So a
    // write command is not merely "similar in shape" to a read reply: for the
    // same address and bytes it is the SAME 24 bytes.
    const write = buildWriteCommand(addr, PAYLOAD);
    const reply = syntheticReadReply(addr, PAYLOAD);
    expect(Array.from(write)).toEqual(Array.from(reply));
    expect(write.length).toBe(24);
  });

  it('checksums exactly frame[1..21] in both directions', () => {
    const write = buildWriteCommand(addr, PAYLOAD);
    // Span covers address, length and payload — not the opcode, not itself,
    // not the trailer. Off-by-one here is the classic way to get a checksum
    // that passes unit tests and is rejected by hardware.
    expect(checksum8(write, 1, 22)).toBe(write[22]);
    expect(checksum8(write, 0, 22)).not.toBe(write[22]); // opcode excluded
    expect(write[23]).toBe(0x06);
  });

  it('accepts its own write frame as a valid read reply', () => {
    // The strongest available check short of hardware: feed the write command
    // to the radio-response validator. If the two disagreed anywhere — opcode,
    // address encoding, length byte, checksum span, trailer — this throws.
    const write = buildWriteCommand(addr, PAYLOAD);
    const payload = parseReadResponse(write, addr, 16);
    expect(Array.from(payload)).toEqual(Array.from(PAYLOAD));
  });

  it('detects a single flipped bit anywhere in the checksummed span', () => {
    const write = buildWriteCommand(addr, PAYLOAD);
    for (const i of [1, 4, 5, 6, 21]) {
      const bad = Uint8Array.from(write);
      bad[i] ^= 0x01;
      expect(() => parseReadResponse(bad, addr, 16)).toThrow();
    }
  });

  it('is an additive sum, not a CRC — the wrap is what makes it cheap to check', () => {
    const bytes = new Uint8Array([0xff, 0xff, 0x03]);
    expect(checksum8(bytes, 0, 3)).toBe(0x01); // 0x201 & 0xff
  });

  it('still refuses the addresses the guard protects', () => {
    // Proving the checksum does not weaken the write guards; both must hold.
    expect(() => buildWriteCommand(0x2fa0010, PAYLOAD)).toThrow(/Refusing/);
    expect(() => assertWritableAddress(0x3f80000 + 0x3fbf0)).toThrow(/flash management/);
    expect(() => buildWriteCommand(addr, PAYLOAD.subarray(0, 8))).toThrow(/exactly/);
    expect(() => buildWriteCommand(addr + 1, PAYLOAD)).toThrow(/aligned/);
  });
});
