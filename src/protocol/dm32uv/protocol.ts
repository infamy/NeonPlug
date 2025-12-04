/**
 * DM-32UV Protocol Implementation
 * Main protocol interface implementation using Web Serial API
 */

import { DM32Connection } from './connection';
import { discoverMemoryBlocks, readChannelCount, readChannelBlocks, type MemoryBlock } from './memory';
import { parseChannel, parseZones, parseScanLists, parseContacts, encodeChannel, encodeZone } from './structures';
import type { RadioProtocol, RadioInfo } from '../interface';
import type { Channel, Zone, Contact, RadioSettings, ScanList } from '../../models';
import type { WebSerialPort } from './types';
import { METADATA, BLOCK_SIZE, OFFSET, VFRAME, CONNECTION } from './constants';
import {
  requireConnection,
  requireDiscoveredBlocks,
  checkEmptyBlocks,
  readAndConcatenateBlocks,
  storeRawData,
} from './helpers';

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
  public blockMetadata: Map<number, { metadata: number; type: string }> = new Map();
  public blockData: Map<number, Uint8Array> = new Map();
  private discoveredBlocks: MemoryBlock[] = []; // Store discovered blocks for reuse

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
    try {
      // Request serial port
      if (!('serial' in navigator)) {
        throw new Error('Web Serial API not supported. Please use Chrome/Edge.');
      }

      const port = await (navigator as any).serial.requestPort() as WebSerialPort;
      
      // Check if port is already open
      // readable and writable being non-null indicates the port is open
      const isAlreadyOpen = port.readable !== null && port.writable !== null;
      
      if (isAlreadyOpen) {
        // Check if streams are locked (from a previous connection)
        if (port.readable.locked || port.writable.locked) {
          throw new Error('Port is in use by another connection. Please wait for the previous operation to complete.');
        }
        console.log('Port is already open, will use existing connection');
      } else {
        // Port is not open, so open it
        try {
          await port.open({ baudRate: CONNECTION.BAUD_RATE });
        } catch (e: unknown) {
          const error = e as Error;
          // If it says already open (race condition), check for locked streams
          if (error.message && error.message.includes('already open')) {
            if (port.readable?.locked || port.writable?.locked) {
              throw new Error('Port is in use by another connection. Please wait for the previous operation to complete.');
            }
            console.log('Port opened by another process, will use existing connection');
          } else {
            throw new Error(`Failed to open port: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        }
      }
      
      // Brief delay after opening port (as per spec)
      await new Promise(resolve => setTimeout(resolve, CONNECTION.INIT_DELAY));

      this.port = port;
      this.connection = new DM32Connection();
      await this.connection.connect(port);

      // Query V-frames to get radio info
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
   * Closes the serial port connection and clears all cached data.
   * Safe to call even if not connected.
   */
  async disconnect(): Promise<void> {
    if (this.connection) {
      await this.connection.disconnect();
      this.connection = null;
    }
    // Port is managed by connection, so we just clear the reference
    this.port = null;
    this.radioInfo = null;
    // Clear all state to prevent stale data from affecting next connection
    this.rawChannelData = new Map();
    this.rawZoneData = new Map();
    this.rawScanListData = new Map();
    this.blockMetadata = new Map();
    this.blockData = new Map();
    this.discoveredBlocks = [];
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
   * Read all channels from the radio
   * 
   * Discovers channel blocks, reads channel data, and parses channel structures.
   * Progress is reported via the onProgress callback.
   * 
   * @returns Array of parsed channel objects
   * @throws {Error} If not connected
   * @throws {Error} If no channel blocks are found
   */
  async readChannels(): Promise<Channel[]> {
    requireConnection(this.connection, this.radioInfo);

    this.onProgress?.(0, 'Discovering channel blocks...');

    // Discover channel blocks
    // V-frame 0x0A gives us the range: 200 blocks (800KB / 4KB)
    // We read 1 byte at offset 0xFFF for each block
    const blocks = await discoverMemoryBlocks(
      this.connection!,
      this.radioInfo!.memoryLayout.configStart,
      this.radioInfo!.memoryLayout.configEnd,
      (current, total) => {
        const progress = Math.floor((current / total) * 20); // 0-20% for discovery
        this.onProgress?.(progress, `Reading metadata ${current} of ${total}...`);
      }
    );

    // Store discovered blocks for reuse in zone/scan list reading
    this.discoveredBlocks = blocks;
    
    // Store ALL block metadata for debug export (including empty blocks)
    // This helps us find scan lists and other data types
    const blockMetadataMap = new Map<number, { metadata: number; type: string }>();
    for (const block of blocks) {
      // Include ALL blocks, even empty ones (0x00, 0xFF) so we can see all metadata values
      blockMetadataMap.set(block.address, {
        metadata: block.metadata,
        type: block.type,
      });
    }
    (this as any).allBlockMetadata = blockMetadataMap;

    const channelBlocks = blocks.filter(b => b.type === 'channel');
    if (channelBlocks.length === 0) {
      throw new Error('No channel blocks found');
    }

    // Sort channel blocks by metadata (0x12 = first, 0x13 = second, etc.)
    channelBlocks.sort((a, b) => a.metadata - b.metadata);
    
    // Find the first channel block (metadata 0x12)
    const firstChannelBlock = channelBlocks.find(b => b.metadata === METADATA.CHANNEL_FIRST);
    if (!firstChannelBlock) {
      throw new Error(`First channel block (metadata 0x${METADATA.CHANNEL_FIRST.toString(16)}) not found`);
    }

    // Calculate metadata range for logging
    // Metadata ranges from 0x12 to 0x41 (48 blocks max)
    const maxMetadata = Math.max(...channelBlocks.map(b => b.metadata));
    const minMetadata = Math.min(...channelBlocks.map(b => b.metadata));
    console.log(`Found ${channelBlocks.length} channel blocks (metadata range: 0x${minMetadata.toString(16)}-0x${maxMetadata.toString(16)})`);

    this.onProgress?.(10, `Found ${channelBlocks.length} channel blocks`);

    // Read channel count from first 4 bytes of first block (metadata 0x12)
    console.log(`Reading channel count from first block (metadata 0x12) at 0x${firstChannelBlock.address.toString(16)}`);
    const channelCount = await readChannelCount(this.connection!, firstChannelBlock.address);
    console.log(`Channel count: ${channelCount}`);
    this.onProgress?.(20, `Reading ${channelCount} channels from ${channelBlocks.length} blocks...`);

    // Read all channel blocks
    const channelBlockData = await readChannelBlocks(
      this.connection!,
      channelBlocks,
      (progress, message) => {
        // Map 0-100% to 20-50% range for block reading
        const mappedProgress = 20 + (progress * 0.30);
        this.onProgress?.(mappedProgress, message);
      }
    );
    console.log(`Read ${channelBlockData.size} channel blocks`);
    this.onProgress?.(50, 'Parsing channel data...');

    // Parse channels - process blocks in metadata order (0x12, 0x13, 0x14, ...)
    const channels: Channel[] = [];
    const rawChannelData = new Map<number, { data: Uint8Array; blockAddr: number; offset: number }>();
    let channelIndex = 1;

    for (const block of channelBlocks) {
      const blockDataBytes = channelBlockData.get(block.address);
      if (!blockDataBytes) {
        console.warn(`No data for block with metadata 0x${block.metadata.toString(16)} at 0x${block.address.toString(16)}`);
        continue;
      }

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

          const channel = parseChannel(channelData, channelIndex);
          channels.push(channel);
          channelIndex++;

          // Update progress more frequently (every 10 channels instead of 50)
          if (channelIndex % 10 === 0 || channelIndex === channelCount) {
            const parseProgress = 50 + ((channelIndex / channelCount) * 50); // 50-100%
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
    }

    console.log(`Successfully parsed ${channels.length} channels (expected ${channelCount})`);
    this.onProgress?.(100, `Successfully read ${channels.length} channels`);
    
    // Store raw data in a property for retrieval
    this.rawChannelData = rawChannelData;
    
    // Skip reading all blocks for debug export to avoid timeouts
    // We can read blocks on-demand if needed for debug export
    this.blockData = new Map(); // Initialize empty
    console.log('Skipping full block read for debug export to avoid timeouts');
    
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
        blockData.set(encodedChannels[channelIndex], offset);
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

  async readZones(): Promise<Zone[]> {
    requireConnection(this.connection, this.radioInfo);
    this.onProgress?.(0, 'Reading zones...');
    requireDiscoveredBlocks(this.discoveredBlocks);

    // Zone metadata identified from debug export: 0x5c
    const zoneBlocks = this.discoveredBlocks.filter(b => b.metadata === METADATA.ZONE);
    console.log(`Found ${zoneBlocks.length} zone blocks (metadata 0x${METADATA.ZONE.toString(16)})`);

    if (checkEmptyBlocks(zoneBlocks, 'zone', this.onProgress)) {
      return [];
    }

    // Read all zone blocks and concatenate
    const allZoneData = await readAndConcatenateBlocks(
      this.connection!,
      zoneBlocks,
      this.onProgress
    );

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

  async readScanLists(): Promise<ScanList[]> {
    requireConnection(this.connection, this.radioInfo);
    this.onProgress?.(0, 'Reading scan lists...');
    requireDiscoveredBlocks(this.discoveredBlocks);

    const scanBlocks = this.discoveredBlocks.filter(b => b.type === 'scan' && b.metadata === METADATA.SCAN_LIST);
    console.log(`Found ${scanBlocks.length} scan list blocks (metadata 0x${METADATA.SCAN_LIST.toString(16)})`);

    if (checkEmptyBlocks(scanBlocks, 'scan list', this.onProgress)) {
      return [];
    }

    // Read all scan list blocks and concatenate
    // Store block data for debug export
    const allScanListData = await readAndConcatenateBlocks(
      this.connection!,
      scanBlocks,
      this.onProgress,
      (block, blockData) => {
        this.blockData.set(block.address, blockData);
      }
    );

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

  async writeScanLists(_scanLists: ScanList[]): Promise<void> {
    // TODO: Implement scan list writing
    throw new Error('Scan list writing not yet implemented');
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

  async readRadioSettings(): Promise<RadioSettings> {
    if (!this.radioInfo) {
      throw new Error('Not connected to radio');
    }

    // Return basic settings from radio info
    const settings: RadioSettings = {
      name: 'DM-32UV',
      model: this.radioInfo.model,
      firmware: this.radioInfo.firmware,
      buildDate: this.radioInfo.buildDate,
      bandLimits: {
        vhfMin: 136.0000,
        vhfMax: 174.0000,
        uhfMin: 400.0000,
        uhfMax: 480.0000,
      },
    };
    return settings;
  }

  async writeRadioSettings(_settings: RadioSettings): Promise<void> {
    // TODO: Implement settings writing
    throw new Error('Settings writing not yet implemented');
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
}

