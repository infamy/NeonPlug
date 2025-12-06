/**
 * DM-32UV Protocol Implementation
 * Main protocol interface implementation using Web Serial API
 */

import { DM32Connection } from './connection';
import { discoverMemoryBlocks, readChannelCount, type MemoryBlock } from './memory';
import { parseChannel, parseZones, parseScanLists, parseContacts, encodeChannel, encodeZone, encodeScanList, parseRadioSettings, encodeRadioSettings, encodeDigitalEmergencies, encodeAnalogEmergencies, parseQuickMessages, parseDMRRadioIDs, parseCalibration, parseRXGroups } from './structures';
import type { RadioProtocol, RadioInfo } from '../interface';
import type { Channel, Zone, Contact, RadioSettings, ScanList, DigitalEmergency, DigitalEmergencyConfig, AnalogEmergency, QuickTextMessage, DMRRadioID, Calibration, RXGroup } from '../../models';
import type { WebSerialPort } from './types';
import { METADATA, BLOCK_SIZE, OFFSET, VFRAME, CONNECTION } from './constants';
import { withTimeout } from './utils';
import { 
  requireConnection,
  requireRadioInfo,
  requireDiscoveredBlocks, 
  checkEmptyBlocks,
  readAndConcatenateBlocks,
  storeRawData,
} from './helpers';
import { writeChannelFlagBit } from './structures';

/**
 * DM-32UV Protocol Implementation
 * 
 * Implements the RadioProtocol interface for the Baofeng DM-32UV radio.
 * Handles connection, V-frame queries, memory block discovery, and data parsing.
 * 
 * @example
 * ```typescript
 * const protocol = new DM32UVProtocol();
 * protocol.onProgress = (progress, message) => console.log(`${progress}%: ${message}`);
 * await protocol.connect();
 * const channels = await protocol.readChannels();
 * await protocol.disconnect();
 * ```
 */
export class DM32UVProtocol implements RadioProtocol {
  private connection: DM32Connection | null = null;
  private port: WebSerialPort | null = null;
  private radioInfo: RadioInfo | null = null;
  
  /**
   * Progress callback for long-running operations
   * @param progress Progress percentage (0-100)
   * @param message Status message
   */
  public onProgress?: (progress: number, message: string) => void;
  public rawChannelData: Map<number, { data: Uint8Array; blockAddr: number; offset: number }> = new Map();
  public rawZoneData: Map<string, { data: Uint8Array; zoneNum: number; offset: number }> = new Map();
  public rawScanListData: Map<string, { data: Uint8Array; listNum: number; offset: number }> = new Map();
  public rawRadioSettingsData: Uint8Array | null = null;
  public rawDigitalEmergencyData: Uint8Array | null = null;
  public rawAnalogEmergencyData: Uint8Array | null = null;
  public rawMessageData: Map<number, { data: Uint8Array; messageIndex: number; offset: number }> = new Map();
  public rawDMRRadioIDData: Map<number, { data: Uint8Array; idIndex: number; offset: number }> = new Map();
  public rawRXGroupData: Map<number, { data: Uint8Array; groupIndex: number; offset: number }> = new Map();
  public blockMetadata: Map<number, { metadata: number; type: string }> = new Map();
  public blockData: Map<number, Uint8Array> = new Map();
  // Write blocks: stores blocks that will be written to radio (for debug confirmation)
  public writeBlockData: Map<number, { address: number; data: Uint8Array; metadata: number }> = new Map();
  private discoveredBlocks: MemoryBlock[] = []; // Store discovered blocks for reuse
  // Cached block data: array of [metadata, address, 4k block data] for efficient access
  public cachedBlockData: Array<{ metadata: number; address: number; data: Uint8Array }> = [];

