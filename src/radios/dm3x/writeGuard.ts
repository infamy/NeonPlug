/**
 * The DM-32's calibration block is never written.
 *
 * Calibration is the radio's factory frequency and power adjustment: one 4 KB
 * block in the main config memory, tagged metadata 0x02. NeonPlug reads it and
 * has no reason ever to send it back, but until 2026-09-12 nothing stopped a
 * write reaching it. Every writer chose its own addresses. The codeplug write
 * looks its blocks up by metadata; the contact and boot-image writes walk
 * addresses the radio reports and never check what is there. Protection rested
 * on each of them choosing correctly.
 *
 * So every write is checked here, from the only two methods that send a DM-32
 * write command, before a byte goes out. A write is refused when:
 *
 *   - there is no guard context: no memory layout from V-frame 0x0A;
 *   - it overlaps a block the metadata scan found tagged 0x02;
 *   - it lands in the config memory when no scan has run, or at an address the
 *     scan did not report. Calibration lives there and its address is not
 *     fixed, so not knowing where it is means not writing there;
 *   - it would tag a config block 0x02, by its metadata or its own byte 0xFFF.
 *
 * Outside the config memory, byte 0xFFF is data rather than a block tag (a
 * contact record, a boot image pixel), so only the overlap rule applies there.
 * The limit of this: the scan covers the config memory alone, so a calibration
 * block the radio kept anywhere else would be invisible to it.
 */

import { BLOCK_SIZE, METADATA } from './constants';
import type { MemoryBlock } from './memory';

export interface WriteGuardContext {
  /** V-frame 0x0A's main config memory. Every metadata block, calibration included, is in it. */
  configStart: number;
  configEnd: number;
  /** The block map from the last metadata scan, or restored from the read. Empty when there has been none. */
  blocks: readonly MemoryBlock[];
}

export interface BlockWrite {
  address: number;
  length: number;
  /** The bytes, when known: byte 0xFFF is the tag the block is left with. */
  data?: Uint8Array;
  metadata?: number;
}

const hex = (address: number) => `0x${address.toString(16).padStart(6, '0').toUpperCase()}`;

/** Throws, naming the rule, if `write` could touch the calibration block. */
export function assertBlockWritable(write: BlockWrite, ctx: WriteGuardContext | null): void {
  const at = hex(write.address);
  if (!ctx) {
    throw new Error(
      `Refusing to write ${at}: the radio's memory layout is unknown, so the calibration block cannot be ruled out.`
    );
  }

  const first = write.address;
  const last = write.address + Math.max(write.length, 1) - 1;

  const calibration = ctx.blocks.find(
    (b) =>
      b.metadata === METADATA.CALIBRATION &&
      first <= b.address + BLOCK_SIZE.STANDARD - 1 &&
      last >= b.address
  );
  if (calibration) {
    throw new Error(
      `Refusing to write ${at}: it would overwrite the radio's calibration data at ${hex(calibration.address)}, which NeonPlug never writes.`
    );
  }

  if (first > ctx.configEnd || last < ctx.configStart) return;

  if (ctx.blocks.length === 0) {
    throw new Error(
      `Refusing to write ${at}: it is in the radio's config memory, and without a block scan the calibration block's location is unknown.`
    );
  }
  if (!ctx.blocks.some((b) => b.address === write.address)) {
    throw new Error(
      `Refusing to write ${at}: it is in the radio's config memory but is not a block the scan reported.`
    );
  }
  const tag = write.data && write.data.length > 0xfff ? write.data[0xfff] : undefined;
  if (write.metadata === METADATA.CALIBRATION || tag === METADATA.CALIBRATION) {
    throw new Error(
      `Refusing to write ${at}: the block would be tagged as calibration data (metadata 0x02), which NeonPlug never writes.`
    );
  }
}
