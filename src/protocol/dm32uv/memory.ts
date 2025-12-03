/**
 * DM-32UV Memory Discovery and Reading
 * Handles metadata discovery to find channel blocks, zone blocks, etc.
 */

import { DM32Connection } from './connection';

export interface MemoryBlock {
  address: number;
  metadata: number;
  type: 'channel' | 'zone' | 'contact' | 'scan' | 'rxgroup' | 'message' | 'empty' | 'unknown';
}

/**
 * Discover memory blocks by reading metadata bytes.
 * According to the spec: V-frame 0x0A gives us the range (200 blocks = 800KB / 4KB).
 * We read 1 byte at offset 0xFFF for each of the 200 blocks.
 */
export async function discoverMemoryBlocks(
  connection: DM32Connection,
  startAddr: number,
  endAddr: number,
  onProgress?: (current: number, total: number) => void
): Promise<MemoryBlock[]> {
  const blocks: MemoryBlock[] = [];

  // Calculate number of 4KB blocks
  const blockCount = Math.floor((endAddr - startAddr + 1) / 0x1000);
  console.log(`Reading metadata from ${blockCount} blocks from 0x${startAddr.toString(16)} to 0x${endAddr.toString(16)}`);

  // Scan 4KB-aligned blocks - read metadata byte at offset 0xFFF for each block
  let blockIndex = 0;
  for (let addr = startAddr; addr <= endAddr; addr += 0x1000) {
    // Read metadata byte at offset 0xFFF (last byte of 4KB block)
    const metadataAddr = addr + 0xFFF;
    const metadataData = await connection.readMemory(metadataAddr, 1);
    const metadata = metadataData[0];

    let type: MemoryBlock['type'] = 'unknown';
    if (metadata === 0x00) {
      type = 'empty';
    } else if (metadata >= 0x12 && metadata <= 0x41) {
      type = 'channel'; // Channel blocks (0x12 = first, 0x41 = last)
    } else if (metadata === 0x5c) {
      type = 'zone'; // Zones identified as metadata 0x5c (92) from debug export analysis
    } else if (metadata === 0x0F) {
      type = 'rxgroup';
    } else if (metadata === 0x0A) {
      type = 'message';
    } else if (metadata === 0x11) {
      type = 'scan'; // Scan lists identified as metadata 0x11 (17) from debug export analysis
    } else if (metadata === 0x06) {
      type = 'unknown'; // Previously thought to be scan lists, but appears unused
    } else if (metadata === 0x07) {
      type = 'unknown'; // Config header
    } else if (metadata === 0x10) {
      type = 'unknown'; // Emergency systems
    } else if (metadata === 0xFF) {
      type = 'empty'; // Invalid/unavailable
    }

    blocks.push({ address: addr, metadata, type });
    
    blockIndex++;
    if (onProgress && blockIndex % 10 === 0) {
      onProgress(blockIndex, blockCount);
    }
    
    // Small delay between metadata reads to avoid overwhelming the radio
    if (blockIndex < blockCount) {
      await new Promise(resolve => setTimeout(resolve, 5));
    }
  }

  console.log(`Discovered ${blocks.length} blocks: ${blocks.filter(b => b.type === 'channel').length} channel blocks`);
  return blocks;
}

/**
 * Read channel count from first channel block
 */
export async function readChannelCount(
  connection: DM32Connection,
  firstChannelBlockAddr: number
): Promise<number> {
  // Channel count is in first 4 bytes of first channel block
  const data = await connection.readMemory(firstChannelBlockAddr, 4);
  const count = data[0] | (data[1] << 8) | (data[2] << 16) | (data[3] << 24);
  return count;
}

/**
 * Read all channel blocks
 */
export async function readChannelBlocks(
  connection: DM32Connection,
  channelBlocks: MemoryBlock[],
  onProgress?: (progress: number, message: string) => void
): Promise<Map<number, Uint8Array>> {
  const blocks = new Map<number, Uint8Array>();
  let blocksRead = 0;
  const totalBlocks = channelBlocks.filter(b => b.type === 'channel').length;

  for (const block of channelBlocks) {
    if (block.type === 'channel') {
      onProgress?.((blocksRead / totalBlocks) * 100, `Reading block ${blocksRead + 1} of ${totalBlocks}...`);
      const data = await connection.readMemory(block.address, 4096);
      blocks.set(block.address, data);
      blocksRead++;
    }
  }

  onProgress?.(100, `Read ${blocksRead} channel blocks`);
  return blocks;
}

