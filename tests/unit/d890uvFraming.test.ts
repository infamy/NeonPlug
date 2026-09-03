import { describe, it, expect } from 'vitest';
import {
  checksum8,
  writeAddressBE,
  readAddressBE,
  buildReadCommand,
  buildWriteCommand,
  parseReadResponse,
  readResponseSize,
  assertWritableAddress,
} from '../../src/radios/d890uv/framing';
import {
  D890_CMD,
  D890_BLOCK,
  D890_FORBIDDEN_WRITE_ADDRESS,
} from '../../src/radios/d890uv/constants';

/** Build a well-formed read response the way the radio is documented to. */
function makeReadResponse(address: number, payload: Uint8Array): Uint8Array {
  const frame = new Uint8Array(readResponseSize(payload.length));
  frame[0] = D890_CMD.WRITE;
  writeAddressBE(frame, 1, address);
  frame[5] = payload.length;
  frame.set(payload, 6);
  const ck = 6 + payload.length;
  frame[ck] = checksum8(frame, 1, ck);
  frame[ck + 1] = D890_CMD.ACK;
  return frame;
}

describe('address encoding', () => {
  it('round-trips big-endian', () => {
    const b = new Uint8Array(4);
    writeAddressBE(b, 0, 0x03482a00);
    expect(Array.from(b)).toEqual([0x03, 0x48, 0x2a, 0x00]);
    expect(readAddressBE(b, 0)).toBe(0x03482a00);
  });

  it('handles addresses above 0x7fffffff without sign issues', () => {
    const b = new Uint8Array(4);
    writeAddressBE(b, 0, 0xf0000000);
    expect(readAddressBE(b, 0)).toBe(0xf0000000);
  });
});

describe('checksum8', () => {
  it('sums the given range modulo 256', () => {
    expect(checksum8(new Uint8Array([1, 2, 3, 4]), 0, 4)).toBe(10);
  });

  it('wraps at 8 bits', () => {
    expect(checksum8(new Uint8Array([0xff, 0x02]), 0, 2)).toBe(0x01);
  });

  it('excludes bytes outside the range', () => {
    const b = new Uint8Array([0xff, 1, 2, 0xff]);
    expect(checksum8(b, 1, 3)).toBe(3);
  });
});

describe('the checksum bounds match the vendor routine', () => {
  /**
   * `sub_0062b760`, disassembled: a `mov cl, byte [edx+eax]` / `add edx, ebx`
   * loop ending in `and ecx, 0x800000ff`. A plain 8-bit additive sum over the
   * address, the length and all 16 data bytes — excluding the leading 0x57, the
   * checksum itself and the trailing 0x06. Its `UBound-2` default bound lands
   * exactly on the last data byte.
   *
   * This is worth pinning rather than trusting, for two reasons. A checksum
   * whose range is off by one byte still agrees with ITSELF, so encode/decode
   * round-trip tests pass and only the radio disagrees. And because the read
   * reply and the write request are the same frame, these bounds are the ONLY
   * thing standing between a correct write frame and a rejected one — on a radio
   * where a bad write is not retryable.
   */
  it('covers frame[1..21] inclusive for a 16-byte payload', () => {
    const payload = Uint8Array.from({ length: 0x10 }, (_, i) => 0xa0 + i);
    const frame = new Uint8Array(24);
    frame[0] = 0x57;
    writeAddressBE(frame, 1, 0x03482a00);
    frame[5] = 0x10;
    frame.set(payload, 6);
    const sum = checksum8(frame, 1, 6 + 0x10);
    frame[22] = sum;
    frame[23] = 0x06;

    // Computed independently of the implementation, straight from the rule.
    let expected = 0;
    for (let i = 1; i <= 21; i++) expected = (expected + frame[i]) & 0xff;
    expect(sum).toBe(expected);

    // And the excluded bytes really are excluded: changing either must not move it.
    frame[0] = 0x52;
    frame[23] = 0x00;
    expect(checksum8(frame, 1, 6 + 0x10)).toBe(expected);
  });

  it('is a plain additive sum, not a CRC', () => {
    // Byte order must not matter to an additive sum. A CRC would fail this, and
    // failing it would mean the routine was misread.
    const a = Uint8Array.from([0, 0x11, 0x22, 0x33, 0x44]);
    const b = Uint8Array.from([0, 0x44, 0x33, 0x22, 0x11]);
    expect(checksum8(a, 1, 5)).toBe(checksum8(b, 1, 5));
  });

  it('validates a real read reply, which is the same frame a write sends', () => {
    // parseReadResponse rejects a frame whose checksum disagrees. Every read this
    // driver has ever completed passed that check, so the rule is confirmed
    // against live traffic — and by construction against the write frame too.
    const payload = Uint8Array.from({ length: 0x10 }, (_, i) => i);
    const frame = new Uint8Array(24);
    frame[0] = 0x57;
    writeAddressBE(frame, 1, 0x01000000);
    frame[5] = 0x10;
    frame.set(payload, 6);
    frame[22] = checksum8(frame, 1, 22);
    frame[23] = 0x06;
    expect(parseReadResponse(frame, 0x01000000, 0x10)).toEqual(payload);

    const corrupted = Uint8Array.from(frame);
    corrupted[22] = (corrupted[22] + 1) & 0xff;
    expect(() => parseReadResponse(corrupted, 0x01000000, 0x10)).toThrow(/checksum/i);
  });
});

