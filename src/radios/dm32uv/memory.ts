/**
 * DM-32UV Memory Discovery and Reading
 * Handles metadata discovery, block reading, and shared helpers for protocol.
 */

import { DM32Connection } from './connection';
import { BLOCK_SIZE, CONNECTION } from './constants';
import { log } from '../../utils/protocolLogger';

export interface MemoryBlock {
  address: number;
  metadata: number;
  type: 'channel' | 'zone' | 'contact' | 'scan' | 'rxgroup' | 'message' | 'vfo' | 'digitalemergency' | 'analogemergency' | 'dmrradioid' | 'calibration' | 'config' | 'empty' | 'unknown';
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
  // endAddr is the last byte of the last block, so we need to align to block boundaries
  // Example: 0x001000 to 0x0C8FFF means blocks from 0x001000 to 0x0C8000 (inclusive)
  const alignedEndAddr = Math.floor(endAddr / 0x1000) * 0x1000; // Align end to block boundary
  const blockCount = Math.floor((alignedEndAddr - startAddr) / 0x1000) + 1;
  log.info(`Reading metadata from ${blockCount} blocks from 0x${startAddr.toString(16)} to 0x${alignedEndAddr.toString(16)} (endAddr was 0x${endAddr.toString(16)})`, 'Memory');

  // Scan 4KB-aligned blocks - read metadata byte at offset 0xFFF for each block
  let blockIndex = 0;
  for (let addr = startAddr; addr <= alignedEndAddr; addr += 0x1000) {
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
    } else if (metadata === 0x11) {
      type = 'scan'; // Scan lists identified as metadata 0x11 (17) from debug export analysis
    } else if (metadata === 0x03) {
      type = 'digitalemergency'; // Digital Emergency Systems
    } else if (metadata === 0x04) {
      type = 'vfo'; // Radio Settings / Radio Names / Embedded Information
    } else if (metadata === 0x10) {
      type = 'analogemergency'; // Analog Emergency Systems
    } else if (metadata === 0x0A) {
      type = 'message'; // Quick text messages
    } else if (metadata === 0x02) {
      type = 'calibration'; // Frequency adjustment/calibration data
    } else if (metadata === 0x0F) {
      type = 'rxgroup'; // DMR RX Groups (DMR Receive Groups)
    } else if (metadata === 0x67) {
      type = 'dmrradioid'; // DMR Radio ID list
    } else if (metadata === 0x06) {
      type = 'config'; // Config section 4 (contains Talk Groups counter at 0x1FF)
    } else if (metadata === 0xFF) {
      type = 'empty'; // Invalid/unavailable
    } else {
      // All other metadata values are marked as 'unknown' for analysis
      // Known but unhandled metadata values:
      // 0x07 - Config header
      // 0x0F - RX Groups/Memberships (V-frame 0x0E range)
      // Others - Need investigation
      type = 'unknown';
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

  const channelCount = blocks.filter(b => b.type === 'channel').length;
  const zoneCount = blocks.filter(b => b.type === 'zone').length;
  const scanCount = blocks.filter(b => b.type === 'scan').length;
  const unknownCount = blocks.filter(b => b.type === 'unknown').length;
  const emptyCount = blocks.filter(b => b.type === 'empty').length;
  
  log.info(`Discovered ${blocks.length} blocks: Channels=${channelCount}, Zones=${zoneCount}, Scan Lists=${scanCount}, Unknown=${unknownCount}, Empty=${emptyCount}`, 'Memory');
  
  // Log unknown metadata values for investigation
  if (unknownCount > 0) {
    const unknownMetadata = new Set(blocks.filter(b => b.type === 'unknown').map(b => b.metadata));
    log.debug(`Unknown metadata values: ${Array.from(unknownMetadata).sort((a, b) => a - b).map(m => `0x${m.toString(16).padStart(2, '0')}`).join(', ')}`, 'Memory');
  }
  
  return blocks;
}

/**
 * Read channel count from first channel block
 */
export async function readChannelCount(
  connection: DM32Connection,
  firstChannelBlockAddr: number
): Promise<number> {
  // Channel count is in first 2 bytes of first channel block (little-endian)
  const data = await connection.readMemory(firstChannelBlockAddr, 2);
  const count = data[0] | (data[1] << 8);
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

// --- Helpers (block/memory utilities used by protocol) ---

/**
 * Validate that connection and radio info are available.
 * @throws {Error} If not connected
 */
export function requireConnection(
  connection: DM32Connection | null,
  radioInfo: unknown
): void {
  if (!connection || !radioInfo) {
    throw new Error('Not connected to radio');
  }
}

/**
 * Validate that radio info is available (for parsing methods that don't need connection).
 * @throws {Error} If radio info not available
 */
export function requireRadioInfo(radioInfo: unknown): void {
  if (!radioInfo) {
    throw new Error('Radio info not available');
  }
}

/**
 * Validate that blocks have been discovered.
 * @throws {Error} If no blocks discovered
 */
export function requireDiscoveredBlocks(discoveredBlocks: MemoryBlock[]): void {
  if (discoveredBlocks.length === 0) {
    throw new Error('No blocks discovered. Read channels first.');
  }
}

/**
 * Check if blocks are empty and return early with progress update.
 */
export function checkEmptyBlocks(
  blocks: MemoryBlock[],
  blockType: string,
  onProgress?: (progress: number, message: string) => void
): boolean {
  if (blocks.length === 0) {
    log.debug(`No ${blockType} blocks found`, 'Helpers');
    onProgress?.(100, `No ${blockType}s found`);
    return true;
  }
  return false;
}

/**
 * Read and concatenate multiple memory blocks.
 */
export async function readAndConcatenateBlocks(
  connection: DM32Connection,
  blocks: MemoryBlock[],
  onProgress?: (progress: number, message: string) => void,
  onBlockRead?: (block: MemoryBlock, blockData: Uint8Array) => void
): Promise<Uint8Array> {
  let allData = new Uint8Array(0);

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const progress = Math.floor((i / blocks.length) * 50);
    onProgress?.(progress, `Reading block ${i + 1} of ${blocks.length}...`);

    const blockData = await connection.readMemory(block.address, BLOCK_SIZE.STANDARD);

    if (onBlockRead) {
      onBlockRead(block, blockData);
    }

    const newAllData = new Uint8Array(allData.length + blockData.length);
    newAllData.set(allData);
    newAllData.set(blockData, allData.length);
    allData = newAllData;

    if (i < blocks.length - 1) {
      await new Promise(resolve => setTimeout(resolve, CONNECTION.BLOCK_READ_DELAY));
    }
  }

  return allData;
}

/**
 * Store raw data for debug export (zones/scan lists).
 */
export function storeRawData<T extends { data: Uint8Array; [key: string]: unknown; offset: number }>(
  storage: Map<string, T>,
  key: string,
  data: Uint8Array,
  itemData: Omit<T, 'data' | 'offset'>,
  offset: number
): void {
  storage.set(key, {
    ...itemData,
    data: new Uint8Array(data),
    offset: offset,
  } as T);
}