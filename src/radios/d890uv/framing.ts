/**
 * AT-D890UV / DA-7X2 wire framing — pure functions, no I/O.
 *
 * ⚠️ Transcribed from documentation, not verified on hardware.
 *
 * Split out of connection.ts so the checksum and frame layout can be unit
 * tested without a serial port. A checksum that is off by one byte of range
 * still "works" against itself and fails only against the radio, which is
 * exactly the class of bug that is miserable to debug over a cable.
 */

import {
  D890_CMD,
  D890_BLOCK,
  D890_FORBIDDEN_WRITE_ADDRESS,
  D890_ERASE_UNIT,
  D890_FORBIDDEN_UNIT_OFFSETS,
} from './constants';

/**
 * 8-bit sum over `[start, end)`. Both directions use the same rule: every byte
 * between the opcode and the checksum — address, length, and payload — with the
 * opcode, checksum and trailer excluded.
 */
export function checksum8(bytes: Uint8Array, start: number, end: number): number {
  let sum = 0;
  for (let i = start; i < end; i++) sum = (sum + (bytes[i] ?? 0)) & 0xff;
  return sum;
}

/** Write a 32-bit address big-endian at `offset`. */
export function writeAddressBE(target: Uint8Array, offset: number, address: number): void {
  target[offset] = (address >>> 24) & 0xff;
  target[offset + 1] = (address >>> 16) & 0xff;
  target[offset + 2] = (address >>> 8) & 0xff;
  target[offset + 3] = address & 0xff;
}

/** Read a 32-bit big-endian address at `offset`. */
export function readAddressBE(bytes: Uint8Array, offset: number): number {
  return (
    (((bytes[offset] ?? 0) << 24) |
      ((bytes[offset + 1] ?? 0) << 16) |
      ((bytes[offset + 2] ?? 0) << 8) |
      (bytes[offset + 3] ?? 0)) >>>
    0
  );
}

/**
 * Read request: 'R' + address(BE32) + length. Six bytes, no checksum — only
 * responses and writes carry one.
 */
export function buildReadCommand(address: number, length: number): Uint8Array {
  if (length < D890_BLOCK.MIN_READ_LEN || length > D890_BLOCK.MAX_READ_LEN) {
    throw new Error(
      `D890 read length ${length} out of range ` +
        `(${D890_BLOCK.MIN_READ_LEN}..${D890_BLOCK.MAX_READ_LEN})`
    );
  }
  if (length % D890_BLOCK.ALIGNMENT !== 0) {
    throw new Error(`D890 read length ${length} must be a multiple of ${D890_BLOCK.ALIGNMENT}`);
  }
  const cmd = new Uint8Array(6);
  cmd[0] = D890_CMD.READ;
  writeAddressBE(cmd, 1, address);
  cmd[5] = length;
  return cmd;
}

/** Total bytes in a read response carrying `length` payload bytes. */
export function readResponseSize(length: number): number {
  // 'W' + addr(4) + len(1) + payload + checksum + trailer
  return length + 8;
}

/**
 * Validate a read response and return its payload.
 *
 * Checks the opcode, that the echoed address and length match what was asked
 * for, the checksum, and the trailer. A silently mismatched address is the
 * worst failure here — it would attribute one region's bytes to another.
 */
export function parseReadResponse(
  frame: Uint8Array,
  expectedAddress: number,
  expectedLength: number
): Uint8Array {
  const expectedSize = readResponseSize(expectedLength);
  if (frame.length !== expectedSize) {
    throw new Error(
      `D890 read response wrong size: got ${frame.length}, expected ${expectedSize}`
    );
  }
  if (frame[0] !== D890_CMD.WRITE) {
    throw new Error(
      `D890 read response bad opcode: got 0x${(frame[0] ?? 0).toString(16)}, expected 0x57`
    );
  }

  const echoedAddress = readAddressBE(frame, 1);
  if (echoedAddress !== expectedAddress) {
    throw new Error(
      `D890 read response address mismatch: got 0x${echoedAddress.toString(16)}, ` +
        `expected 0x${expectedAddress.toString(16)}`
    );
  }
  if (frame[5] !== expectedLength) {
    throw new Error(
      `D890 read response length mismatch: got ${frame[5]}, expected ${expectedLength}`
    );
  }

  const checksumIndex = 6 + expectedLength;
  const expectedChecksum = checksum8(frame, 1, checksumIndex);
  if (frame[checksumIndex] !== expectedChecksum) {
    throw new Error(
      `D890 read checksum mismatch at 0x${expectedAddress.toString(16)}: ` +
        `got 0x${(frame[checksumIndex] ?? 0).toString(16)}, ` +
        `expected 0x${expectedChecksum.toString(16)}`
    );
  }
  if (frame[checksumIndex + 1] !== D890_CMD.ACK) {
    throw new Error(
      `D890 read response missing trailer: got 0x${(frame[checksumIndex + 1] ?? 0).toString(16)}`
    );
  }

  return frame.slice(6, 6 + expectedLength);
}

/**
 * Refuse the one address the OEM CPS deliberately skips. Enforced here rather
 * than at call sites so it cannot be forgotten by a future writer.
 */
export function assertWritableAddress(address: number): void {
  if (address === D890_FORBIDDEN_WRITE_ADDRESS) {
    throw new Error(
      `Refusing to write to 0x${address.toString(16)} — the OEM CPS skips this ` +
        `address and writing it is believed to damage the radio.`
    );
  }
  // The flash-management blocks at the tail of EVERY 256 KB erase unit. The OEM
  // CPS never touches these: a full-codeplug capture of 9,976 write frames hit
  // neither offset. Checked modulo the unit size, because they repeat.
  const offsetInUnit = address % D890_ERASE_UNIT;
  if (D890_FORBIDDEN_UNIT_OFFSETS.includes(offsetInUnit as 0x3fbf0 | 0x3fff0)) {
    throw new Error(
      `Refusing to write to 0x${address.toString(16)} — offset 0x${offsetInUnit.toString(16)} ` +
        `within each 256 KB erase unit belongs to the radio's flash management.`
    );
  }
}

/**
 * Write request: 'W' + address(BE32) + 0x10 + 16 data bytes + checksum + 0x06.
 *
 * The payload size is fixed. The reference is explicit that oversized writes
 * desynchronise the radio, so this rejects anything but exactly 16 bytes rather
 * than padding or splitting silently.
 */
export function buildWriteCommand(address: number, data: Uint8Array): Uint8Array {
  assertWritableAddress(address);
  if (data.length !== D890_BLOCK.WRITE_LEN) {
    throw new Error(
      `D890 write payload must be exactly ${D890_BLOCK.WRITE_LEN} bytes, got ${data.length}`
    );
  }
  if (address % D890_BLOCK.ALIGNMENT !== 0) {
    throw new Error(
      `D890 write address 0x${address.toString(16)} must be ${D890_BLOCK.ALIGNMENT}-byte aligned`
    );
  }
  const cmd = new Uint8Array(6 + D890_BLOCK.WRITE_LEN + 2);
  cmd[0] = D890_CMD.WRITE;
  writeAddressBE(cmd, 1, address);
  cmd[5] = D890_BLOCK.WRITE_LEN;
  cmd.set(data, 6);
  const checksumIndex = 6 + D890_BLOCK.WRITE_LEN;
  cmd[checksumIndex] = checksum8(cmd, 1, checksumIndex);
  cmd[checksumIndex + 1] = D890_CMD.ACK;
  return cmd;
}