  /**
   * Connect to the radio via Web Serial API
   * 
   * Opens a serial port connection, queries V-frames for radio information,
   * and enters programming mode. The user will be prompted to select a port.
   * 
   * @throws {Error} If Web Serial API is not supported
   * @throws {Error} If port is already in use
   * @throws {Error} If connection handshake fails
   */
  async connect(): Promise<void> {
    // Per-request timeouts handle each message/ack cycle (2s each, resets on response)
    // No overall connection timeout - each request/response has its own 2s timeout
    try {
      // Clear any previous cached data before starting a new connection
      this.clearCache();
      
      // Request serial port
      if (!('serial' in navigator)) {
        throw new Error('Web Serial API not supported. Please use Chrome/Edge.');
      }

      // Port selection dialog - no timeout, user can take as long as needed
      // Note: If user cancels, this will throw a DOMException, which we'll catch
      let port: WebSerialPort;
      try {
        port = await (navigator as any).serial.requestPort() as WebSerialPort;
      } catch (e: unknown) {
        const error = e as Error;
        // If user cancelled the port selection dialog, provide a clear message
        if (error.message && (error.message.includes('No port selected') || error.message.includes('cancelled') || error.name === 'NotFoundError')) {
          throw new Error('Port selection cancelled. Please select a port to continue.');
        }
        // Otherwise, rethrow the original error
        throw error;
      }
      
      // Check if port is already open
      // readable and writable being non-null indicates the port is open
      const isAlreadyOpen = port.readable !== null && port.writable !== null;
      
      if (isAlreadyOpen && port.readable && port.writable) {
        // Check if streams are locked (from a previous connection)
        if (port.readable.locked || port.writable.locked) {
          throw new Error('Port is in use by another connection. Please wait for the previous operation to complete.');
        }
        console.log('Port is already open, will use existing connection');
      } else {
        // Port is not open, so open it - wrap in timeout
        try {
          await withTimeout(
            port.open({ baudRate: CONNECTION.BAUD_RATE }),
            CONNECTION.TIMEOUT.PORT_OPEN,
            'Port open'
          );
        } catch (e: unknown) {
          const error = e as Error;
          // If it says already open (race condition), check for locked streams
          if (error.message && error.message.includes('already open')) {
            if ((port.readable && port.readable.locked) || (port.writable && port.writable.locked)) {
              throw new Error('Port is in use by another connection. Please wait for the previous operation to complete.');
            }
            console.log('Port opened by another process, will use existing connection');
          } else if (error.message && error.message.includes('timed out')) {
            throw new Error('Port open timed out. Please check the USB connection and try again.');
          } else {
            throw new Error(`Failed to open port: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        }
      }
      
      // Brief delay after opening port (as per spec)
      await new Promise(resolve => setTimeout(resolve, CONNECTION.INIT_DELAY));

      this.port = port;
      this.connection = new DM32Connection();
      // Each request/response in connect() has its own 2s timeout (per-request basis)
      await this.connection.connect(port);

      // Query V-frames to get radio info
      // Each V-frame query has its own 2s timeout (per-request basis)
      const vframes = await this.connection.queryVFrames();

      // Parse V-frame data
      const firmware = this.parseVFrameString(vframes, VFRAME.FIRMWARE, 'Unknown');
      const buildDate = this.parseVFrameString(vframes, VFRAME.BUILD_DATE, '');
      const dspVersion = this.parseVFrameString(vframes, VFRAME.DSP_VERSION, '');
      const radioVersion = this.parseVFrameString(vframes, VFRAME.RADIO_VERSION, '');
      const codeplugVersion = this.parseVFrameString(vframes, VFRAME.CODEPLUG_VERSION, '');

      // Parse memory layout (V-frame 0x0A) - Main config block range
      // Format: 8 bytes = start_addr (4 bytes LE) + end_addr (4 bytes LE)
      const configRange = vframes.get(VFRAME.MEMORY_LAYOUT);
      if (!configRange || configRange.length < 8) {
        throw new Error('Failed to get memory layout');
      }

      const startAddr = this.readUint32LE(configRange, 0);
      const endAddr = this.readUint32LE(configRange, 4);

      // Note: Other memory ranges (zones, contacts) can be parsed from V-frames if needed
      // const zonesRange = vframes.get(0x08);
      // const contactsRange = vframes.get(0x0F);

      this.radioInfo = {
        model: 'DP570UV',
        firmware,
        buildDate,
        dspVersion,
        radioVersion,
        codeplugVersion,
        memoryLayout: {
          configStart: startAddr,
          configEnd: endAddr,
        },
        vframes, // Store all raw V-frame data
      };

      // Enter programming mode
      // Each request/response in enterProgrammingMode() has its own 2s timeout
      await this.connection.enterProgrammingMode();
    } catch (error) {
      // Try to disconnect, but don't fail if we can't (e.g., locked streams)
      try {
        await this.disconnect();
      } catch (disconnectError) {
        console.warn('Error during disconnect cleanup:', disconnectError);
        // Don't throw - the original error is more important
      }
      throw error;
    }
  }

  /**
   * Disconnect from the radio
   * 
   * Closes the serial port connection.
   * NOTE: Does NOT clear cached block data - it's needed for parsing after disconnect.
   * Safe to call even if not connected.
   */
  async disconnect(): Promise<void> {
    if (this.connection) {
      await this.connection.disconnect();
      this.connection = null;
    }
    // Port is managed by connection, so we just clear the reference
    this.port = null;
    // Keep radioInfo and cachedBlockData - they're needed for parsing
    // Only clear connection-related state
  }

  /**
   * Clear all cached data (call this when starting a new connection)
   */
  clearCache(): void {
    this.radioInfo = null;
    this.rawChannelData = new Map();
    this.rawZoneData = new Map();
    this.rawScanListData = new Map();
    this.blockMetadata = new Map();
    this.blockData = new Map();
    this.discoveredBlocks = [];
    this.cachedBlockData = [];
  }

  /**
   * Check if currently connected to the radio
   * @returns True if connected, false otherwise
   */
  isConnected(): boolean {
    return this.connection !== null && this.port !== null;
  }

  /**
   * Get radio information
   * 
   * Returns cached radio information from the connection handshake.
   * Must be called after connect().
   * 
   * @returns Radio information including model, firmware, versions, and memory layout
   * @throws {Error} If not connected
   */
  async getRadioInfo(): Promise<RadioInfo> {
    if (!this.radioInfo) {
      throw new Error('Not connected to radio');
    }
    return this.radioInfo;
  }

  /**
   * Bulk read all required blocks based on metadata discovery
   * 
   * 1. Discovers all metadata blocks
   * 2. Determines which blocks we need (channels, zones, scan lists, fixed metadata blocks)
   * 3. Reads all required blocks into cachedBlockData array
   * 4. Blocks can then be parsed from cache without additional radio reads
   */
  async bulkReadRequiredBlocks(): Promise<void> {
    requireConnection(this.connection, this.radioInfo);

    this.onProgress?.(0, 'Discovering memory blocks...');

    // Step 1: Discover all metadata blocks
    const blocks = await discoverMemoryBlocks(
      this.connection!,
      this.radioInfo!.memoryLayout.configStart,
      this.radioInfo!.memoryLayout.configEnd,
      (current, total) => {
        const progress = Math.floor((current / total) * 10); // 0-10% for discovery
        this.onProgress?.(progress, `Reading metadata ${current} of ${total}...`);
      }
    );

    this.discoveredBlocks = blocks;

    // Store block metadata for debug export
    const blockMetadataMap = new Map<number, { metadata: number; type: string }>();
    for (const block of blocks) {
      blockMetadataMap.set(block.address, {
        metadata: block.metadata,
        type: block.type,
      });
    }
    (this as any).allBlockMetadata = blockMetadataMap;

    // Step 2: Determine which blocks we need to read
    const blocksToRead: MemoryBlock[] = [];

    // Step 2a: Determine channel blocks needed
    // Exception: Read first 4 bytes of first channel block to determine how many blocks we need
    const channelBlocks = blocks.filter(b => b.type === 'channel').sort((a, b) => a.metadata - b.metadata);
    if (channelBlocks.length > 0) {
      const firstChannelBlock = channelBlocks.find(b => b.metadata === METADATA.CHANNEL_FIRST);
      if (firstChannelBlock) {
        // Read ONLY the first 4 bytes to get channel count (exception to bulk read)
        this.onProgress?.(10, 'Reading channel count from first block...');
        const channelCount = await readChannelCount(this.connection!, firstChannelBlock.address);
        console.log(`Channel count: ${channelCount}`);
        
        // Calculate how many channel blocks we need based on count
        const channelsInFirstBlock = 84;
        let blocksNeeded: number;
        if (channelCount <= channelsInFirstBlock) {
          blocksNeeded = 1;
        } else {
          const remainingChannels = channelCount - channelsInFirstBlock;
          const additionalBlocks = Math.ceil(remainingChannels / 85);
          blocksNeeded = 1 + additionalBlocks + 1; // +1 for safety
        }
        blocksNeeded = Math.min(blocksNeeded, channelBlocks.length);
        
        // Add required channel blocks (will be fully read in Step 3)
        blocksToRead.push(...channelBlocks.slice(0, blocksNeeded));
      }
    }

    // Step 2b: Add fixed metadata blocks we always need
    const fixedMetadataBlocks = [
      METADATA.VFO_SETTINGS,        // Radio Settings
      METADATA.DIGITAL_EMERGENCY,    // Digital Emergency Systems
      METADATA.ANALOG_EMERGENCY,     // Analog Emergency Systems
      METADATA.QUICK_MESSAGES,       // Quick Messages
      METADATA.DMR_RADIO_IDS,        // DMR Radio IDs
      METADATA.CALIBRATION,          // Calibration
      METADATA.RX_GROUPS,            // RX Groups
    ];

    for (const metadata of fixedMetadataBlocks) {
      const block = blocks.find(b => b.metadata === metadata);
      if (block) {
        blocksToRead.push(block);
      }
    }

    // Step 2c: Add zone and scan list blocks
    const zoneBlocks = blocks.filter(b => b.type === 'zone');
    const scanBlocks = blocks.filter(b => b.type === 'scan');
    blocksToRead.push(...zoneBlocks);
    blocksToRead.push(...scanBlocks);

    // Step 2d: Add other data type blocks
    const messageBlocks = blocks.filter(b => b.type === 'message');
    const dmrRadioIdBlocks = blocks.filter(b => b.type === 'dmrradioid');
    const rxGroupBlocks = blocks.filter(b => b.type === 'rxgroup');
    blocksToRead.push(...messageBlocks);
    blocksToRead.push(...dmrRadioIdBlocks);
    blocksToRead.push(...rxGroupBlocks);

    // Remove duplicates (in case a block appears in multiple categories)
    const uniqueBlocks = new Map<number, MemoryBlock>();
    for (const block of blocksToRead) {
      uniqueBlocks.set(block.address, block);
    }

    const finalBlocksToRead = Array.from(uniqueBlocks.values());
    console.log(`Bulk reading ${finalBlocksToRead.length} blocks (channels, zones, scan lists, and fixed metadata blocks)`);

    // Step 3: Read ALL required blocks upfront into cachedBlockData array
    // This is the ONLY place we read blocks from the radio
    this.onProgress?.(10, `Reading ${finalBlocksToRead.length} blocks...`);
    this.cachedBlockData = [];

    for (let i = 0; i < finalBlocksToRead.length; i++) {
      const block = finalBlocksToRead[i];
      const progress = 10 + Math.floor((i / finalBlocksToRead.length) * 85); // 10-95%
      this.onProgress?.(progress, `Reading block ${i + 1} of ${finalBlocksToRead.length} (metadata 0x${block.metadata.toString(16)})...`);

      const blockData = await this.connection!.readMemory(block.address, BLOCK_SIZE.STANDARD);
      
      // Store as [metadata, address, 4k block data] in array
      this.cachedBlockData.push({
        metadata: block.metadata,
        address: block.address,
        data: blockData,
      });

      // Also store in blockData map for backward compatibility
      this.blockData.set(block.address, blockData);

      // Small delay between reads
      if (i < finalBlocksToRead.length - 1) {
        await new Promise(resolve => setTimeout(resolve, CONNECTION.BLOCK_READ_DELAY));
      }
    }

    this.onProgress?.(100, `Successfully cached ${this.cachedBlockData.length} blocks`);
    console.log(`Bulk read complete: ${this.cachedBlockData.length} blocks cached`);
    console.log('All blocks are now in cache - parsing can proceed without additional radio reads');
    
    // Step 4: Disconnect from radio - we have all the data we need
    // Parsing will happen from cached blocks, no connection needed
    // Disconnect silently (no progress message needed)
    await this.disconnect();
    console.log('Connection closed - all data is cached and ready for parsing');
  }

  /**
   * Get cached block data by metadata value
   */
  getCachedBlocksByMetadata(metadata: number): Array<{ metadata: number; address: number; data: Uint8Array }> {
    return this.cachedBlockData.filter(b => b.metadata === metadata);
  }

  /**
   * Get cached block data by address
   */
  getCachedBlockByAddress(address: number): { metadata: number; address: number; data: Uint8Array } | null {
    return this.cachedBlockData.find(b => b.address === address) || null;
  }

  /**
   * Concatenate cached blocks into a single Uint8Array
   */
  private concatenateCachedBlocks(blocks: MemoryBlock[]): Uint8Array {
    const allData = new Uint8Array(blocks.length * BLOCK_SIZE.STANDARD);
    let offset = 0;
    
    for (const block of blocks) {
      const cachedBlock = this.getCachedBlockByAddress(block.address);
      if (cachedBlock) {
        allData.set(cachedBlock.data, offset);
        offset += BLOCK_SIZE.STANDARD;
      } else {
        console.warn(`Block at address 0x${block.address.toString(16)} not found in cache`);
      }
    }
    
    return allData;
  }

  /**
   * Parse channels from cached blocks
   * Blocks must be read first via bulkReadRequiredBlocks()
   * This method ONLY parses - it does NOT read from the radio
   * Connection is not required - data comes from cache
   */
  async readChannels(): Promise<Channel[]> {
    requireRadioInfo(this.radioInfo);

    // Ensure blocks have been read
    if (this.cachedBlockData.length === 0 || this.discoveredBlocks.length === 0) {
      throw new Error('Blocks must be read first. Call bulkReadRequiredBlocks() before processing.');
    }

    this.onProgress?.(0, 'Parsing channels from cached blocks...');

    // Get channel blocks from discovered blocks
    const channelBlocks = this.discoveredBlocks
      .filter(b => b.type === 'channel')
      .sort((a, b) => a.metadata - b.metadata);

    if (channelBlocks.length === 0) {
      throw new Error('No channel blocks found');
    }

    // Find the first channel block (metadata 0x12)
    const firstChannelBlock = channelBlocks.find(b => b.metadata === METADATA.CHANNEL_FIRST);
    if (!firstChannelBlock) {
      throw new Error(`First channel block (metadata 0x${METADATA.CHANNEL_FIRST.toString(16)}) not found`);
    }

    // Get channel count from cached block data
    const firstBlockData = this.getCachedBlockByAddress(firstChannelBlock.address);
    if (!firstBlockData) {
      throw new Error(`First channel block data not found in cache`);
    }

    // Read channel count from first 4 bytes
    const channelCount = firstBlockData.data[0] | 
                         (firstBlockData.data[1] << 8) | 
                         (firstBlockData.data[2] << 16) | 
                         (firstBlockData.data[3] << 24);
    console.log(`Channel count: ${channelCount}`);

    // Calculate how many blocks we need based on channel count
    const channelsInFirstBlock = 84;
    let blocksNeeded: number;
    if (channelCount <= channelsInFirstBlock) {
      blocksNeeded = 1;
    } else {
      const remainingChannels = channelCount - channelsInFirstBlock;
      const additionalBlocks = Math.ceil(remainingChannels / 85);
      blocksNeeded = 1 + additionalBlocks + 1; // +1 for safety
    }
    blocksNeeded = Math.min(blocksNeeded, channelBlocks.length);
    
    // Select only the blocks we need (in metadata order: 0x12, 0x13, 0x14, ...)
    const blocksToParse = channelBlocks.slice(0, blocksNeeded);
    
    console.log(`Parsing ${blocksToParse.length} cached channel blocks for ${channelCount} channels`);

    // Parse channels - process blocks in metadata order (0x12, 0x13, 0x14, ...)
    // All data comes from cachedBlockData - no radio reads here
    const channels: Channel[] = [];
    const rawChannelData = new Map<number, { data: Uint8Array; blockAddr: number; offset: number }>();
    let channelIndex = 1;
    let currentBlockIndex = 0;

    for (const block of blocksToParse) {
      // Get block data from cache
      const cachedBlock = this.getCachedBlockByAddress(block.address);
      if (!cachedBlock) {
        console.warn(`No cached data for block with metadata 0x${block.metadata.toString(16)} at 0x${block.address.toString(16)}`);
        continue;
      }
      const blockDataBytes = cachedBlock.data;

      const isFirstBlock = block.metadata === METADATA.CHANNEL_FIRST;
      const startOffset = isFirstBlock ? OFFSET.FIRST_CHANNEL : 0x00;
      
      // First block has 84 channels (not 85) due to the 16-byte header
      // Last channel in first block is at: 0x10 + 83*48 = 0xFA0 (4000)
      // Subsequent blocks have 85 channels each
      const maxOffset = isFirstBlock 
        ? OFFSET.FIRST_CHANNEL + 83 * BLOCK_SIZE.CHANNEL  // First block: 84 channels
        : blockDataBytes.length - BLOCK_SIZE.CHANNEL;     // Other blocks: 85 channels
      
      console.log(`Processing block metadata 0x${block.metadata.toString(16)} at 0x${block.address.toString(16)}, isFirst: ${isFirstBlock}, startOffset: 0x${startOffset.toString(16)}, maxOffset: 0x${maxOffset.toString(16)}`);

      for (let offset = startOffset; offset <= maxOffset; offset += BLOCK_SIZE.CHANNEL) {
        // Stop if we've reached the channel count
        if (channelIndex > channelCount) {
          console.log(`Reached channel count limit (${channelCount}), stopping`);
          break;
        }

        try {
          const channelData = blockDataBytes.slice(offset, offset + BLOCK_SIZE.CHANNEL);
          if (channelData.length < BLOCK_SIZE.CHANNEL) {
            console.warn(`Incomplete channel data at block 0x${block.address.toString(16)} offset 0x${offset.toString(16)}`);
            break;
          }
          
          // Check if channel is empty (all 0xFF or all 0x00)
          const isEmpty = channelData.every(b => b === 0xFF || b === 0x00);
          if (isEmpty) {
            console.log(`Skipping empty channel ${channelIndex}`);
            channelIndex++;
            continue;
          }

          // Store raw data for debug export
          rawChannelData.set(channelIndex, {
            data: new Uint8Array(channelData),
            blockAddr: block.address,
            offset: offset,
          });

          // Pass block data, offset, and block index for correct forbid TX parsing
          const channel = parseChannel(channelData, channelIndex, blockDataBytes, offset, currentBlockIndex);
          channels.push(channel);
          channelIndex++;

          // Update progress more frequently (every 10 channels instead of 50)
          if (channelIndex % 10 === 0 || channelIndex === channelCount) {
            const parseProgress = 10 + ((channelIndex / channelCount) * 90); // 10-100%
            this.onProgress?.(parseProgress, `Parsed ${channelIndex} of ${channelCount} channels...`);
          }
        } catch (error) {
          console.error(`Error parsing channel ${channelIndex} at block 0x${block.address.toString(16)} offset 0x${offset.toString(16)}:`, error);
          // Continue with next channel
          channelIndex++;
        }
      }
      
      // Stop processing blocks if we've reached the channel count
      if (channelIndex > channelCount) {
        break;
      }
      
      currentBlockIndex++;
    }

    console.log(`Successfully parsed ${channels.length} channels (expected ${channelCount})`);
    this.onProgress?.(100, `Successfully read ${channels.length} channels`);
    
    // Store raw data in a property for retrieval
    this.rawChannelData = rawChannelData;
    
    return channels;
  }

  /**
   * Write channels to the radio
   * 
   * Encodes channels to binary format and writes them to the appropriate memory blocks.
   * Updates the channel count in the first block header.
   * 
   * @param channels Array of channels to write
   * @throws {Error} If not connected
   * @throws {Error} If channel count exceeds maximum (4000)
   */
  async writeChannels(channels: Channel[]): Promise<void> {
    requireConnection(this.connection, this.radioInfo);
    
    if (channels.length === 0) {
      throw new Error('No channels to write');
    }
    
    if (channels.length > 4000) {
      throw new Error(`Too many channels: ${channels.length} (maximum 4000)`);
    }

    this.onProgress?.(0, 'Preparing to write channels...');

    // Discover blocks if not already discovered
    if (this.discoveredBlocks.length === 0) {
      this.onProgress?.(5, 'Discovering channel blocks...');
      const blocks = await discoverMemoryBlocks(
        this.connection!,
        this.radioInfo!.memoryLayout.configStart,
        this.radioInfo!.memoryLayout.configEnd,
        (current, total) => {
          const progress = 5 + Math.floor((current / total) * 5); // 5-10%
          this.onProgress?.(progress, `Reading metadata ${current} of ${total}...`);
        }
      );
      this.discoveredBlocks = blocks;
    }

    // Get channel blocks, sorted by metadata
    const channelBlocks = this.discoveredBlocks
      .filter(b => b.type === 'channel')
      .sort((a, b) => a.metadata - b.metadata);

    if (channelBlocks.length === 0) {
      throw new Error('No channel blocks found');
    }

    // Find first channel block (metadata 0x12)
    const firstChannelBlock = channelBlocks.find(b => b.metadata === METADATA.CHANNEL_FIRST);
    if (!firstChannelBlock) {
      throw new Error(`First channel block (metadata 0x${METADATA.CHANNEL_FIRST.toString(16)}) not found`);
    }

    this.onProgress?.(10, `Writing ${channels.length} channels to ${channelBlocks.length} blocks...`);

    // Encode all channels to binary
    const encodedChannels = channels.map(ch => encodeChannel(ch));
    
    // Write channels to blocks
    let channelIndex = 0;
    for (let blockIdx = 0; blockIdx < channelBlocks.length && channelIndex < channels.length; blockIdx++) {
      const block = channelBlocks[blockIdx];
      const isFirstBlock = block.metadata === METADATA.CHANNEL_FIRST;
      
      // Read existing block data
      const existingBlockData = await this.connection!.readMemory(block.address, BLOCK_SIZE.STANDARD);
      const blockData = new Uint8Array(existingBlockData);
      
      // Update channel count in first block header (bytes 0-3)
      if (isFirstBlock) {
        const channelCountBytes = new Uint8Array(4);
        channelCountBytes[0] = channels.length & 0xFF;
        channelCountBytes[1] = (channels.length >> 8) & 0xFF;
        channelCountBytes[2] = (channels.length >> 16) & 0xFF;
        channelCountBytes[3] = (channels.length >> 24) & 0xFF;
        blockData.set(channelCountBytes, 0);
      }
      
      // Determine start offset and max channels for this block
      const startOffset = isFirstBlock ? OFFSET.FIRST_CHANNEL : 0x00;
      const maxChannelsInBlock = isFirstBlock ? 84 : 85;
      const maxOffset = startOffset + (maxChannelsInBlock * BLOCK_SIZE.CHANNEL);
      
      // Write channels to this block
      for (let offset = startOffset; offset < maxOffset && channelIndex < channels.length; offset += BLOCK_SIZE.CHANNEL) {
        const channel = channels[channelIndex];
        blockData.set(encodedChannels[channelIndex], offset);
        
        // Write forbid TX flag to the correct offset (not in the 48-byte channel data)
        writeChannelFlagBit(channel.number, blockData, offset, blockIdx, 0x08, channel.forbidTx);
        
        channelIndex++;
        
        // Update progress
        const progress = 10 + Math.floor((channelIndex / channels.length) * 80); // 10-90%
        if (channelIndex % 10 === 0 || channelIndex === channels.length) {
          this.onProgress?.(progress, `Encoded ${channelIndex} of ${channels.length} channels...`);
        }
      }
      
      // Write the block back to radio
      const progress = 90 + Math.floor((blockIdx / channelBlocks.length) * 10); // 90-100%
      this.onProgress?.(progress, `Writing block ${blockIdx + 1} of ${channelBlocks.length}...`);
      
      await this.connection!.writeMemory(block.address, blockData, block.metadata);
      
      // Delay between block writes (per spec: 10-50ms)
      if (blockIdx < channelBlocks.length - 1) {
        await new Promise(resolve => setTimeout(resolve, CONNECTION.BLOCK_READ_DELAY));
      }
      
      // Stop if we've written all channels
      if (channelIndex >= channels.length) {
        break;
      }
    }

    this.onProgress?.(100, `Successfully wrote ${channels.length} channels`);
    console.log(`Successfully wrote ${channels.length} channels to radio`);
  }

  /**
   * Parse zones from cached blocks
   * Blocks must be read first via bulkReadRequiredBlocks()
   * This method ONLY parses - it does NOT read from the radio
   * Connection is not required - data comes from cache
   */
  async readZones(): Promise<Zone[]> {
    requireRadioInfo(this.radioInfo);
    
    // Ensure blocks have been read
    if (this.cachedBlockData.length === 0 || this.discoveredBlocks.length === 0) {
      throw new Error('Blocks must be read first. Call bulkReadRequiredBlocks() before processing.');
    }

    this.onProgress?.(0, 'Parsing zones from cached blocks...');

    // Zone metadata identified from debug export: 0x5c
    const zoneBlocks = this.discoveredBlocks.filter(b => b.metadata === METADATA.ZONE);
    console.log(`Found ${zoneBlocks.length} zone blocks (metadata 0x${METADATA.ZONE.toString(16)})`);

    if (checkEmptyBlocks(zoneBlocks, 'zone', this.onProgress)) {
      return [];
    }

    // Concatenate cached zone blocks
    const allZoneData = this.concatenateCachedBlocks(zoneBlocks);

    this.onProgress?.(50, 'Parsing zone data...');
    const zones = parseZones(allZoneData, (zoneNum, rawData, name) => {
      // Store raw zone data for debug export
      storeRawData(
        this.rawZoneData,
        name,
        rawData,
        { zoneNum },
        OFFSET.ZONE_START + (zoneNum - 1) * BLOCK_SIZE.ZONE
      );
    });

    console.log(`Successfully parsed ${zones.length} zones`);
    this.onProgress?.(100, `Successfully read ${zones.length} zones`);
    return zones;
  }

  /**
   * Write zones to the radio
   * 
   * Encodes zones to binary format and writes them to the appropriate memory blocks.
   * 
   * @param zones Array of zones to write
   * @throws {Error} If not connected
   */
  async writeZones(zones: Zone[]): Promise<void> {
    requireConnection(this.connection, this.radioInfo);
    
    if (zones.length === 0) {
      throw new Error('No zones to write');
    }

    this.onProgress?.(0, 'Preparing to write zones...');

    // Discover blocks if not already discovered
    if (this.discoveredBlocks.length === 0) {
      this.onProgress?.(5, 'Discovering zone blocks...');
      const blocks = await discoverMemoryBlocks(
        this.connection!,
        this.radioInfo!.memoryLayout.configStart,
        this.radioInfo!.memoryLayout.configEnd,
        (current, total) => {
          const progress = 5 + Math.floor((current / total) * 5); // 5-10%
          this.onProgress?.(progress, `Reading metadata ${current} of ${total}...`);
        }
      );
      this.discoveredBlocks = blocks;
    }

    // Get zone blocks (metadata 0x5c)
    const zoneBlocks = this.discoveredBlocks.filter(b => b.metadata === METADATA.ZONE);

    if (zoneBlocks.length === 0) {
      throw new Error('No zone blocks found');
    }

    this.onProgress?.(10, `Writing ${zones.length} zones to ${zoneBlocks.length} block(s)...`);

    // Read all zone blocks and concatenate
    const allZoneData = await readAndConcatenateBlocks(
      this.connection!,
      zoneBlocks,
      this.onProgress
    );

    // Encode zones
    const encodedZones = zones.map((zone, idx) => encodeZone(zone, idx + 1));
    
    // Write zones to the concatenated data
    // Zones are 145 bytes each, starting at offset 16
    for (let i = 0; i < encodedZones.length; i++) {
      const zoneOffset = OFFSET.ZONE_START + (i * BLOCK_SIZE.ZONE);
      
      if (zoneOffset + BLOCK_SIZE.ZONE > allZoneData.length) {
        throw new Error(`Zone ${i + 1} would exceed block size`);
      }
      
      allZoneData.set(encodedZones[i], zoneOffset);
      
      const progress = 50 + Math.floor((i / zones.length) * 40); // 50-90%
      if (i % 5 === 0 || i === zones.length - 1) {
        this.onProgress?.(progress, `Encoded ${i + 1} of ${zones.length} zones...`);
      }
    }

    // Write blocks back to radio
    // We need to split the concatenated data back into blocks
    let dataOffset = 0;
    for (let blockIdx = 0; blockIdx < zoneBlocks.length; blockIdx++) {
      const block = zoneBlocks[blockIdx];
      const blockData = allZoneData.slice(dataOffset, dataOffset + BLOCK_SIZE.STANDARD);
      
      const progress = 90 + Math.floor((blockIdx / zoneBlocks.length) * 10); // 90-100%
      this.onProgress?.(progress, `Writing zone block ${blockIdx + 1} of ${zoneBlocks.length}...`);
      
      await this.connection!.writeMemory(block.address, blockData, block.metadata);
      
      dataOffset += BLOCK_SIZE.STANDARD;
      
      // Delay between block writes
      if (blockIdx < zoneBlocks.length - 1) {
        await new Promise(resolve => setTimeout(resolve, CONNECTION.BLOCK_READ_DELAY));
      }
    }

    this.onProgress?.(100, `Successfully wrote ${zones.length} zones`);
    console.log(`Successfully wrote ${zones.length} zones to radio`);
  }

  /**
   * Parse scan lists from cached blocks
   * Blocks must be read first via bulkReadRequiredBlocks()
   * This method ONLY parses - it does NOT read from the radio
   * Connection is not required - data comes from cache
   */
  async readScanLists(): Promise<ScanList[]> {
    requireRadioInfo(this.radioInfo);
    
    // Ensure blocks have been read
    if (this.cachedBlockData.length === 0 || this.discoveredBlocks.length === 0) {
      throw new Error('Blocks must be read first. Call bulkReadRequiredBlocks() before processing.');
    }

    this.onProgress?.(0, 'Parsing scan lists from cached blocks...');

    const scanBlocks = this.discoveredBlocks.filter(b => b.type === 'scan' && b.metadata === METADATA.SCAN_LIST);
    console.log(`Found ${scanBlocks.length} scan list blocks (metadata 0x${METADATA.SCAN_LIST.toString(16)})`);

    if (checkEmptyBlocks(scanBlocks, 'scan list', this.onProgress)) {
      return [];
    }

    // Concatenate cached scan list blocks
    const allScanListData = this.concatenateCachedBlocks(scanBlocks);
    
    // Store block data for debug export
    for (const block of scanBlocks) {
      const cachedBlock = this.getCachedBlockByAddress(block.address);
      if (cachedBlock) {
        this.blockData.set(block.address, cachedBlock.data);
      }
    }

    this.onProgress?.(50, 'Parsing scan list data...');
    console.log(`Parsing scan list data, total size: ${allScanListData.length} bytes`);
    const scanLists = parseScanLists(allScanListData, (listNum, rawData, name) => {
      // Store raw scan list data for debug export
      const offset = listNum <= 44 
        ? OFFSET.SCAN_LIST_START + (listNum - 1) * BLOCK_SIZE.SCAN_LIST 
        : (listNum - 45) * BLOCK_SIZE.SCAN_LIST;
      storeRawData(this.rawScanListData, name, rawData, { listNum }, offset);
      console.log(`Parsed scan list ${listNum}: "${name}" with ${rawData.length >= 25 ? 'channels' : 'no channels'}`);
    });

    console.log(`Successfully parsed ${scanLists.length} scan lists:`, scanLists.map(sl => sl.name));
    this.onProgress?.(100, `Successfully read ${scanLists.length} scan lists`);
    return scanLists;
  }

  async writeScanLists(scanLists: ScanList[]): Promise<void> {
    requireConnection(this.connection, this.radioInfo);
    
    if (scanLists.length === 0) {
      throw new Error('No scan lists to write');
    }

    this.onProgress?.(0, 'Preparing to write scan lists...');

    // Discover blocks if not already discovered
    if (this.discoveredBlocks.length === 0) {
      this.onProgress?.(5, 'Discovering scan list blocks...');
      const blocks = await discoverMemoryBlocks(
        this.connection!,
        this.radioInfo!.memoryLayout.configStart,
        this.radioInfo!.memoryLayout.configEnd,
        (current, total) => {
          const progress = 5 + Math.floor((current / total) * 5); // 5-10%
          this.onProgress?.(progress, `Reading metadata ${current} of ${total}...`);
        }
      );
      this.discoveredBlocks = blocks;
    }

    // Get scan list blocks (metadata 0x5d)
    const scanBlocks = this.discoveredBlocks.filter(b => b.type === 'scan' && b.metadata === METADATA.SCAN_LIST);

    if (scanBlocks.length === 0) {
      throw new Error('No scan list blocks found');
    }

    this.onProgress?.(10, `Writing ${scanLists.length} scan lists to ${scanBlocks.length} block(s)...`);

    // Read all scan list blocks and concatenate
    const allScanListData = await readAndConcatenateBlocks(
      this.connection!,
      scanBlocks,
      this.onProgress
    );

    // Encode scan lists
    const encodedScanLists = scanLists.map((scanList, idx) => encodeScanList(scanList, idx + 1));
    
    // Write scan lists to the concatenated data
    // Scan lists are 92 bytes each, starting at offset 16 for first 44 lists
    for (let i = 0; i < encodedScanLists.length; i++) {
      let scanListOffset: number;
      if (i < 44) {
        // Lists 1-44: offset 16 + (i * 92)
        scanListOffset = OFFSET.SCAN_LIST_START + (i * BLOCK_SIZE.SCAN_LIST);
      } else {
        // Lists 45+: offset 0 in subsequent blocks
        const blockIndex = Math.floor((i - 44) / 44); // Which block (0-indexed from first scan block)
        const listIndexInBlock = (i - 44) % 44;
        scanListOffset = (blockIndex * BLOCK_SIZE.STANDARD) + (listIndexInBlock * BLOCK_SIZE.SCAN_LIST);
      }
      
      if (scanListOffset + BLOCK_SIZE.SCAN_LIST > allScanListData.length) {
        throw new Error(`Scan list ${i + 1} would exceed block size`);
      }
      
      allScanListData.set(encodedScanLists[i], scanListOffset);
      
      const progress = 50 + Math.floor((i / scanLists.length) * 40); // 50-90%
      if (i % 5 === 0 || i === scanLists.length - 1) {
        this.onProgress?.(progress, `Encoded ${i + 1} of ${scanLists.length} scan lists...`);
      }
    }

    // Write blocks back to radio
    // We need to split the concatenated data back into blocks
    let dataOffset = 0;
    for (let blockIdx = 0; blockIdx < scanBlocks.length; blockIdx++) {
      const block = scanBlocks[blockIdx];
      const blockData = allScanListData.slice(dataOffset, dataOffset + BLOCK_SIZE.STANDARD);
      
      const progress = 90 + Math.floor((blockIdx / scanBlocks.length) * 10); // 90-100%
      this.onProgress?.(progress, `Writing scan list block ${blockIdx + 1} of ${scanBlocks.length}...`);
      
      await this.connection!.writeMemory(block.address, blockData, block.metadata);
      
      dataOffset += BLOCK_SIZE.STANDARD;
      
      // Delay between block writes
      if (blockIdx < scanBlocks.length - 1) {
        await new Promise(resolve => setTimeout(resolve, CONNECTION.BLOCK_READ_DELAY));
      }
    }

    this.onProgress?.(100, `Successfully wrote ${scanLists.length} scan lists`);
    console.log(`Successfully wrote ${scanLists.length} scan lists to radio`);
  }

  /**
   * Read contacts from the radio
   * 
   * Uses V-frame 0x0F to get the contacts memory range, then discovers
   * contact blocks and parses them.
   * 
   * @returns Array of contacts
   * @throws {Error} If not connected
   */
  async readContacts(): Promise<Contact[]> {
    requireConnection(this.connection, this.radioInfo);
    
    this.onProgress?.(0, 'Reading contacts...');
    
    // Get contacts memory range from V-frame 0x0F
    const contactsVFrame = this.radioInfo!.vframes.get(VFRAME.CONTACTS);
    if (!contactsVFrame || contactsVFrame.length < 8) {
      console.warn('V-frame 0x0F (contacts) not available, trying to discover contacts in config range');
      // Fall back to discovering in config range
      return this.readContactsFromConfigRange();
    }
    
    // Parse memory range (8 bytes: start_addr (4 bytes LE) + end_addr (4 bytes LE))
    const startAddr = this.readUint32LE(contactsVFrame, 0);
    const endAddr = this.readUint32LE(contactsVFrame, 4);
    
    console.log(`Contacts memory range: 0x${startAddr.toString(16)} - 0x${endAddr.toString(16)}`);
    
    if (startAddr === 0 && endAddr === 0) {
      console.warn('Contacts range is 0x00000000-0x00000000, contacts may be disabled');
      return [];
    }
    
    // Discover contact blocks in this range
    this.onProgress?.(10, 'Discovering contact blocks...');
    const blocks = await discoverMemoryBlocks(
      this.connection!,
      startAddr,
      endAddr,
      (current, total) => {
        const progress = 10 + Math.floor((current / total) * 10); // 10-20%
        this.onProgress?.(progress, `Reading metadata ${current} of ${total}...`);
      }
    );
    
    // Filter for contact blocks (we need to discover the metadata value)
    // For now, look for non-empty blocks that aren't channels, zones, or scan lists
    const contactBlocks = blocks.filter(b => 
      b.type !== 'empty' && 
      b.type !== 'channel' && 
      b.type !== 'zone' && 
      b.type !== 'scan' &&
      b.metadata !== METADATA.EMPTY &&
      b.metadata !== METADATA.EMPTY_ALT
    );
    
    console.log(`Found ${contactBlocks.length} potential contact blocks`);
    
    if (contactBlocks.length === 0) {
      console.warn('No contact blocks found');
      return [];
    }
    
    // Read all contact blocks
    this.onProgress?.(20, `Reading ${contactBlocks.length} contact block(s)...`);
    const allContactData = await readAndConcatenateBlocks(
      this.connection!,
      contactBlocks,
      this.onProgress,
      undefined
    );
    
    // Parse contacts
    this.onProgress?.(80, 'Parsing contacts...');
    const contacts = parseContacts(allContactData);
    
    console.log(`Successfully parsed ${contacts.length} contacts`);
    this.onProgress?.(100, `Successfully read ${contacts.length} contacts`);
    
    return contacts;
  }
  
  /**
   * Fallback: Try to discover contacts in the main config range
   * This is used when V-frame 0x0F is not available
   */
  private async readContactsFromConfigRange(): Promise<Contact[]> {
    this.onProgress?.(10, 'Discovering contacts in config range...');
    
    // Use discovered blocks if available, otherwise discover
    if (this.discoveredBlocks.length === 0) {
      const blocks = await discoverMemoryBlocks(
        this.connection!,
        this.radioInfo!.memoryLayout.configStart,
        this.radioInfo!.memoryLayout.configEnd,
        (current, total) => {
          const progress = 10 + Math.floor((current / total) * 5); // 10-15%
          this.onProgress?.(progress, `Reading metadata ${current} of ${total}...`);
        }
      );
      this.discoveredBlocks = blocks;
    }
    
    // Look for unknown blocks that might be contacts
    const potentialContactBlocks = this.discoveredBlocks.filter(b => 
      b.type === 'unknown' &&
      b.metadata !== METADATA.EMPTY &&
      b.metadata !== METADATA.EMPTY_ALT
    );
    
    if (potentialContactBlocks.length === 0) {
      console.warn('No potential contact blocks found in config range');
      return [];
    }
    
    console.log(`Found ${potentialContactBlocks.length} potential contact blocks in config range`);
    
    // Read and parse
    const allContactData = await readAndConcatenateBlocks(
      this.connection!,
      potentialContactBlocks,
      this.onProgress,
      undefined
    );
    
    this.onProgress?.(80, 'Parsing contacts...');
    const contacts = parseContacts(allContactData);
    
    console.log(`Successfully parsed ${contacts.length} contacts from config range`);
    this.onProgress?.(100, `Successfully read ${contacts.length} contacts`);
    
    return contacts;
  }

  async writeContacts(_contacts: Contact[]): Promise<void> {
    // TODO: Implement contact writing
    throw new Error('Contact writing not yet implemented');
  }

  /**
   * Parse quick messages from cached blocks
   * Blocks must be read first via bulkReadRequiredBlocks()
   * This method ONLY parses - it does NOT read from the radio
   * Connection is not required - data comes from cache
   */
  async readQuickMessages(): Promise<QuickTextMessage[]> {
    requireRadioInfo(this.radioInfo);

    // Ensure blocks have been read
    if (this.cachedBlockData.length === 0 || this.discoveredBlocks.length === 0) {
      throw new Error('Blocks must be read first. Call bulkReadRequiredBlocks() before processing.');
    }

    this.onProgress?.(0, 'Parsing quick messages from cached blocks...');

    const messageBlocks = this.discoveredBlocks.filter(b => b.type === 'message');
    if (messageBlocks.length === 0) {
      console.log('No quick message blocks found');
      return [];
    }

    this.rawMessageData.clear();
    const messages: QuickTextMessage[] = [];

    for (let i = 0; i < messageBlocks.length; i++) {
      const block = messageBlocks[i];
      this.onProgress?.(Math.floor((i / messageBlocks.length) * 100), `Processing message block ${i + 1} of ${messageBlocks.length}...`);

      const cachedBlock = this.getCachedBlockByAddress(block.address);
      if (!cachedBlock) {
        console.warn(`Message block at 0x${block.address.toString(16)} not found in cache`);
        continue;
      }
      
      const parsedMessages = parseQuickMessages(cachedBlock.data, (messageIndex, rawData) => {
        this.rawMessageData.set(messageIndex, {
          data: new Uint8Array(rawData),
          messageIndex,
          offset: OFFSET.QUICK_MESSAGE_BASE * (messageIndex + 1),
        });
      });

      messages.push(...parsedMessages);
    }

    this.onProgress?.(100, `Successfully processed ${messages.length} quick messages`);
    return messages;
  }

  /**
   * Parse DMR Radio IDs from cached blocks
   * Blocks must be read first via bulkReadRequiredBlocks()
   * This method ONLY parses - it does NOT read from the radio
   * Connection is not required - data comes from cache
   */
  async readDMRRadioIDs(): Promise<DMRRadioID[]> {
    requireRadioInfo(this.radioInfo);

    // Ensure blocks have been read
    if (this.cachedBlockData.length === 0 || this.discoveredBlocks.length === 0) {
      throw new Error('Blocks must be read first. Call bulkReadRequiredBlocks() before processing.');
    }

    this.onProgress?.(0, 'Parsing DMR Radio IDs from cached blocks...');

    const radioIdBlocks = this.discoveredBlocks.filter(b => b.type === 'dmrradioid');
    if (radioIdBlocks.length === 0) {
      // DMR Radio IDs are optional - return empty array if not found
      console.log('No DMR Radio ID blocks found');
      return [];
    }

    this.rawDMRRadioIDData.clear();
    const radioIds: DMRRadioID[] = [];

    for (let i = 0; i < radioIdBlocks.length; i++) {
      const block = radioIdBlocks[i];
      this.onProgress?.(Math.floor((i / radioIdBlocks.length) * 100), `Processing DMR Radio ID block ${i + 1} of ${radioIdBlocks.length}...`);

      const cachedBlock = this.getCachedBlockByAddress(block.address);
      if (!cachedBlock) {
        console.warn(`DMR Radio ID block at 0x${block.address.toString(16)} not found in cache`);
        continue;
      }
      
      const parsedIds = parseDMRRadioIDs(cachedBlock.data, (idIndex, rawData, _name) => {
        this.rawDMRRadioIDData.set(idIndex, {
          data: new Uint8Array(rawData),
          idIndex,
          offset: OFFSET.DMR_RADIO_ID_BASE + (idIndex * BLOCK_SIZE.DMR_RADIO_ID),
        });
      });

      radioIds.push(...parsedIds);
    }

    this.onProgress?.(100, `Successfully processed ${radioIds.length} DMR Radio IDs`);
    return radioIds;
  }

  /**
   * Parse calibration data from cached blocks
   * Blocks must be read first via bulkReadRequiredBlocks()
   * This method ONLY parses - it does NOT read from the radio
   * Connection is not required - data comes from cache
   */
  async readCalibration(): Promise<Calibration | null> {
    requireRadioInfo(this.radioInfo);

    // Ensure blocks have been read
    if (this.cachedBlockData.length === 0 || this.discoveredBlocks.length === 0) {
      throw new Error('Blocks must be read first. Call bulkReadRequiredBlocks() before processing.');
    }

    this.onProgress?.(0, 'Parsing calibration data from cached blocks...');

    const calibrationBlocks = this.discoveredBlocks.filter(b => b.type === 'calibration');
    if (calibrationBlocks.length === 0) {
      // Calibration is optional - return null if not found
      console.log('No calibration blocks found');
      return null;
    }

    // Use the first calibration block
    const block = calibrationBlocks[0];
    const cachedBlock = this.getCachedBlockByAddress(block.address);
    if (!cachedBlock) {
      console.warn(`Calibration block at 0x${block.address.toString(16)} not found in cache`);
      return null;
    }

    const calibrationData = parseCalibration(cachedBlock.data);

    this.onProgress?.(100, 'Successfully processed calibration data');
    
    return {
      blockAddress: block.address,
      data: calibrationData,
    };
  }

  /**
   * Parse DMR RX Groups from cached blocks
   * Blocks must be read first via bulkReadRequiredBlocks()
   * This method ONLY parses - it does NOT read from the radio
   * Connection is not required - data comes from cache
   */
  async readRXGroups(): Promise<RXGroup[]> {
    requireRadioInfo(this.radioInfo);

    // Ensure blocks have been read
    if (this.cachedBlockData.length === 0 || this.discoveredBlocks.length === 0) {
      throw new Error('Blocks must be read first. Call bulkReadRequiredBlocks() before processing.');
    }

    this.onProgress?.(0, 'Parsing DMR RX Groups from cached blocks...');

    const rxGroupBlocks = this.discoveredBlocks.filter(b => b.type === 'rxgroup');
    if (rxGroupBlocks.length === 0) {
      // DMR RX Groups are optional - return empty array if not found
      console.log('No DMR RX group blocks found');
      return [];
    }

    this.rawRXGroupData.clear();
    const groups: RXGroup[] = [];

    for (let i = 0; i < rxGroupBlocks.length; i++) {
      const block = rxGroupBlocks[i];
      this.onProgress?.(Math.floor((i / rxGroupBlocks.length) * 100), `Processing DMR RX group block ${i + 1} of ${rxGroupBlocks.length}...`);

      const cachedBlock = this.getCachedBlockByAddress(block.address);
      if (!cachedBlock) {
        console.warn(`RX Group block at 0x${block.address.toString(16)} not found in cache`);
        continue;
      }
      
      const parsedGroups = parseRXGroups(cachedBlock.data, (groupIndex, rawData, _name) => {
        this.rawRXGroupData.set(groupIndex, {
          data: new Uint8Array(rawData),
          groupIndex,
          offset: groupIndex * BLOCK_SIZE.RX_GROUP,
        });
      });

      groups.push(...parsedGroups);
    }

    this.onProgress?.(100, `Successfully processed ${groups.length} DMR RX groups`);
    return groups;
  }

  /**
   * Parse Radio Settings from cached blocks
   * Blocks must be read first via bulkReadRequiredBlocks()
   * This method ONLY parses - it does NOT read from the radio
   * Connection is not required - data comes from cache
   * Returns null if block doesn't exist (some radios may not have this block)
   */
  async readRadioSettings(): Promise<RadioSettings | null> {
    requireRadioInfo(this.radioInfo);
    
    // Ensure blocks have been read
    if (this.cachedBlockData.length === 0 || this.discoveredBlocks.length === 0) {
      throw new Error('Blocks must be read first. Call bulkReadRequiredBlocks() before processing.');
    }

    // Find radio settings block (metadata 0x04)
    const radioSettingsBlock = this.discoveredBlocks.find(b => b.metadata === METADATA.VFO_SETTINGS);

    if (!radioSettingsBlock) {
      // Block doesn't exist - this is OK, some radios may not have it
      console.log('Radio Settings block (metadata 0x04) not found - radio may not support this feature');
      return null;
    }

    this.onProgress?.(0, 'Parsing Radio Settings from cached blocks...');

    try {
      const cachedBlock = this.getCachedBlockByAddress(radioSettingsBlock.address);
      if (!cachedBlock) {
        console.warn('Radio Settings block not found in cache');
        return null;
      }

      this.rawRadioSettingsData = cachedBlock.data;
      
      // Store in blockData map for debug export
      this.blockData.set(radioSettingsBlock.address, cachedBlock.data);

      this.onProgress?.(100, 'Radio Settings processed');
      return parseRadioSettings(cachedBlock.data);
    } catch (err) {
      // If parsing fails, don't crash - just return null
      console.warn('Failed to parse Radio Settings block:', err);
      return null;
    }
  }

  /**
   * Write Radio Settings to metadata 0x04 block
   */
  async writeRadioSettings(settings: RadioSettings): Promise<void> {
    requireConnection(this.connection, this.radioInfo);
    
    // Discover blocks if not already discovered
    if (this.discoveredBlocks.length === 0) {
      if (!this.radioInfo) {
        throw new Error('Radio info not available. Connect and read radio info first.');
      }
      const blocks = await discoverMemoryBlocks(
        this.connection!,
        this.radioInfo.memoryLayout.configStart,
        this.radioInfo.memoryLayout.configEnd,
        (current, total) => {
          // Convert to our progress format
          const progress = Math.floor((current / total) * 100);
          this.onProgress?.(progress, `Discovering blocks ${current}/${total}...`);
        }
      );
      this.discoveredBlocks = blocks;
    }
    
    requireDiscoveredBlocks(this.discoveredBlocks);

    // Find radio settings block (metadata 0x04)
    const radioSettingsBlock = this.discoveredBlocks.find(b => b.metadata === METADATA.VFO_SETTINGS);

    if (!radioSettingsBlock) {
      throw new Error('Radio Settings block (metadata 0x04) not found');
    }

    this.onProgress?.(0, 'Writing Radio Settings...');

    // Encode settings to 4KB block
    const blockData = encodeRadioSettings(settings);

    // Write the entire block (writeMemory takes address, data, and metadata)
    await this.connection!.writeMemory(radioSettingsBlock.address, blockData, METADATA.VFO_SETTINGS);
    this.rawRadioSettingsData = blockData;

    this.onProgress?.(100, 'Radio Settings written');
  }

  /**
   * Parse Digital Emergency Systems from cached blocks
   * Blocks must be read first via bulkReadRequiredBlocks()
   * This method ONLY parses - it does NOT read from the radio
   * Connection is not required - data comes from cache
   */
  async readDigitalEmergencies(): Promise<{ systems: DigitalEmergency[]; config: DigitalEmergencyConfig } | null> {
    requireRadioInfo(this.radioInfo);
    
    // Ensure blocks have been read
    if (this.cachedBlockData.length === 0 || this.discoveredBlocks.length === 0) {
      throw new Error('Blocks must be read first. Call bulkReadRequiredBlocks() before processing.');
    }

    // Find Digital Emergency Systems block (metadata 0x03)
    const emergencyBlock = this.discoveredBlocks.find(b => b.metadata === METADATA.DIGITAL_EMERGENCY);

    if (!emergencyBlock) {
      console.log('Digital Emergency Systems block (metadata 0x03) not found');
      return null;
    }

    this.onProgress?.(0, 'Parsing Digital Emergency Systems from cached blocks...');

    try {
      const cachedBlock = this.getCachedBlockByAddress(emergencyBlock.address);
      if (!cachedBlock) {
        console.warn('Digital Emergency Systems block not found in cache');
        return null;
      }

      this.rawDigitalEmergencyData = cachedBlock.data;
      
      // Store in blockData map for debug export
      this.blockData.set(emergencyBlock.address, cachedBlock.data);

      this.onProgress?.(100, 'Digital Emergency Systems processed');
      // TODO: Structure parsing needs verification - return empty for now
      // return parseDigitalEmergencies(cachedBlock.data);
      return { systems: [], config: { countIndex: 0, unknown: 0, numericFields: [0, 0, 0], byteFields: [0, 0], values16bit: [0, 0, 0, 0], bitFlags: 0, indexCount: 0, entryArray: [], additionalConfig: new Uint8Array(192) } };
    } catch (err) {
      console.warn('Failed to process Digital Emergency Systems block:', err);
      return null;
    }
  }

  /**
   * Write Digital Emergency Systems to metadata 0x03 block
   */
  async writeDigitalEmergencies(systems: DigitalEmergency[], config: DigitalEmergencyConfig): Promise<void> {
    requireConnection(this.connection, this.radioInfo);
    
    // Discover blocks if not already discovered
    if (this.discoveredBlocks.length === 0) {
      if (!this.radioInfo) {
        throw new Error('Radio info not available. Connect and read radio info first.');
      }
      const blocks = await discoverMemoryBlocks(
        this.connection!,
        this.radioInfo.memoryLayout.configStart,
        this.radioInfo.memoryLayout.configEnd,
        (current, total) => {
          const progress = Math.floor((current / total) * 100);
          this.onProgress?.(progress, `Discovering blocks ${current}/${total}...`);
        }
      );
      this.discoveredBlocks = blocks;
    }
    
    requireDiscoveredBlocks(this.discoveredBlocks);

    // Find Digital Emergency Systems block (metadata 0x03)
    const emergencyBlock = this.discoveredBlocks.find(b => b.metadata === METADATA.DIGITAL_EMERGENCY);

    if (!emergencyBlock) {
      throw new Error('Digital Emergency Systems block (metadata 0x03) not found');
    }

    this.onProgress?.(0, 'Writing Digital Emergency Systems...');

    // Encode systems to 4KB block
    const blockData = encodeDigitalEmergencies(systems, config);

    // Write the entire block
    await this.connection!.writeMemory(emergencyBlock.address, blockData, METADATA.DIGITAL_EMERGENCY);
    this.rawDigitalEmergencyData = blockData;
    this.blockData.set(emergencyBlock.address, blockData);

    this.onProgress?.(100, 'Digital Emergency Systems written');
  }

  /**
   * Parse Analog Emergency Systems from cached blocks
   * Blocks must be read first via bulkReadRequiredBlocks()
   * This method ONLY parses - it does NOT read from the radio
   * Connection is not required - data comes from cache
   */
  async readAnalogEmergencies(): Promise<AnalogEmergency[] | null> {
    requireRadioInfo(this.radioInfo);
    
    // Ensure blocks have been read
    if (this.cachedBlockData.length === 0 || this.discoveredBlocks.length === 0) {
      throw new Error('Blocks must be read first. Call bulkReadRequiredBlocks() before processing.');
    }

    // Find Analog Emergency Systems block (metadata 0x10)
    const emergencyBlock = this.discoveredBlocks.find(b => b.metadata === METADATA.ANALOG_EMERGENCY);

    if (!emergencyBlock) {
      console.log('Analog Emergency Systems block (metadata 0x10) not found');
      return null;
    }

    this.onProgress?.(0, 'Parsing Analog Emergency Systems from cached blocks...');

    try {
      const cachedBlock = this.getCachedBlockByAddress(emergencyBlock.address);
      if (!cachedBlock) {
        console.warn('Analog Emergency Systems block not found in cache');
        return null;
      }

      this.rawAnalogEmergencyData = cachedBlock.data;
      
      // Store in blockData map for debug export
      this.blockData.set(emergencyBlock.address, cachedBlock.data);

      this.onProgress?.(100, 'Analog Emergency Systems processed');
      // TODO: Structure parsing needs verification - return empty for now
      // return parseAnalogEmergencies(cachedBlock.data);
      return [];
    } catch (err) {
      console.warn('Failed to process Analog Emergency Systems block:', err);
      return null;
    }
  }

  /**
   * Write Analog Emergency Systems to metadata 0x10 block
   */
  async writeAnalogEmergencies(systems: AnalogEmergency[]): Promise<void> {
    requireConnection(this.connection, this.radioInfo);
    
    // Discover blocks if not already discovered
    if (this.discoveredBlocks.length === 0) {
      if (!this.radioInfo) {
        throw new Error('Radio info not available. Connect and read radio info first.');
      }
      const blocks = await discoverMemoryBlocks(
        this.connection!,
        this.radioInfo.memoryLayout.configStart,
        this.radioInfo.memoryLayout.configEnd,
        (current, total) => {
          const progress = Math.floor((current / total) * 100);
          this.onProgress?.(progress, `Discovering blocks ${current}/${total}...`);
        }
      );
      this.discoveredBlocks = blocks;
    }
    
    requireDiscoveredBlocks(this.discoveredBlocks);

    // Find Analog Emergency Systems block (metadata 0x10)
    const emergencyBlock = this.discoveredBlocks.find(b => b.metadata === METADATA.ANALOG_EMERGENCY);

    if (!emergencyBlock) {
      throw new Error('Analog Emergency Systems block (metadata 0x10) not found');
    }

    this.onProgress?.(0, 'Writing Analog Emergency Systems...');

    // Encode systems to 4KB block
    const blockData = encodeAnalogEmergencies(systems);

    // Write the entire block
    await this.connection!.writeMemory(emergencyBlock.address, blockData, METADATA.ANALOG_EMERGENCY);
    this.rawAnalogEmergencyData = blockData;
    this.blockData.set(emergencyBlock.address, blockData);

    this.onProgress?.(100, 'Analog Emergency Systems written');
  }

  /**
   * Parse a V-frame as a string value
   * @param vframes Map of V-frame data
   * @param frameId V-frame ID to parse
   * @param defaultValue Default value if frame is missing
   * @returns Decoded string value
   */
  private parseVFrameString(
    vframes: Map<number, Uint8Array>,
    frameId: number,
    defaultValue: string
  ): string {
    const frameData = vframes.get(frameId);
    if (!frameData) {
      return defaultValue;
    }
    return new TextDecoder().decode(frameData).replace(/\0/g, '').trim() || defaultValue;
  }

  /**
   * Read a 32-bit little-endian unsigned integer from a byte array
   * @param data Byte array
   * @param offset Starting offset
   * @returns 32-bit unsigned integer
   */
  private readUint32LE(data: Uint8Array, offset: number): number {
    return (
      data[offset] |
      (data[offset + 1] << 8) |
      (data[offset + 2] << 16) |
      (data[offset + 3] << 24)
    );
  }

  /**
   * Smart write function that uses cached blocks and only replaces changed data blocks
   * Writes channels, zones, and scan lists together
   * 
   * This approach:
   * 1. Uses cached blocks from previous read (cachedBlockData)
   * 2. Only replaces blocks for channels, zones, and scan lists
   * 3. Keeps all other meta blocks as-is from cache
   * 4. Only writes the blocks that have changed
   * 
   * @param channels Channels to write
   * @param zones Zones to write
   * @param scanLists Scan lists to write
   */
  async writeAllData(channels: Channel[], zones: Zone[], scanLists: ScanList[]): Promise<void> {
    requireConnection(this.connection, this.radioInfo);
    
    this.onProgress?.(0, 'Preparing to write data to radio...');

    // Step 1: Ensure we have discovered blocks and cached data
    // If not, we need to read them first
    if (this.discoveredBlocks.length === 0 || this.cachedBlockData.length === 0) {
      this.onProgress?.(5, 'Reading blocks from radio (required for smart write)...');
      
      // Discover blocks
      const blocks = await discoverMemoryBlocks(
        this.connection!,
        this.radioInfo!.memoryLayout.configStart,
        this.radioInfo!.memoryLayout.configEnd,
        (current, total) => {
          const progress = 5 + Math.floor((current / total) * 5); // 5-10%
          this.onProgress?.(progress, `Reading metadata ${current} of ${total}...`);
        }
      );
      this.discoveredBlocks = blocks;
      
      // Read all blocks into cache
      await this.bulkReadRequiredBlocks();
    } else {
      this.onProgress?.(5, 'Using cached blocks for smart write...');
    }

    // Step 2: Generate new block data for channels, zones, and scan lists
    // All other blocks will be used from cache as-is
    this.onProgress?.(10, 'Generating new data blocks for channels, zones, and scan lists...');
    
    // Track which blocks we're replacing (only channels, zones, scan lists)
    const blocksToWrite: Array<{ address: number; data: Uint8Array; metadata: number }> = [];

    // Generate channel blocks
    const channelBlocks = this.discoveredBlocks
      .filter(b => b.type === 'channel')
      .sort((a, b) => a.metadata - b.metadata);

    if (channels.length > 0 && channelBlocks.length === 0) {
      throw new Error('No channel blocks found');
    }

    if (channels.length > 0) {
      if (channels.length > 4000) {
        throw new Error(`Too many channels: ${channels.length} (maximum 4000)`);
      }

      const firstChannelBlock = channelBlocks.find(b => b.metadata === METADATA.CHANNEL_FIRST);
      if (!firstChannelBlock) {
        throw new Error(`First channel block (metadata 0x${METADATA.CHANNEL_FIRST.toString(16)}) not found`);
      }

      // Encode all channels to binary
      const encodedChannels = channels.map(ch => encodeChannel(ch));
      
      // Generate new block data for each channel block
      let channelIndex = 0;
      for (let blockIdx = 0; blockIdx < channelBlocks.length && channelIndex < channels.length; blockIdx++) {
        const block = channelBlocks[blockIdx];
        const isFirstBlock = block.metadata === METADATA.CHANNEL_FIRST;
        
        // Generate new 4KB block filled with 0xFF
        const blockData = new Uint8Array(BLOCK_SIZE.STANDARD);
        blockData.fill(0xFF);
        
        // Set metadata byte at 0xFFF
        blockData[0xFFF] = block.metadata;
        
        // Update channel count in first block header (bytes 0-3)
        if (isFirstBlock) {
          blockData[0] = channels.length & 0xFF;
          blockData[1] = (channels.length >> 8) & 0xFF;
          blockData[2] = (channels.length >> 16) & 0xFF;
          blockData[3] = (channels.length >> 24) & 0xFF;
        }
        
        // Determine start offset and max channels for this block
        const startOffset = isFirstBlock ? OFFSET.FIRST_CHANNEL : 0x00;
        const maxChannelsInBlock = isFirstBlock ? 84 : 85;
        const maxOffset = startOffset + (maxChannelsInBlock * BLOCK_SIZE.CHANNEL);
        
        // Write channels to this block
        for (let offset = startOffset; offset < maxOffset && channelIndex < channels.length; offset += BLOCK_SIZE.CHANNEL) {
          const channel = channels[channelIndex];
          blockData.set(encodedChannels[channelIndex], offset);
          
          // Write forbid TX flag to the correct offset
          writeChannelFlagBit(channel.number, blockData, offset, blockIdx, 0x08, channel.forbidTx);
          
          channelIndex++;
        }
        
        blocksToWrite.push({
          address: block.address,
          data: blockData,
          metadata: block.metadata,
        });
        
        // Update cache with new block data
        const cacheIndex = this.cachedBlockData.findIndex(b => b.address === block.address);
        if (cacheIndex >= 0) {
          this.cachedBlockData[cacheIndex].data = blockData;
        }
        
        // Stop if we've written all channels
        if (channelIndex >= channels.length) {
          break;
        }
      }
    }

    // Generate zone blocks
    const zoneBlocks = this.discoveredBlocks.filter(b => b.metadata === METADATA.ZONE);
    if (zones.length > 0) {
      if (zoneBlocks.length === 0) {
        throw new Error('No zone blocks found');
      }

      // Encode zones
      const encodedZones = zones.map((zone, idx) => encodeZone(zone, idx + 1));
      
      // Calculate total size needed
      const totalZoneSize = zones.length * BLOCK_SIZE.ZONE + OFFSET.ZONE_START;
      const totalBlocksNeeded = Math.ceil(totalZoneSize / BLOCK_SIZE.STANDARD);
      
      // Generate concatenated zone data
      const allZoneData = new Uint8Array(totalBlocksNeeded * BLOCK_SIZE.STANDARD);
      allZoneData.fill(0xFF);
      
      // Write zones to the concatenated data
      for (let i = 0; i < encodedZones.length; i++) {
        const zoneOffset = OFFSET.ZONE_START + (i * BLOCK_SIZE.ZONE);
        if (zoneOffset + BLOCK_SIZE.ZONE > allZoneData.length) {
          throw new Error(`Zone ${i + 1} would exceed block size`);
        }
        allZoneData.set(encodedZones[i], zoneOffset);
      }
      
      // Split into blocks and set metadata
      let dataOffset = 0;
      for (let blockIdx = 0; blockIdx < zoneBlocks.length; blockIdx++) {
        const block = zoneBlocks[blockIdx];
        const blockData = allZoneData.slice(dataOffset, dataOffset + BLOCK_SIZE.STANDARD);
        blockData[0xFFF] = block.metadata; // Preserve metadata
        
        blocksToWrite.push({
          address: block.address,
          data: blockData,
          metadata: block.metadata,
        });
        
        // Update cache with new block data
        const cacheIndex = this.cachedBlockData.findIndex(b => b.address === block.address);
        if (cacheIndex >= 0) {
          this.cachedBlockData[cacheIndex].data = blockData;
        }
        
        dataOffset += BLOCK_SIZE.STANDARD;
      }
    }

    // Generate scan list blocks
    const scanBlocks = this.discoveredBlocks.filter(b => b.type === 'scan' && b.metadata === METADATA.SCAN_LIST);
    if (scanLists.length > 0) {
      if (scanBlocks.length === 0) {
        throw new Error('No scan list blocks found');
      }

      // Encode scan lists
      const encodedScanLists = scanLists.map((scanList, idx) => encodeScanList(scanList, idx + 1));
      
      // Calculate total size needed
      let totalScanListSize = 0;
      for (let i = 0; i < scanLists.length; i++) {
        if (i < 44) {
          totalScanListSize = Math.max(totalScanListSize, OFFSET.SCAN_LIST_START + ((i + 1) * BLOCK_SIZE.SCAN_LIST));
        } else {
          const blockIndex = Math.floor((i - 44) / 44);
          const listIndexInBlock = (i - 44) % 44;
          const offset = (blockIndex * BLOCK_SIZE.STANDARD) + ((listIndexInBlock + 1) * BLOCK_SIZE.SCAN_LIST);
          totalScanListSize = Math.max(totalScanListSize, offset);
        }
      }
      const totalBlocksNeeded = Math.ceil(totalScanListSize / BLOCK_SIZE.STANDARD);
      
      // Generate concatenated scan list data
      const allScanListData = new Uint8Array(totalBlocksNeeded * BLOCK_SIZE.STANDARD);
      allScanListData.fill(0xFF);
      
      // Write scan lists to the concatenated data
      for (let i = 0; i < encodedScanLists.length; i++) {
        let scanListOffset: number;
        if (i < 44) {
          scanListOffset = OFFSET.SCAN_LIST_START + (i * BLOCK_SIZE.SCAN_LIST);
        } else {
          const blockIndex = Math.floor((i - 44) / 44);
          const listIndexInBlock = (i - 44) % 44;
          scanListOffset = (blockIndex * BLOCK_SIZE.STANDARD) + (listIndexInBlock * BLOCK_SIZE.SCAN_LIST);
        }
        
        if (scanListOffset + BLOCK_SIZE.SCAN_LIST > allScanListData.length) {
          throw new Error(`Scan list ${i + 1} would exceed block size`);
        }
        
        allScanListData.set(encodedScanLists[i], scanListOffset);
      }
      
      // Split into blocks and set metadata
      let dataOffset = 0;
      for (let blockIdx = 0; blockIdx < scanBlocks.length; blockIdx++) {
        const block = scanBlocks[blockIdx];
        const blockData = allScanListData.slice(dataOffset, dataOffset + BLOCK_SIZE.STANDARD);
        blockData[0xFFF] = block.metadata; // Preserve metadata
        
        blocksToWrite.push({
          address: block.address,
          data: blockData,
          metadata: block.metadata,
        });
        
        // Update cache with new block data
        const cacheIndex = this.cachedBlockData.findIndex(b => b.address === block.address);
        if (cacheIndex >= 0) {
          this.cachedBlockData[cacheIndex].data = blockData;
        }
        
        dataOffset += BLOCK_SIZE.STANDARD;
      }
    }

    // Step 3: Prepare all blocks to write in the correct order
    // Write order:
    // 1. Channel blocks: 0x12 through 0x41 (incrementing order)
    // 2. Configuration blocks: 0x11, 0x0F, 0x06, 0x10, 0x0A, 0x03, 0x04, 0x65, 0x66, 0x67
    this.onProgress?.(50, 'Preparing blocks in write order...');
    
    const finalBlocksToWrite: Array<{ address: number; data: Uint8Array; metadata: number }> = [];
    
    // 1. Channel blocks: Only write blocks that contain channel data (in incrementing order)
    const channelBlocksToWrite = blocksToWrite
      .filter(b => b.metadata >= 0x12 && b.metadata <= 0x41)
      .sort((a, b) => a.metadata - b.metadata);
    
    for (const block of channelBlocksToWrite) {
      finalBlocksToWrite.push(block);
    }
    
    // 2. Configuration blocks in specified order: 0x11, 0x0F, 0x06, 0x10, 0x0A, 0x03, 0x04, 0x65, 0x66, 0x67
    const configMetadataOrder = [0x11, 0x0F, 0x06, 0x10, 0x0A, 0x03, 0x04, 0x65, 0x66, 0x67];
    
    for (const metadata of configMetadataOrder) {
      // Find all blocks with this metadata
      const blocksWithMetadata = this.discoveredBlocks
        .filter(b => b.metadata === metadata)
        .sort((a, b) => a.address - b.address); // Sort by address for consistency
      
      for (const block of blocksWithMetadata) {
        // Use new data if we generated it (for zones and scan lists), otherwise use cached data
        const newBlock = blocksToWrite.find(b => b.address === block.address);
        if (newBlock) {
          finalBlocksToWrite.push(newBlock);
        } else {
          // Use cached block data
          const cachedBlock = this.getCachedBlockByAddress(block.address);
          if (cachedBlock) {
            finalBlocksToWrite.push({
              address: cachedBlock.address,
              data: cachedBlock.data,
              metadata: cachedBlock.metadata,
            });
          }
        }
      }
    }
    
    // Step 4: Store write blocks for debug confirmation before writing
    this.writeBlockData.clear();
    for (const block of finalBlocksToWrite) {
      this.writeBlockData.set(block.address, {
        address: block.address,
        data: block.data,
        metadata: block.metadata,
      });
    }
    
    // Log write blocks for debug
    console.log(`Write blocks prepared (${finalBlocksToWrite.length} blocks):`);
    for (const block of finalBlocksToWrite) {
      const metadataHex = `0x${block.metadata.toString(16).padStart(2, '0').toUpperCase()}`;
      const addressHex = `0x${block.address.toString(16).padStart(6, '0')}`;
      console.log(`  ${metadataHex} at ${addressHex} (${block.data.length} bytes)`);
    }
    
    // Step 5: Write all blocks to radio in the correct order
    this.onProgress?.(60, `Writing ${finalBlocksToWrite.length} blocks to radio in correct order...`);
    
    for (let i = 0; i < finalBlocksToWrite.length; i++) {
      const block = finalBlocksToWrite[i];
      const progress = 60 + Math.floor((i / finalBlocksToWrite.length) * 40);
      const metadataHex = `0x${block.metadata.toString(16).padStart(2, '0').toUpperCase()}`;
      this.onProgress?.(progress, `Writing block ${i + 1} of ${finalBlocksToWrite.length} (${metadataHex})...`);
      await this.connection!.writeMemory(block.address, block.data, block.metadata);
      if (i < finalBlocksToWrite.length - 1) {
        await new Promise(resolve => setTimeout(resolve, CONNECTION.BLOCK_READ_DELAY));
      }
    }

    this.onProgress?.(100, 'Successfully wrote all data to radio');
    const changedCount = blocksToWrite.length;
    const totalCount = finalBlocksToWrite.length;
    console.log(`Smart write complete: Wrote ${totalCount} blocks total (${changedCount} changed, ${totalCount - changedCount} from cache)`);
    console.log(`  - ${channels.length} channels, ${zones.length} zones, ${scanLists.length} scan lists`);
  }
}

