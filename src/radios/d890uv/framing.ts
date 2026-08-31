/**
 * AT-D890UV / DA-7X2 wire framing — pure functions, no I/O.
 *
 * Provenance, best to worst:
 *   - The READ path is exercised end to end against a real radio, and the frame
 *     layout, the 8-bit additive checksum and its bounds are also confirmed
 *     against the vendor CPS's own routine (`sub_0062b760`, disassembled: a
 *     byte-add loop ending in `and ecx, 0x800000ff` — no CRC, no table).
 *   - The read reply and the write request are THE SAME FRAME, so validating a
 *     read reply's checksum validates the write checksum by construction.
 *   - The WRITE path has never been executed, here or by the analysis this is
 *     built on. It is inference.
 *
 * One deliberate divergence from the vendor CPS: it only ever reads 16 bytes at
 * a time. Longer reads are negotiated here and work on hardware, so the 16-byte
 * figure is the CPS's habit, not a protocol limit. Writes get no such benefit —
 * no long-write form exists in the binary at all.
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
  // The flash-management blocks at the tail of EVERY 256 KB erase unit.
  //
  // ✅ CONFIRMED ON HARDWARE 2026-08-30. Both offsets were read from a radio and
  // both hold structured data in otherwise-erased flash:
  //
  //     0x103FBF4:  22 33 44 55
  //     0x103FFFC:  55 55 AA AA
  //
  // 0x55/0xAA is the canonical alternating-bit pattern of flash and EEPROM
  // management. Everything around them is 0xFF. This is not codeplug data and
  // it is not erased flash.
  //
  // The history matters, because it nearly went the other way. The comment here
  // once cited "a full-codeplug capture of 9,976 write frames" — a capture that
  // does not exist; no write has ever been performed by this project. With that
  // retracted, and with static analysis showing the constants 0x3FBF0/0x3FFF0
  // appear ZERO times in the vendor CPS, the guard rested on nothing but
  // recollection and was a candidate for removal. Reading the radio was the
  // cheap, zero-risk experiment that settled it — and the recollection was
  // right.
  //
  // Checked modulo the unit size, because they repeat.
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
/**
 * ⚠️ WRITE-SESSION RULES — operator-established 2026-08-30, and the first one
 * will damage a radio if ignored.
 *
 * 1. **NEVER READ DURING A WRITE SESSION.** Interleaving a read with writes makes
 *    the radio REBOOT. This is not a performance note; a reboot part-way through
 *    a write leaves the codeplug half-applied. It also rules out the obvious
 *    "verify each record as we go" design.
 *
 * 2. **The radio needs time to commit.** Allow roughly a minute after the last
 *    frame before reading anything back.
 *
 * 3. **NeonPlug must not read back after every write.** Verification is a
 *    TESTING activity — write the whole session, close it, wait, then read to
 *    compare. It is not a routine part of writing, and building it into the
 *    normal path would mean rebooting the radio on every save.
 *
 * The vendor CPS agrees by construction: a captured write session of 8389 frames
 * contains exactly ONE read, at 0x04f80020, before the first write. It never
 * reads again, and it never verifies.
 *
 * 4. **WHY in-session read-back is meaningless, not merely disruptive.** Writes
 *    stage to RAM and commit at END; a read in the same PROGRAM session returns
 *    FLASH, not the staged shadow. So an in-session verify does not just reboot
 *    the radio — it compares against the pre-write contents and "passes" while
 *    proving nothing. Verification must be CROSS-SESSION: write, END, let the
 *    radio restart, reconnect, then compare.
 *
 * 5. **A "whole unit must be re-staged" rule does NOT hold — our own capture
 *    refutes it.** A third-party project reports that writing any 16-byte block
 *    into a 256 KB unit erases the whole unit, so every co-resident byte must be
 *    re-staged in the same session. Measured against the vendor CPS's own write
 *    session, that cannot be right: it writes as little as 0.01% of a unit
 *    (2 frames into 0x4b80000, 3 into 0x3f00000) and 31 units at a mean of
 *    ~1.6%, on a radio that works afterwards. Re-staging 31 units would be
 *    507,904 frames; the CPS sends 8,389.
 *
 *    The reconciliation is most likely that the RADIO handles erase internally —
 *    read-modify-erase-write behind the W frame — which also explains why the
 *    vendor binary contains no erase vocabulary at all. Sparse 16-byte writes are
 *    what the vendor does, so they are what we should do.
 *
 * 6. **The guarded offsets: what WE established, and what is hearsay.**
 *    OURS: they hold structured data in otherwise-erased flash (0x103FBF4 reads
 *    `22 33 44 55`, 0x103FFFC reads `55 55 AA AA`), the CPS never writes them —
 *    0 occurrences across 8389 frames and 31 units — and the constants appear
 *    ZERO times in the vendor binary. That is ample reason never to write them.
 *
 *    RELAYED, NOT VERIFIED: a third-party report that transmitting them diverts
 *    every write 0x40000 above the address sent and can factory-reset the radio.
 *    We see no trace of that in the disassembly or in either serial capture, and
 *    the same report notes "Program error" has at least three distinct causes and
 *    is not diagnostic. Treat it as an untested account of someone else's
 *    incident, not as a mechanism we understand. The guard stands on our own
 *    evidence and does not need it.
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
