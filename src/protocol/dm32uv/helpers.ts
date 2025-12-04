/**
 * DM-32UV Protocol Helper Functions
 * Shared utility functions to reduce code duplication
 */

import type { DM32Connection } from './connection';
import type { MemoryBlock } from './memory';
import { BLOCK_SIZE, CONNECTION } from './constants';

/**
 * Validate that connection and radio info are available
 * @throws {Error} If not connected
 */
export function requireConnection(
  connection: DM32Connection | null,
  radioInfo: any
): void {
  if (!connection || !radioInfo) {
    throw new Error('Not connected to radio');
  }
}

/**
 * Validate that blocks have been discovered
 * @throws {Error} If no blocks discovered
 */
export function requireDiscoveredBlocks(discoveredBlocks: MemoryBlock[]): void {
  if (discoveredBlocks.length === 0) {
    throw new Error('No blocks discovered. Read channels first.');
  }
}

/**
 * Check if blocks are empty and return early with progress update
 * @param blocks Array of blocks to check
 * @param blockType Type name for logging (e.g., 'zone', 'scan list')
 * @param onProgress Progress callback
 * @returns True if empty, false otherwise
 */
export function checkEmptyBlocks(
  blocks: MemoryBlock[],
  blockType: string,
  onProgress?: (progress: number, message: string) => void
): boolean {
  if (blocks.length === 0) {
    console.log(`No ${blockType} blocks found`);
    onProgress?.(100, `No ${blockType}s found`);
    return true;
  }
  return false;
}

/**
 * Read and concatenate multiple memory blocks
 * 
 * Reads blocks sequentially with delays and concatenates them into a single Uint8Array.
 * 
 * @param connection Connection to use for reading
 * @param blocks Array of blocks to read
 * @param onProgress Progress callback (receives 0-50% for reading, expects 50-100% for parsing)
 * @param onBlockRead Optional callback when each block is read (for storing in blockData)
 * @returns Concatenated block data
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
    const progress = Math.floor((i / blocks.length) * 50); // 0-50% for reading
    onProgress?.(progress, `Reading block ${i + 1} of ${blocks.length}...`);
    
    const blockData = await connection.readMemory(block.address, BLOCK_SIZE.STANDARD);
    
    // Optional callback for storing block data (e.g., for debug export)
    if (onBlockRead) {
      onBlockRead(block, blockData);
    }
    
    // Concatenate block data
    const newAllData = new Uint8Array(allData.length + blockData.length);
    newAllData.set(allData);
    newAllData.set(blockData, allData.length);
    allData = newAllData;
    
    // Add delay between block reads to avoid overwhelming the radio
    if (i < blocks.length - 1) {
      await new Promise(resolve => setTimeout(resolve, CONNECTION.BLOCK_READ_DELAY));
    }
  }
  
  return allData;
}

/**
 * Store raw data for debug export (zones/scan lists)
 * 
 * @param storage Map to store data in
 * @param key Key to store under (e.g., zone name, scan list name)
 * @param data Raw data bytes
 * @param itemNum Item number (zone number, scan list number)
 * @param offset Calculated offset in the concatenated data
 */
export function storeRawData<T extends { data: Uint8Array; [key: string]: any; offset: number }>(
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