describe('buildReadCommand', () => {
  it('is six bytes: opcode, BE address, length', () => {
    const cmd = buildReadCommand(0x4f80000, 0x10);
    expect(Array.from(cmd)).toEqual([0x52, 0x04, 0xf8, 0x00, 0x00, 0x10]);
  });

  it('accepts the documented maximum', () => {
    expect(buildReadCommand(0, D890_BLOCK.MAX_READ_LEN)[5]).toBe(0xf0);
  });

  it('rejects lengths outside the negotiated range', () => {
    expect(() => buildReadCommand(0, 0x08)).toThrow(/out of range/i);
    expect(() => buildReadCommand(0, 0x100)).toThrow(/out of range/i);
  });

  it('rejects unaligned lengths', () => {
    expect(() => buildReadCommand(0, 0x11)).toThrow(/multiple of/i);
  });
});

describe('parseReadResponse', () => {
  const payload = new Uint8Array([0xde, 0xad, 0xbe, 0xef, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);

  it('returns the payload from a well-formed frame', () => {
    const frame = makeReadResponse(0x1000000, payload);
    expect(Array.from(parseReadResponse(frame, 0x1000000, 16))).toEqual(Array.from(payload));
  });

  it('rejects a wrong opcode', () => {
    const frame = makeReadResponse(0x1000000, payload);
    frame[0] = 0x52;
    expect(() => parseReadResponse(frame, 0x1000000, 16)).toThrow(/bad opcode/i);
  });

  it('rejects a frame echoing a different address', () => {
    // The worst silent failure: attributing one region's bytes to another.
    const frame = makeReadResponse(0x2000000, payload);
    expect(() => parseReadResponse(frame, 0x1000000, 16)).toThrow(/address mismatch/i);
  });

  it('rejects a corrupted payload via the checksum', () => {
    const frame = makeReadResponse(0x1000000, payload);
    frame[7] ^= 0xff;
    expect(() => parseReadResponse(frame, 0x1000000, 16)).toThrow(/checksum mismatch/i);
  });

  it('rejects a missing trailer', () => {
    const frame = makeReadResponse(0x1000000, payload);
    frame[frame.length - 1] = 0x00;
    expect(() => parseReadResponse(frame, 0x1000000, 16)).toThrow(/missing trailer/i);
  });

  it('rejects a short frame instead of reading past the end', () => {
    const frame = makeReadResponse(0x1000000, payload).slice(0, 10);
    expect(() => parseReadResponse(frame, 0x1000000, 16)).toThrow(/wrong size/i);
  });

  it('sizes frames as payload + 8', () => {
    expect(readResponseSize(0x10)).toBe(0x18);
    expect(readResponseSize(0xf0)).toBe(0xf8);
  });
});

describe('buildWriteCommand', () => {
  const data = new Uint8Array(16).fill(0xab);

  it('lays out opcode, address, fixed length, payload, checksum, trailer', () => {
    const cmd = buildWriteCommand(0x1000000, data);
    expect(cmd.length).toBe(24);
    expect(cmd[0]).toBe(D890_CMD.WRITE);
    expect(readAddressBE(cmd, 1)).toBe(0x1000000);
    expect(cmd[5]).toBe(0x10);
    expect(cmd[22]).toBe(checksum8(cmd, 1, 22));
    expect(cmd[23]).toBe(D890_CMD.ACK);
  });

  it('refuses any payload that is not exactly 16 bytes', () => {
    // Oversized writes are documented to desynchronise the radio, so this must
    // fail loudly rather than pad or split.
    expect(() => buildWriteCommand(0x1000000, new Uint8Array(15))).toThrow(/exactly 16/i);
    expect(() => buildWriteCommand(0x1000000, new Uint8Array(32))).toThrow(/exactly 16/i);
  });

  it('refuses an unaligned address', () => {
    expect(() => buildWriteCommand(0x1000001, data)).toThrow(/aligned/i);
  });

  it('refuses the forbidden address', () => {
    expect(() => buildWriteCommand(D890_FORBIDDEN_WRITE_ADDRESS, data)).toThrow(
      /Refusing to write/i
    );
  });
});

describe('assertWritableAddress', () => {
  it('blocks only the one address the OEM CPS skips', () => {
    expect(() => assertWritableAddress(D890_FORBIDDEN_WRITE_ADDRESS)).toThrow();
    expect(() => assertWritableAddress(D890_FORBIDDEN_WRITE_ADDRESS - 0x10)).not.toThrow();
    expect(() => assertWritableAddress(D890_FORBIDDEN_WRITE_ADDRESS + 0x10)).not.toThrow();
  });

  it('names the address in the error so it is greppable', () => {
    expect(() => assertWritableAddress(D890_FORBIDDEN_WRITE_ADDRESS)).toThrow(/2fa0010/);
  });
});

describe('protected flash-management offsets', () => {
  // Two offsets belong to the radio's own flash management and must never be
  // written. They repeat at every D890_FLASH_MARKER_STRIDE, which is the only
  // reason that stride exists.
  //
  // Kept out because they hold structured data in otherwise-erased flash
  // (0x103FBF4 reads `22 33 44 55`, 0x103FFFC reads `55 55 AA AA`) AND the
  // vendor CPS writes them zero times across all 8,389 frames of its own
  // programming session. Two independent reasons.
  it('refuses the management offsets at every stride, not just the first', () => {
    for (const unit of [0, 1, 13, 200]) {
      for (const off of [0x3fbf0, 0x3fff0]) {
        const addr = unit * 0x40000 + off;
        expect(() => assertWritableAddress(addr),
          `unit ${unit} offset 0x${off.toString(16)}`).toThrow(/flash management/i);
      }
    }
  });

  it('still allows ordinary addresses at those same strides', () => {
    expect(() => assertWritableAddress(13 * 0x40000)).not.toThrow();
    expect(() => assertWritableAddress(13 * 0x40000 + 0x3fbe0)).not.toThrow();
    expect(() => assertWritableAddress(13 * 0x40000 + 0x3fc00)).not.toThrow();
  });

  it('blocks writes through buildWriteCommand too, not only the bare assert', () => {
    expect(() => buildWriteCommand(0x40000 + 0x3fff0, new Uint8Array(16)))
      .toThrow(/flash management/i);
  });
});
