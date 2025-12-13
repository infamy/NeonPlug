/**
 * DM-32UV Protocol Implementation
 * Main protocol interface implementation using Web Serial API
 */

import { DM32Connection } from './connection';
import { discoverMemoryBlocks, readChannelCount, type MemoryBlock } from './memory';
import { parseChannel, parseZones, parseScanLists, parseContactEntry, encodeChannel, encodeZone, encodeScanList, encodeContactEntry, parseRadioSettings, encodeRadioSettings, encodeDigitalEmergencies, encodeAnalogEmergencies, parseQuickMessages, parseDMRRadioIDs, parseCalibration, parseRXGroups } from './structures';
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
  public rawContactBlockData: Uint8Array | null = null;
  public rawContactBlockAddress: number | null = null;
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
  // Zone comparison data: stores comparison results for debug export
  public zoneComparisonData: Array<{
    blockIndex: number;
    address: string;
    isIdentical: boolean;
    differences: number;
    differencePositions: number[];
    zoneComparisons: Array<{
      zoneNumber: number;
      offset: number;
      originalName: string;
      newName: string;
      originalChannelCount: number;
      newChannelCount: number;
      matches: boolean;
      originalHex: string;
      newHex: string;
    }>;
    metadataMatch: boolean;
    originalMetadata: number;
    newMetadata: number;
  }> = [];
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
    
    // Request serial port
    if (!('serial' in navigator)) {
      throw new Error('Web Serial API not supported. Please use Chrome/Edge.');
    }

    let port: WebSerialPort | null = null;
    let usedPreviouslyGrantedPort = false;

    // Check if we should force port selection (port is null means force selection)
    const forcePortSelection = this.port === null;

    // First attempt: try to get a port (reuse existing, previously granted, or prompt)
    try {
      port = await this.getOrSelectPort(forcePortSelection);
      if (port) {
        // Check if we used a previously granted port (not from prompt)
        const grantedPorts = await (navigator as any).serial.getPorts();
        if (grantedPorts && grantedPorts.length > 0 && grantedPorts.includes(port)) {
          usedPreviouslyGrantedPort = true;
        }
      }
    } catch (e: unknown) {
      // If port selection was cancelled, rethrow
      const error = e as Error;
      if (error.message && error.message.includes('cancelled')) {
        throw error;
      }
      // Otherwise, we'll retry with port selection below
    }

    // Try to connect with the port
    try {
      await this.connectWithPort(port!);
    } catch (connectError: unknown) {
      // If connection failed and we used a previously granted port, retry with port selection
      if (usedPreviouslyGrantedPort && port) {
        console.warn('Connection failed with previously granted port, will prompt for port selection:', connectError);
        // Clear the failed port
        this.port = null;
        // Close the port if it's open
        try {
          if (port.readable || port.writable) {
            await port.close();
          }
        } catch (closeError) {
          console.warn('Error closing failed port:', closeError);
        }
        // Retry with port selection
        port = await this.getOrSelectPort(true); // Force port selection
        await this.connectWithPort(port);
      } else {
        // Re-throw the original connection error
        throw connectError;
      }
    }
  }

  async getOrSelectPort(forceSelection: boolean = false): Promise<WebSerialPort> {
    // Clear any previous cached data before starting a new connection
    this.clearCache();

    // If forcing selection, skip all reuse logic and go straight to prompt
    if (forceSelection) {
      console.log('Forcing port selection (port will be prompted)');
      this.port = null; // Ensure port is cleared
      // Skip to prompt section below
    }

    // Check if we already have a port that we can reuse
    let port: WebSerialPort | null = this.port;
    let needToPromptForPort = forceSelection;
    
    if (!forceSelection && port) {
      // Check if port is still usable (open and streams not locked)
      const isAlreadyOpen = port.readable !== null && port.writable !== null;
      const streamsLocked = port.readable?.locked || port.writable?.locked;
      
      if (isAlreadyOpen && !streamsLocked) {
        // Port is open and streams are available - we can reuse it
        console.log('Reusing existing port connection');
        needToPromptForPort = false;
      } else if (!isAlreadyOpen) {
        // Port was closed, try to reopen it
        console.log('Port was closed, attempting to reopen...');
        try {
          await withTimeout(
            port.open({ baudRate: CONNECTION.BAUD_RATE }),
            CONNECTION.TIMEOUT.PORT_OPEN,
            'Port reopen'
          );
          console.log('Successfully reopened existing port');
          needToPromptForPort = false;
        } catch (e: unknown) {
          const error = e as Error;
          // If reopen failed, we'll need to get a new port
          console.warn('Failed to reopen existing port, will try previously granted ports:', error.message);
          port = null;
          this.port = null;
        }
      } else {
        // Streams are locked, can't reuse
        console.warn('Port streams are locked, will try previously granted ports');
        port = null;
        this.port = null;
      }
    }
    
    // If we don't have a usable port and not forcing selection, try to get previously granted ports
    if (needToPromptForPort && !port && !forceSelection) {
      try {
        const grantedPorts = await (navigator as any).serial.getPorts();
        if (grantedPorts && grantedPorts.length > 0) {
          // Use the first previously granted port (most recent)
          port = grantedPorts[0] as WebSerialPort;
          this.port = port;
          console.log(`Reusing previously granted port (${grantedPorts.length} available)`);
          
          // Check if port needs to be opened
          const isAlreadyOpen = port.readable !== null && port.writable !== null;
          const streamsLocked = port.readable?.locked || port.writable?.locked;
          
          if (isAlreadyOpen && !streamsLocked) {
            // Port is open and ready to use
            needToPromptForPort = false;
          } else if (!isAlreadyOpen) {
            // Port needs to be opened
            try {
              await withTimeout(
                port.open({ baudRate: CONNECTION.BAUD_RATE }),
                CONNECTION.TIMEOUT.PORT_OPEN,
                'Port open'
              );
              needToPromptForPort = false;
            } catch (e: unknown) {
              const error = e as Error;
              console.warn('Failed to open previously granted port, will prompt for new port:', error.message);
              port = null;
              this.port = null;
            }
          } else {
            // Streams are locked, can't use this port
            console.warn('Previously granted port has locked streams, will prompt for new port');
            port = null;
            this.port = null;
          }
        }
      } catch (e: unknown) {
        console.warn('Failed to get previously granted ports:', e);
        // Continue to prompt for port
      }
    }
    
    // Prompt for port only if we don't have a usable one, or if forcing selection
    if (forceSelection || (needToPromptForPort && !port)) {
      // Port selection dialog - no timeout, user can take as long as needed
      // Note: If user cancels, this will throw a DOMException, which we'll catch
      try {
        port = await (navigator as any).serial.requestPort() as WebSerialPort;
        this.port = port; // Store the port for future use
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
    }
    
    if (!port) {
      throw new Error('No port available');
    }

    return port;
  }

  private async connectWithPort(port: WebSerialPort): Promise<void> {
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
    // Keep the port reference so we can reuse it for subsequent operations
    // Don't close the port - just release the reader/writer locks
    // The port will stay open and can be reused
    // Only clear the port if it's explicitly closed or if we want to force a new selection
    // this.port = null; // Commented out to allow port reuse
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
      METADATA.VFO_SETTINGS,        // Radio Settings (0x04) - ALWAYS REQUIRED
      METADATA.DIGITAL_EMERGENCY,    // Digital Emergency Systems (0x03)
      METADATA.ANALOG_EMERGENCY,     // Analog Emergency Systems (0x10)
      METADATA.METADATA_0x41,        // Metadata block 0x41 - REQUIRED
      METADATA.QUICK_MESSAGES,       // Quick Messages (0x0A)
      METADATA.DMR_RADIO_IDS,        // DMR Radio IDs (0x67)
      METADATA.CALIBRATION,          // Calibration (0x02)
      METADATA.RX_GROUPS,            // RX Groups (0x0F)
    ];

    for (const metadata of fixedMetadataBlocks) {
      const block = blocks.find(b => b.metadata === metadata);
      if (block) {
        blocksToRead.push(block);
      } else {
        // Warn if required block is missing (especially 0x04)
        if (metadata === METADATA.VFO_SETTINGS) {
          console.warn(`⚠️  WARNING: Radio Settings block (metadata 0x04) not found during discovery! This block is required.`);
        } else {
          console.log(`ℹ️  Info: Metadata block 0x${metadata.toString(16)} not found (optional)`);
        }
      }
    }
    
    // Verify 0x04 block is included
    const vfoBlock = blocksToRead.find(b => b.metadata === METADATA.VFO_SETTINGS);
    if (!vfoBlock) {
      console.error(`❌ ERROR: Radio Settings block (metadata 0x04) is missing from blocks to read!`);
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
      
      // Verify we got exactly 4096 bytes
      if (blockData.length !== BLOCK_SIZE.STANDARD) {
        console.error(`⚠️  WARNING: Block at 0x${block.address.toString(16)} (metadata 0x${block.metadata.toString(16)}) has incorrect length: ${blockData.length} bytes (expected ${BLOCK_SIZE.STANDARD})`);
      }
      
      // IMPORTANT: Create a copy of the data to prevent corruption if the buffer is reused
      // Uint8Arrays are views into buffers - we need to copy the actual data
      const blockDataCopy = new Uint8Array(blockData);
      
      // Store as [metadata, address, 4k block data] in array
      this.cachedBlockData.push({
        metadata: block.metadata,
        address: block.address,
        data: blockDataCopy,
      });

      // Also store in blockData map for backward compatibility (use copy here too)
      this.blockData.set(block.address, blockDataCopy);

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
   * Read all required blocks into cache without disconnecting
   * Used when we need to read blocks before writing (connection must stay open)
   */
  async bulkReadRequiredBlocksForWrite(): Promise<void> {
    requireConnection(this.connection, this.radioInfo);

    // Reuse the same logic as bulkReadRequiredBlocks, but don't disconnect
    // We'll copy the block reading logic here
    
    // Step 1: Discover all metadata blocks (if not already discovered)
    if (this.discoveredBlocks.length === 0) {
      this.onProgress?.(0, 'Discovering memory blocks...');
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
    }

    // Step 2: Determine which blocks we need to read (same logic as bulkReadRequiredBlocks)
    const blocksToRead: MemoryBlock[] = [];

    // Step 2a: Determine channel blocks needed
    const channelBlocks = this.discoveredBlocks.filter(b => b.type === 'channel').sort((a, b) => a.metadata - b.metadata);
    if (channelBlocks.length > 0) {
      const firstChannelBlock = channelBlocks.find(b => b.metadata === METADATA.CHANNEL_FIRST);
      if (firstChannelBlock) {
        this.onProgress?.(10, 'Reading channel count from first block...');
        const channelCount = await readChannelCount(this.connection!, firstChannelBlock.address);
        console.log(`Channel count: ${channelCount}`);
        
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
        blocksToRead.push(...channelBlocks.slice(0, blocksNeeded));
      }
    }

    // Step 2b: Add fixed metadata blocks
    const fixedMetadataBlocks = [
      METADATA.VFO_SETTINGS,
      METADATA.DIGITAL_EMERGENCY,
      METADATA.ANALOG_EMERGENCY,
      METADATA.QUICK_MESSAGES,
      METADATA.DMR_RADIO_IDS,
      METADATA.CALIBRATION,
      METADATA.RX_GROUPS,
    ];

    for (const metadata of fixedMetadataBlocks) {
      const block = this.discoveredBlocks.find(b => b.metadata === metadata);
      if (block) {
        blocksToRead.push(block);
      }
    }

    // Step 2c: Add zone and scan list blocks
    const zoneBlocks = this.discoveredBlocks.filter(b => b.type === 'zone');
    const scanBlocks = this.discoveredBlocks.filter(b => b.type === 'scan');
    blocksToRead.push(...zoneBlocks);
    blocksToRead.push(...scanBlocks);

    // Step 2d: Add other data type blocks
    const messageBlocks = this.discoveredBlocks.filter(b => b.type === 'message');
    const dmrRadioIdBlocks = this.discoveredBlocks.filter(b => b.type === 'dmrradioid');
    const rxGroupBlocks = this.discoveredBlocks.filter(b => b.type === 'rxgroup');
    blocksToRead.push(...messageBlocks);
    blocksToRead.push(...dmrRadioIdBlocks);
    blocksToRead.push(...rxGroupBlocks);

    // Remove duplicates
    const uniqueBlocks = new Map<number, MemoryBlock>();
    for (const block of blocksToRead) {
      uniqueBlocks.set(block.address, block);
    }

    const finalBlocksToRead = Array.from(uniqueBlocks.values());
    console.log(`Bulk reading ${finalBlocksToRead.length} blocks for write operation`);

    // Step 3: Read all required blocks
    this.onProgress?.(10, `Reading ${finalBlocksToRead.length} blocks...`);
    this.cachedBlockData = [];

    for (let i = 0; i < finalBlocksToRead.length; i++) {
      const block = finalBlocksToRead[i];
      const progress = 10 + Math.floor((i / finalBlocksToRead.length) * 85); // 10-95%
      this.onProgress?.(progress, `Reading block ${i + 1} of ${finalBlocksToRead.length} (metadata 0x${block.metadata.toString(16)})...`);

      const blockData = await this.connection!.readMemory(block.address, BLOCK_SIZE.STANDARD);
      
      this.cachedBlockData.push({
        metadata: block.metadata,
        address: block.address,
        data: blockData,
      });

      this.blockData.set(block.address, blockData);

      if (i < finalBlocksToRead.length - 1) {
        await new Promise(resolve => setTimeout(resolve, CONNECTION.BLOCK_READ_DELAY));
      }
    }

    this.onProgress?.(100, `Successfully cached ${this.cachedBlockData.length} blocks`);
    console.log(`Bulk read complete: ${this.cachedBlockData.length} blocks cached`);
    console.log('All blocks are now in cache - connection remains open for writing');
    // NOTE: We do NOT disconnect here - connection must stay open for writing
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

          // Parse channel (forbid TX is at byte 0x18, bit 3)
          const channel = parseChannel(channelData, channelIndex);
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

    console.log(`[WRITE CHANNELS] Starting write operation:`);
    console.log(`  Total channels: ${channels.length}`);
    console.log(`  Channel blocks found: ${channelBlocks.length}`);
    console.log(`  Block addresses: ${channelBlocks.map(b => `0x${b.address.toString(16).padStart(6, '0').toUpperCase()}`).join(', ')}`);

    // Encode all channels to binary
    const encodedChannels = channels.map(ch => encodeChannel(ch));
    console.log(`[WRITE CHANNELS] Encoded ${encodedChannels.length} channels to binary format`);
    
    // Step 1: Read metadata bytes from ALL active channel blocks (1 byte per block at offset 0xFFF)
    // This matches the serial capture pattern: read all metadata first, then write only blocks we change
    console.log(`[WRITE CHANNELS] Reading metadata bytes (1 byte each) from all ${channelBlocks.length} active channel blocks...`);
    
    for (let blockIdx = 0; blockIdx < channelBlocks.length; blockIdx++) {
      const block = channelBlocks[blockIdx];
      const addressHex = `0x${block.address.toString(16).padStart(6, '0').toUpperCase()}`;
      const metadataAddr = block.address + 0xFFF; // Read metadata byte at offset 0xFFF
      const metadataAddrHex = `0x${metadataAddr.toString(16).padStart(6, '0').toUpperCase()}`;
      
      try {
        console.log(`[WRITE CHANNELS] Reading metadata byte from block ${blockIdx + 1}/${channelBlocks.length} at ${metadataAddrHex} (block address: ${addressHex}, metadata: 0x${block.metadata.toString(16).padStart(2, '0')})`);
        
        // Read only the metadata byte (1 byte at offset 0xFFF)
        const metadataData = await this.connection!.readMemory(metadataAddr, 1);
        const metadataValue = metadataData[0];
        
        console.log(`[WRITE CHANNELS] Successfully read metadata byte from ${addressHex}: 0x${metadataValue.toString(16).padStart(2, '0')}`);
        
        // Verify metadata matches what we discovered
        if (metadataValue !== block.metadata) {
          console.warn(`[WRITE CHANNELS] Metadata mismatch at ${addressHex}: expected 0x${block.metadata.toString(16).padStart(2, '0')}, got 0x${metadataValue.toString(16).padStart(2, '0')}. Using discovered value.`);
        }
        
        // Add delay between metadata reads
        if (blockIdx < channelBlocks.length - 1) {
          await new Promise(resolve => setTimeout(resolve, CONNECTION.BLOCK_READ_DELAY));
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(`[WRITE CHANNELS ERROR] Failed to read metadata from block ${blockIdx + 1}/${channelBlocks.length} at ${addressHex} (metadata address: ${metadataAddrHex}): ${errorMsg}`);
        console.error(`[WRITE CHANNELS ERROR] This was block ${blockIdx + 1} of ${channelBlocks.length} total blocks`);
        throw new Error(`Failed to read metadata from block ${blockIdx + 1} at ${addressHex}: ${errorMsg}`);
      }
    }
    
    console.log(`[WRITE CHANNELS] Metadata read complete, starting write operations...`);
    
    // Step 2: Calculate how many blocks we actually need to write
    // First block: 84 channels (starts at offset 0x10, so (4096 - 0x10) / 48 = 84)
    // Subsequent blocks: 85 channels each (4096 / 48 = 85)
    const channelsPerFirstBlock = 84;
    const channelsPerSubsequentBlock = 85;
    
    let blocksNeeded = 0;
    if (channels.length > 0) {
      blocksNeeded = 1; // First block
      const remainingChannels = channels.length - channelsPerFirstBlock;
      if (remainingChannels > 0) {
        blocksNeeded += Math.ceil(remainingChannels / channelsPerSubsequentBlock);
      }
    }
    
    // Only write to the blocks we actually need
    const blocksToWrite = channelBlocks.slice(0, blocksNeeded);
    console.log(`[WRITE CHANNELS] Will write to ${blocksToWrite.length} blocks (${channels.length} channels)`);
    
    // Step 3: Create new block data and write only to blocks we need
    // We create fresh 4KB blocks filled with 0xFF, then write our channel data
    let channelIndex = 0;
    for (let blockIdx = 0; blockIdx < blocksToWrite.length && channelIndex < channels.length; blockIdx++) {
      const block = blocksToWrite[blockIdx];
      const isFirstBlock = block.metadata === METADATA.CHANNEL_FIRST;
      const addressHex = `0x${block.address.toString(16).padStart(6, '0').toUpperCase()}`;
      const metadataHex = `0x${block.metadata.toString(16).padStart(2, '0').toUpperCase()}`;
      
      console.log(`[WRITE CHANNELS] Processing block ${blockIdx + 1}/${blocksToWrite.length}:`);
      console.log(`  Address: ${addressHex}`);
      console.log(`  Metadata: ${metadataHex}`);
      console.log(`  Is first block: ${isFirstBlock}`);
      
      // Create a new 4KB block filled with 0xFF (empty marker)
      const blockData = new Uint8Array(BLOCK_SIZE.STANDARD);
      blockData.fill(0xFF);
      
      // Update channel count in first block header (bytes 0-3)
      if (isFirstBlock) {
        const channelCountBytes = new Uint8Array(4);
        channelCountBytes[0] = channels.length & 0xFF;
        channelCountBytes[1] = (channels.length >> 8) & 0xFF;
        channelCountBytes[2] = (channels.length >> 16) & 0xFF;
        channelCountBytes[3] = (channels.length >> 24) & 0xFF;
        blockData.set(channelCountBytes, 0);
        console.log(`[WRITE CHANNELS] Updated channel count in first block header: ${channels.length} (bytes: ${Array.from(channelCountBytes).map(b => `0x${b.toString(16).padStart(2, '0')}`).join(' ')})`);
      }
      
      // Determine start offset and max channels for this block
      const startOffset = isFirstBlock ? OFFSET.FIRST_CHANNEL : 0x00;
      const maxChannelsInBlock = isFirstBlock ? 84 : 85;
      const maxOffset = startOffset + (maxChannelsInBlock * BLOCK_SIZE.CHANNEL);
      
      console.log(`[WRITE CHANNELS] Block channel layout:`);
      console.log(`  Start offset: 0x${startOffset.toString(16).padStart(2, '0').toUpperCase()}`);
      console.log(`  Max channels in block: ${maxChannelsInBlock}`);
      console.log(`  Max offset: 0x${maxOffset.toString(16).padStart(4, '0').toUpperCase()}`);
      
      const channelsInThisBlock: number[] = [];
      
      // Write channels to this block
      for (let offset = startOffset; offset < maxOffset && channelIndex < channels.length; offset += BLOCK_SIZE.CHANNEL) {
        const channel = channels[channelIndex];
        
        // Encode channel to binary
        const encodedChannel = encodedChannels[channelIndex];
        blockData.set(encodedChannel, offset);
        
        // Forbid TX is now written at fixed position 0x08 within the 48-byte channel data
        // No need to write separately - it's already in the encoded channel data
        
        channelsInThisBlock.push(channel.number);
        channelIndex++;
        
        // Update progress
        const progress = 10 + Math.floor((channelIndex / channels.length) * 80); // 10-90%
        if (channelIndex % 10 === 0 || channelIndex === channels.length) {
          this.onProgress?.(progress, `Encoded ${channelIndex} of ${channels.length} channels...`);
        }
      }
      
      // CRITICAL: Fill any unused channel slots with 0xFF (empty channel marker)
      // This ensures the block is properly formatted even if we're writing fewer channels than the block can hold
      const lastChannelOffset = startOffset + (channelsInThisBlock.length * BLOCK_SIZE.CHANNEL);
      if (lastChannelOffset < maxOffset) {
        // Fill remaining channel slots with 0xFF
        const emptyChannel = new Uint8Array(BLOCK_SIZE.CHANNEL);
        emptyChannel.fill(0xFF);
        for (let offset = lastChannelOffset; offset < maxOffset; offset += BLOCK_SIZE.CHANNEL) {
          blockData.set(emptyChannel, offset);
        }
        console.log(`[WRITE CHANNELS] Filled ${Math.floor((maxOffset - lastChannelOffset) / BLOCK_SIZE.CHANNEL)} unused channel slots with 0xFF`);
      }
      
      console.log(`[WRITE CHANNELS] Block ${blockIdx + 1} prepared:`);
      console.log(`  Channels in this block: ${channelsInThisBlock.length} (${channelsInThisBlock.join(', ')})`);
      console.log(`  Total channels encoded so far: ${channelIndex}/${channels.length}`);
      
      // CRITICAL: Set metadata byte at offset 0xFFF in the block data
      // This must match the metadata byte we send at the end of the write command
      blockData[0xFFF] = block.metadata;
      console.log(`[WRITE CHANNELS] Set metadata byte at 0xFFF to ${metadataHex}`);
      
      // Final validation: Ensure block is exactly 4KB before writing
      if (blockData.length !== BLOCK_SIZE.STANDARD) {
        throw new Error(`Block data size error at ${addressHex}: must be exactly ${BLOCK_SIZE.STANDARD} bytes (4KB), got ${blockData.length} bytes`);
      }
      console.log(`[WRITE CHANNELS] Block ${blockIdx + 1} validated: ${blockData.length} bytes (4KB)`);
      
      // Write the block back to radio
      const progress = 90 + Math.floor((blockIdx / blocksToWrite.length) * 10); // 90-100%
      this.onProgress?.(progress, `Writing block ${blockIdx + 1} of ${blocksToWrite.length}...`);
      
      console.log(`[WRITE CHANNELS] Writing block ${blockIdx + 1}/${blocksToWrite.length} to radio at ${addressHex} (metadata: ${metadataHex})...`);
      try {
        await this.connection!.writeMemory(block.address, blockData, block.metadata);
        console.log(`[WRITE CHANNELS] ✓ Successfully wrote block ${blockIdx + 1}/${blocksToWrite.length} to radio at ${addressHex}`);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(`[WRITE CHANNELS ERROR] ✗ Failed to write block ${blockIdx + 1}/${blocksToWrite.length} at ${addressHex} (metadata: ${metadataHex}): ${errorMsg}`);
        console.error(`[WRITE CHANNELS ERROR] This was write attempt ${blockIdx + 1} of ${blocksToWrite.length} total blocks`);
        throw error;
      }
      
      // No delay needed - we wait for ACK before proceeding, just like the original C code
      
      // Stop if we've written all channels
      if (channelIndex >= channels.length) {
        console.log(`[WRITE CHANNELS] All ${channelIndex} channels have been written, stopping block iteration`);
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
   * Based on ContactReadWrite.md spec:
   * - Query V-frame 0x0F to get base address (start/end)
   * - Query V-frame 0x10 to get max contact count
   * - Address calculation: base_address + (contact_index * 0x5C)
   * - Read 4KB blocks, parse 92-byte entries
   * 
   * @returns Array of contacts
   * @throws {Error} If not connected
   */
  async readContacts(): Promise<Contact[]> {
    requireConnection(this.connection, this.radioInfo);
    
    this.onProgress?.(0, 'Querying contact database info...');
    
    // Query V-frame 0x0F to get contacts memory range
    let contactsVFrame = this.radioInfo!.vframes.get(VFRAME.CONTACTS);
    if (!contactsVFrame || contactsVFrame.length < 8) {
      // Query it if not cached
      this.onProgress?.(1, 'Querying V-frame 0x0F (contact address range)...');
      contactsVFrame = await this.connection!.queryVFrame(0x0F);
    }
    
    if (!contactsVFrame || contactsVFrame.length < 8) {
      throw new Error('Failed to get contact address range from V-frame 0x0F');
    }
    
    // Parse memory range (8 bytes: start_addr (4 bytes LE) + end_addr (4 bytes LE))
    const baseAddr = this.readUint32LE(contactsVFrame, 0);
    const endAddr = this.readUint32LE(contactsVFrame, 4);
    
    console.log(`Contacts memory range: 0x${baseAddr.toString(16)} - 0x${endAddr.toString(16)}`);
    
    if (baseAddr === 0 && endAddr === 0) {
      console.warn('Contacts range is 0x00000000-0x00000000, contacts may be disabled');
      return [];
    }
    
    // Query V-frame 0x10 to get max contact count
    this.onProgress?.(2, 'Querying V-frame 0x10 (max contact count)...');
    let maxContactsVFrame = this.radioInfo!.vframes.get(0x10);
    if (!maxContactsVFrame || maxContactsVFrame.length < 4) {
      maxContactsVFrame = await this.connection!.queryVFrame(0x10);
    }
    
    let maxContacts = 50000; // Default for standard firmware
    if (maxContactsVFrame && maxContactsVFrame.length >= 4) {
      maxContacts = this.readUint32LE(maxContactsVFrame, 0);
      console.log(`Max contacts: ${maxContacts}`);
    }
    
    const ENTRY_SIZE = 0x5C; // 92 bytes per contact
    const contacts: Contact[] = [];
    
    // Calculate range info for logging
    const rangeSize = endAddr - baseAddr;
    const maxContactsInRange = Math.floor(rangeSize / ENTRY_SIZE);
    
    console.log(`Contact database range:`);
    console.log(`  Base address: 0x${baseAddr.toString(16).toUpperCase()} (${baseAddr})`);
    console.log(`  End address: 0x${endAddr.toString(16).toUpperCase()} (${endAddr})`);
    console.log(`  Range size: ${rangeSize.toLocaleString()} bytes (${(rangeSize / 1024 / 1024).toFixed(2)} MB)`);
    console.log(`  Max contacts in range: ${maxContactsInRange.toLocaleString()}`);
    console.log(`  Max contacts (firmware limit): ${maxContacts.toLocaleString()}`);
    console.log(`  Reading sequentially until empty entry found...`);
    
    this.onProgress?.(5, `Reading contacts sequentially from 0x${baseAddr.toString(16).toUpperCase()}...`);
    
    // Read contacts in 4KB blocks
    // Contact 0 is at baseAddr (has count in first 4 bytes, then padding, then name at 0x10)
    // Contact 1+ are at baseAddr + (contactIndex * ENTRY_SIZE)
    // Each 4KB block can hold: 4096 / 92 = ~44 contacts
    const CONTACTS_PER_BLOCK = Math.floor(BLOCK_SIZE.STANDARD / ENTRY_SIZE);
    let contactIndex = 0;
    let blockIdx = 0;
    let foundEmptyEntry = false;
    let countFromHeader = 0;
    
    // Determine how many contacts to read
    // First, we need to read the first block to get the count from Contact 0
    const firstBlockAddr = Math.floor(baseAddr / BLOCK_SIZE.STANDARD) * BLOCK_SIZE.STANDARD;
    const firstBlockData = await this.connection!.readMemory(firstBlockAddr, BLOCK_SIZE.STANDARD);
    const countOffset = baseAddr - firstBlockAddr;
    countFromHeader = firstBlockData[countOffset] | 
                      (firstBlockData[countOffset + 1] << 8) | 
                      (firstBlockData[countOffset + 2] << 16) | 
                      (firstBlockData[countOffset + 3] << 24);
    
    console.log(`Contact count from header: ${countFromHeader}`);
    
    // Store first contact block for debugging
    this.rawContactBlockData = new Uint8Array(firstBlockData);
    this.rawContactBlockAddress = firstBlockAddr;
    
    // Use count from header to determine how many contacts to read
    // But respect firmware and range limits
    const contactsToRead = countFromHeader > 0 && countFromHeader <= maxContacts && countFromHeader <= maxContactsInRange
      ? countFromHeader
      : Math.min(maxContacts, maxContactsInRange);
    
    console.log(`Will read ${contactsToRead} contacts (count from header: ${countFromHeader}, max: ${maxContacts}, range max: ${maxContactsInRange})`);
    
    // Read blocks until we've read all contacts or hit an empty entry
    // ALL contacts start at baseAddr + 0x10 + (contactIndex * ENTRY_SIZE)
    // The first 16 bytes at baseAddr are the count header (not part of Contact 0)
    while (!foundEmptyEntry && contactIndex < contactsToRead) {
      // Calculate block address (4KB-aligned)
      // Contact 0 is at baseAddr + 0x10, Contact 1 is at baseAddr + 0x10 + 0x5C, etc.
      const blockStartContact = blockIdx * CONTACTS_PER_BLOCK;
      const blockStartAddr = baseAddr + 0x10 + (blockStartContact * ENTRY_SIZE);
      const blockAddr = Math.floor(blockStartAddr / BLOCK_SIZE.STANDARD) * BLOCK_SIZE.STANDARD; // Align to 4KB
      
      // Check if we've gone past the end address
      if (blockAddr >= endAddr) {
        break;
      }
      
      const progress = 5 + Math.floor((contactIndex / contactsToRead) * 90);
      const currentBlockAddrHex = `0x${blockAddr.toString(16).toUpperCase()}`;
      this.onProgress?.(progress, `Reading contact block at ${currentBlockAddrHex} (${contactIndex}/${contactsToRead} contacts)...`);
      
      // Read 4KB block (reuse first block if it's the same)
      let blockData: Uint8Array;
      if (blockIdx === 0 && blockAddr === firstBlockAddr) {
        blockData = firstBlockData; // Reuse the first block we already read
      } else {
        blockData = await this.connection!.readMemory(blockAddr, BLOCK_SIZE.STANDARD);
      }
      
      // Calculate offset within block for first contact in this block
      const blockOffset = blockStartAddr - blockAddr;
      
      // Parse contacts in this block
      for (let i = 0; i < CONTACTS_PER_BLOCK; i++) {
        const currentContactIndex = blockStartContact + i;
        
        // Check if we've read all contacts based on count - stop immediately
        if (currentContactIndex >= contactsToRead) {
          foundEmptyEntry = true; // Signal to stop outer loop
          break;
        }
        
        const entryOffset = blockOffset + (i * ENTRY_SIZE);
        
        // Check if we've exceeded the block or range
        if (entryOffset + ENTRY_SIZE > blockData.length) break;
        
        const entryData = blockData.slice(entryOffset, entryOffset + ENTRY_SIZE);
        
        // Check for empty entry: name at 0x00-0x0F starts with 0xFF or 0x00
        // ALL contacts have name at offset 0x00 within their entry
        if (entryData[0x00] === 0xFF || entryData[0x00] === 0x00) {
          if (contactIndex < countFromHeader) {
            console.warn(`Found empty entry at contact index ${currentContactIndex}, but count says ${countFromHeader} contacts. Continuing to read count...`);
            // Don't stop - continue reading up to the count
          } else {
            console.log(`Found empty entry at contact index ${currentContactIndex}, stopping read`);
            foundEmptyEntry = true;
            break;
          }
        }
        
        // Debug: Log first few contacts to verify parsing
        if (currentContactIndex < 4) {
          const hexPreview = Array.from(entryData.slice(0, 48))
            .map(b => b.toString(16).padStart(2, '0').toUpperCase())
            .join(' ');
          const contactAddr = baseAddr + 0x10 + (currentContactIndex * ENTRY_SIZE);
          console.log(`Contact ${currentContactIndex} at offset ${entryOffset} (block offset ${blockOffset}, i=${i}):`);
          console.log(`  First 48 bytes: ${hexPreview}`);
          console.log(`  Expected address: 0x${contactAddr.toString(16).toUpperCase()}`);
          // All contacts have name at 0x00 from entry start
          console.log(`  Name area (0x00-0x0F): ${Array.from(entryData.slice(0x00, 0x10)).map(b => b.toString(16).padStart(2, '0')).join(' ')}`);
          console.log(`  ID at 0x10-0x13: ${Array.from(entryData.slice(0x10, 0x14)).map(b => b.toString(16).padStart(2, '0')).join(' ')}`);
        }
        
        const contact = parseContactEntry(entryData, currentContactIndex);
        
        if (contact) {
          if (currentContactIndex < 4) {
            console.log(`  Parsed: name="${contact.name}", dmrId=${contact.dmrId}`);
          }
          contacts.push(contact);
          contactIndex = currentContactIndex + 1;
          
          // Check if we've read all contacts - stop immediately
          if (contactIndex >= contactsToRead) {
            foundEmptyEntry = true; // Signal to stop outer loop
            break;
          }
        } else {
          // If parsing failed, check if it's an empty entry (name at 0x00 is 0xFF or 0x00)
          if (entryData[0x00] === 0xFF || entryData[0x00] === 0x00) {
            console.log(`Found empty entry at contact index ${currentContactIndex} (parse failed), stopping read`);
            foundEmptyEntry = true;
            break;
          }
        }
      }
      
      // Stop outer loop if we've read all contacts or found empty entry
      if (foundEmptyEntry || contactIndex >= contactsToRead) {
        break;
      }
      
      blockIdx++;
      
      // Small delay between blocks
      if (!foundEmptyEntry && contactIndex < contactsToRead) {
        await new Promise(resolve => setTimeout(resolve, CONNECTION.BLOCK_READ_DELAY));
      }
    }
    
    console.log(`Successfully read ${contacts.length} contacts`);
    this.onProgress?.(100, `Successfully read ${contacts.length} contacts`);
    
    return contacts;
  }

  /**
   * Write contacts to the radio
   * Based on ContactReadWrite.md spec:
   * - Query V-frame 0x0F to get base address
   * - Address calculation: base_address + (contact_index * 0x5C)
   * - Write 4KB blocks with 92-byte entries
   * 
   * @param contacts Array of contacts to write
   * @throws {Error} If not connected
   */
  async writeContacts(contacts: Contact[]): Promise<void> {
    requireConnection(this.connection, this.radioInfo);
    
    this.onProgress?.(0, 'Preparing to write contacts...');
    
    // Query V-frame 0x0F to get base address
    let contactsVFrame = this.radioInfo!.vframes.get(VFRAME.CONTACTS);
    if (!contactsVFrame || contactsVFrame.length < 8) {
      this.onProgress?.(1, 'Querying V-frame 0x0F (contact address range)...');
      contactsVFrame = await this.connection!.queryVFrame(0x0F);
    }
    
    if (!contactsVFrame || contactsVFrame.length < 8) {
      throw new Error('Failed to get contact address range from V-frame 0x0F');
    }
    
    const baseAddr = this.readUint32LE(contactsVFrame, 0);
    const endAddr = this.readUint32LE(contactsVFrame, 4);
    
    if (baseAddr === 0 && endAddr === 0) {
      throw new Error('Contacts range is invalid (0x00000000-0x00000000)');
    }
    
    const ENTRY_SIZE = 0x5C; // 92 bytes per contact
    const CONTACTS_PER_BLOCK = Math.floor(BLOCK_SIZE.STANDARD / ENTRY_SIZE);
    const totalBlocks = Math.ceil(contacts.length / CONTACTS_PER_BLOCK);
    
    // Write contact count in first 16 bytes (4 bytes count + 12 bytes padding)
    // Count is at baseAddr, contacts start at baseAddr + 0x10
    this.onProgress?.(5, `Writing contact count header...`);
    
    // Read first block to write count header
    const firstBlockAddr = Math.floor(baseAddr / BLOCK_SIZE.STANDARD) * BLOCK_SIZE.STANDARD;
    let firstBlockData: Uint8Array;
    let existingMetadata = 0xFF;
    try {
      firstBlockData = await this.connection!.readMemory(firstBlockAddr, BLOCK_SIZE.STANDARD);
      existingMetadata = firstBlockData[0xFFF];
    } catch (error) {
      firstBlockData = new Uint8Array(BLOCK_SIZE.STANDARD);
      firstBlockData.fill(0xFF);
    }
    
    // Write count (4 bytes, little-endian uint32) at offset 0 from baseAddr
    const countOffset = baseAddr - firstBlockAddr;
    firstBlockData[countOffset] = contacts.length & 0xFF;
    firstBlockData[countOffset + 1] = (contacts.length >> 8) & 0xFF;
    firstBlockData[countOffset + 2] = (contacts.length >> 16) & 0xFF;
    firstBlockData[countOffset + 3] = (contacts.length >> 24) & 0xFF;
    
    // Write 12 bytes of 0x00 padding after count
    for (let i = 0; i < 12; i++) {
      firstBlockData[countOffset + 4 + i] = 0x00;
    }
    
    // Preserve metadata byte
    firstBlockData[0xFFF] = existingMetadata;
    
    // Write first block with count header
    await this.connection!.writeMemory(firstBlockAddr, firstBlockData, existingMetadata);
    
    this.onProgress?.(10, `Writing ${contacts.length} contacts in ${totalBlocks} block(s)...`);
    
    // ALL contacts start at baseAddr + 0x10 + (contactIndex * ENTRY_SIZE)
    // The count header (16 bytes) is at baseAddr (0x00-0x0F), separate from contact entries
    // Contact 0 is at baseAddr + 0x10, Contact 1 is at baseAddr + 0x10 + 0x5C, etc.
    const contactsStartAddr = baseAddr + 0x10;
    
    for (let blockIdx = 0; blockIdx < totalBlocks; blockIdx++) {
      const blockStartContact = blockIdx * CONTACTS_PER_BLOCK;
      
      // Calculate the absolute address where the first contact in this block should be written
      // Contact 0 is at baseAddr + 0x10, Contact 1 is at baseAddr + 0x10 + 0x5C, etc.
      const blockStartAddr = contactsStartAddr + (blockStartContact * ENTRY_SIZE);
      
      // Align to 4KB block boundary for reading/writing
      const blockAddr = Math.floor(blockStartAddr / BLOCK_SIZE.STANDARD) * BLOCK_SIZE.STANDARD;
      
      const progress = 10 + Math.floor((blockIdx / totalBlocks) * 85); // 10-95%
      this.onProgress?.(progress, `Writing contact block ${blockIdx + 1}/${totalBlocks} (address 0x${blockStartAddr.toString(16).toUpperCase()})...`);
      
      // Read existing block to preserve other data
      // Note: Contacts are in a raw data region (no metadata blocks), so we just preserve whatever is at 0xFFF
      let blockData: Uint8Array;
      let existingMetadata = 0xFF; // Default if we can't read
      try {
        blockData = await this.connection!.readMemory(blockAddr, BLOCK_SIZE.STANDARD);
        // Preserve existing metadata byte (raw data region, not structured metadata blocks)
        existingMetadata = blockData[0xFFF];
      } catch (error) {
        // If read fails, create empty block filled with 0xFF
        blockData = new Uint8Array(BLOCK_SIZE.STANDARD);
        blockData.fill(0xFF);
      }
      
      // Encode contacts into block - write them sequentially in address space
      // Each contact is at: baseAddr + 0x10 + (contactIndex * ENTRY_SIZE)
      for (let i = 0; i < CONTACTS_PER_BLOCK; i++) {
        const contactIndex = blockStartContact + i;
        if (contactIndex >= contacts.length) break;
        
        // Calculate absolute address where this contact should be written
        // Contact 0 is at baseAddr + 0x10, Contact 1 is at baseAddr + 0x10 + 0x5C, etc.
        const contactAddr = contactsStartAddr + (contactIndex * ENTRY_SIZE);
        
        // Calculate offset within this 4KB block
        const entryOffset = contactAddr - blockAddr;
        
        if (entryOffset + ENTRY_SIZE > blockData.length) break;
        if (entryOffset < 0) continue; // Shouldn't happen, but safety check
        
        // Skip if this entry would overlap with the header (only in first block)
        // Header is at baseAddr (0-15), contacts start at baseAddr + 0x10 (16+)
        if (blockAddr === firstBlockAddr && contactAddr < baseAddr + 0x10) {
          continue;
        }
        
        const contact = contacts[contactIndex];
        const entryData = encodeContactEntry(contact);
        blockData.set(entryData, entryOffset);
      }
      
      // Preserve existing metadata byte (raw data region - no structured metadata blocks)
      blockData[0xFFF] = existingMetadata;
      
      // Write block (writeMemory requires metadata parameter, but this is just raw data)
      await this.connection!.writeMemory(blockAddr, blockData, existingMetadata);
      
      // Delay between writes
      if (blockIdx < totalBlocks - 1) {
        await new Promise(resolve => setTimeout(resolve, CONNECTION.BLOCK_READ_DELAY));
      }
    }
    
    this.onProgress?.(100, `Successfully wrote ${contacts.length} contacts`);
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

      // Parse VFO A and VFO B from block 0x41 (as channels 4001 and 4002)
      let vfoA: Channel | null = null;
      let vfoB: Channel | null = null;
      
      const block41 = this.discoveredBlocks.find(b => b.metadata === METADATA.METADATA_0x41);
      if (block41) {
        const block41Cached = this.getCachedBlockByAddress(block41.address);
        if (block41Cached) {
          // VFO A is channel 4001, VFO B is channel 4002
          // Calculate offsets: channel 4001 = (4001 - 1) * 48 = 4000 * 48 = 192000 bytes
          // But we need to find where in block 0x41 these are stored
          // Assuming they're stored as regular channels in the block
          // Channel 4001 would be at offset: need to calculate based on block structure
          
          try {
            // VFO A (channel 4001) - offset 0x0F9F (3999 bytes)
            const vfoAOffset = 0x0F9F;
            const vfoAData = block41Cached.data.slice(vfoAOffset, vfoAOffset + BLOCK_SIZE.CHANNEL);
            if (vfoAData.length === BLOCK_SIZE.CHANNEL) {
              vfoA = parseChannel(vfoAData, 4001);
            }
            
            // VFO B (channel 4002) - offset 0x0FCF (4047 bytes)
            const vfoBOffset = 0x0FCF;
            const vfoBData = block41Cached.data.slice(vfoBOffset, vfoBOffset + BLOCK_SIZE.CHANNEL);
            if (vfoBData.length === BLOCK_SIZE.CHANNEL) {
              vfoB = parseChannel(vfoBData, 4002);
            }
          } catch (err) {
            console.warn('Failed to parse VFO channels from block 0x41:', err);
          }
        }
      }

      const radioSettings = parseRadioSettings(cachedBlock.data);
      
      // Override VFO A and VFO B with data from block 0x41
      if (vfoA) {
        radioSettings.vfoA = vfoA;
      }
      if (vfoB) {
        radioSettings.vfoB = vfoB;
      }

      this.onProgress?.(100, 'Radio Settings processed');
      return radioSettings;
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

    // Encode settings to 4KB block, preserving original data if available
    const blockData = encodeRadioSettings(settings, this.rawRadioSettingsData || undefined);

    // Write the entire block (writeMemory takes address, data, and metadata)
    await this.connection!.writeMemory(radioSettingsBlock.address, blockData, METADATA.VFO_SETTINGS);
    this.rawRadioSettingsData = blockData;

    // Write VFO A and VFO B to block 0x41 (as channels 4001 and 4002)
    const block41 = this.discoveredBlocks.find(b => b.metadata === METADATA.METADATA_0x41);
    if (block41 && settings.vfoA && settings.vfoB) {
      // Read current block 0x41 data to preserve other data
      const block41Cached = this.getCachedBlockByAddress(block41.address);
      if (block41Cached) {
        // Create a copy of the block data
        const block41Data = new Uint8Array(block41Cached.data);
        
        // Encode VFO A (channel 4001) - offset 0x0F9F (3999 bytes)
        const vfoAOffset = 0x0F9F;
        const vfoAEncoded = encodeChannel(settings.vfoA);
        block41Data.set(vfoAEncoded, vfoAOffset);
        
        // Encode VFO B (channel 4002) - offset 0x0FCF (4047 bytes)
        const vfoBOffset = 0x0FCF;
        const vfoBEncoded = encodeChannel(settings.vfoB);
        block41Data.set(vfoBEncoded, vfoBOffset);
        
        // Write the updated block back
        await this.connection!.writeMemory(block41.address, block41Data, METADATA.METADATA_0x41);
        
        // Update cache
        this.blockData.set(block41.address, block41Data);
      } else {
        // Block not in cache, read it first
        const block41Data = await this.connection!.readMemory(block41.address, BLOCK_SIZE.STANDARD);
        const block41DataCopy = new Uint8Array(block41Data);
        
        // Encode VFO A (channel 4001) - offset 0x0F9F (3999 bytes)
        const vfoAOffset = 0x0F9F;
        const vfoAEncoded = encodeChannel(settings.vfoA);
        block41DataCopy.set(vfoAEncoded, vfoAOffset);
        
        // Encode VFO B (channel 4002) - offset 0x0FCF (4047 bytes)
        const vfoBOffset = 0x0FCF;
        const vfoBEncoded = encodeChannel(settings.vfoB);
        block41DataCopy.set(vfoBEncoded, vfoBOffset);
        
        // Write the updated block back
        await this.connection!.writeMemory(block41.address, block41DataCopy, METADATA.METADATA_0x41);
        
        // Update cache
        this.blockData.set(block41.address, block41DataCopy);
      }
    }

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
    // Clear previous zone comparison data
    this.zoneComparisonData = [];
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
      
      // Read all blocks into cache (but don't disconnect - we need connection for writing)
      await this.bulkReadRequiredBlocksForWrite();
    } else {
      this.onProgress?.(5, 'Using cached blocks for smart write...');
    }
    
    // Verify connection is still valid before proceeding
    requireConnection(this.connection, this.radioInfo);

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
          blockData.set(encodedChannels[channelIndex], offset);
          
          // Forbid TX is already written in the encoded channel data at byte 0x18, bit 3
          // No need to write separately - it's part of the mode flags byte
          
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

    // Generate zone blocks - ALWAYS write zones when writing channels
    const zoneBlocks = this.discoveredBlocks.filter(b => b.metadata === METADATA.ZONE);
    if (zoneBlocks.length === 0) {
      throw new Error('No zone blocks found');
    }

    // Read existing zone blocks from cache ONLY (no radio communication)
    let originalZoneData: Uint8Array | null = null;
    const cachedZoneBlocks = zoneBlocks.map(block => 
      this.cachedBlockData.find(cached => cached.address === block.address)
    );
    
    if (cachedZoneBlocks.every(cached => cached !== undefined)) {
      // Use cached data - concatenate all zone blocks
      const zoneBlockDataArrays = cachedZoneBlocks.map(cached => cached!.data);
      const totalSize = zoneBlockDataArrays.reduce((sum, arr) => sum + arr.length, 0);
      originalZoneData = new Uint8Array(totalSize);
      let offset = 0;
      for (const blockData of zoneBlockDataArrays) {
        originalZoneData.set(blockData, offset);
        offset += blockData.length;
      }
      console.log(`[ZONE DEBUG] Using cached zone data, total size: ${originalZoneData.length} bytes`);
    } else {
      console.warn(`[ZONE DEBUG] Zone blocks not in cache - skipping comparison`);
    }

    // Calculate total size needed for all zone blocks
    const totalZoneBlocksSize = zoneBlocks.length * BLOCK_SIZE.STANDARD;
    
    // Generate fresh zone data from scratch (filled with 0xFF)
    const allZoneData = new Uint8Array(totalZoneBlocksSize);
    allZoneData.fill(0xFF);

    // Encode all zones and write them to the fresh data
    const zonesToWrite = zones.length > 0 ? zones : [];
    console.log(`[ZONE DEBUG] Writing ${zonesToWrite.length} zones to ${zoneBlocks.length} block(s)`);
    
    if (zonesToWrite.length === 0) {
      console.warn('[ZONE DEBUG] No zones provided - writing empty zone blocks');
    } else {
      const encodedZones = zonesToWrite.map((zone, idx) => encodeZone(zone, idx + 1));
      console.log(`[ZONE DEBUG] Encoded ${encodedZones.length} zones`);
      
      // Write all zones to the fresh data
      // Zones are 145 bytes each, starting at offset 16
      // Zone N is at: 16 + (N - 1) * 145
      for (let i = 0; i < encodedZones.length; i++) {
        const zoneOffset = OFFSET.ZONE_START + (i * BLOCK_SIZE.ZONE);
        if (zoneOffset + BLOCK_SIZE.ZONE > allZoneData.length) {
          console.error(`[ZONE DEBUG] Zone ${i + 1} would exceed block size: offset ${zoneOffset}, data length ${allZoneData.length}`);
          throw new Error(`Zone ${i + 1} would exceed block size`);
        }
        
        allZoneData.set(encodedZones[i], zoneOffset);
      }
      
      // Write 0x0000 terminator after the last zone to indicate end of zones
      const lastZoneOffset = OFFSET.ZONE_START + (encodedZones.length * BLOCK_SIZE.ZONE);
      if (lastZoneOffset + 2 <= allZoneData.length) {
        allZoneData[lastZoneOffset] = 0x00;
        allZoneData[lastZoneOffset + 1] = 0x00;
        console.log(`[ZONE DEBUG] Wrote zone terminator (0x0000) at offset ${lastZoneOffset} after ${encodedZones.length} zones`);
      } else {
        console.warn(`[ZONE DEBUG] Cannot write zone terminator: offset ${lastZoneOffset} would exceed block size (${allZoneData.length})`);
      }
    }
    
    // Split into blocks and set metadata
    let zoneDataOffset = 0;
    for (let blockIdx = 0; blockIdx < zoneBlocks.length; blockIdx++) {
      const block = zoneBlocks[blockIdx];
      
      // Get original block data for comparison (only if we have cached data)
      const originalBlockData = originalZoneData ? originalZoneData.slice(zoneDataOffset, zoneDataOffset + BLOCK_SIZE.STANDARD) : null;
      
      // Calculate how many zones are in this block
      // Zones are 145 bytes each, starting at offset 16
      // Max zones per block: (4096 - 16) / 145 ≈ 28 zones
      const maxZonesPerBlock = Math.floor((BLOCK_SIZE.STANDARD - OFFSET.ZONE_START) / BLOCK_SIZE.ZONE);
      const zonesWrittenSoFar = Math.floor(zoneDataOffset / BLOCK_SIZE.STANDARD) * maxZonesPerBlock;
      const zonesInBlock = Math.min(zonesToWrite.length - zonesWrittenSoFar, maxZonesPerBlock);
      
      console.log(`[ZONE DEBUG] Block ${blockIdx}: zonesWrittenSoFar=${zonesWrittenSoFar}, zonesInBlock=${zonesInBlock}, totalZones=${zonesToWrite.length}, maxZonesPerBlock=${maxZonesPerBlock}`);
      
      // Create a new block data array (don't use slice as it creates a view)
      const blockData = new Uint8Array(BLOCK_SIZE.STANDARD);
      blockData.fill(0xFF); // Fill with 0xFF first
      
      // Set zone count in byte 0 (range: 1-28)
      // Byte 0: Zone count for this block (FUN_0047b800 writes this)
      // Bytes 1-15: Reserved/padding (0xFF)
      if (zonesInBlock > 0) {
        const zoneCount = Math.min(Math.max(zonesInBlock, 1), 28); // Clamp to 1-28
        blockData[0] = zoneCount;
        console.log(`[ZONE DEBUG] Set zone count in byte 0: ${zoneCount} zones for block ${blockIdx}`);
      } else {
        blockData[0] = 0; // No zones in this block
        console.log(`[ZONE DEBUG] Block ${blockIdx} has no zones, setting byte 0 to 0`);
      }
      
      // Bytes 1-15: Reserved/padding (already filled with 0xFF)
      
      // Preserve the original bytes 1-15 if available (to match original structure)
      if (originalBlockData) {
        blockData.set(originalBlockData.slice(1, 16), 1);
        console.log(`[ZONE DEBUG] Preserved original bytes 1-15 for block ${blockIdx}:`, 
          Array.from(originalBlockData.slice(1, 16)).map(b => `0x${b.toString(16).padStart(2, '0')}`).join(' '));
      }
      
      // Copy the zone data for this block (this will overwrite bytes 16+ with zone data)
      const sourceData = allZoneData.slice(zoneDataOffset, zoneDataOffset + BLOCK_SIZE.STANDARD);
      // Copy starting at offset 16 to preserve the header we just set
      blockData.set(sourceData.slice(16), 16);
      
      // Set metadata byte
      blockData[0xFFF] = block.metadata;
      
      // DEBUG: Compare original vs new block data (only if we have cached data)
      const blockComparison: {
        blockIndex: number;
        address: string;
        isIdentical: boolean;
        differences: number;
        differencePositions: number[];
        zoneComparisons: Array<{
          zoneNumber: number;
          offset: number;
          originalName: string;
          newName: string;
          originalChannelCount: number;
          newChannelCount: number;
          matches: boolean;
          originalHex: string;
          newHex: string;
        }>;
        metadataMatch: boolean;
        originalMetadata: number;
        newMetadata: number;
      } = {
        blockIndex: blockIdx,
        address: `0x${block.address.toString(16).padStart(6, '0')}`,
        isIdentical: false,
        differences: 0,
        differencePositions: [],
        zoneComparisons: [],
        metadataMatch: false,
        originalMetadata: 0,
        newMetadata: 0,
      };
      
      if (originalBlockData) {
        console.log(`\n[ZONE DEBUG] ===== Zone Block ${blockIdx} Comparison (Address: ${blockComparison.address}) =====`);
        
        // Compare byte by byte for the ENTIRE block (4096 bytes)
        for (let i = 0; i < BLOCK_SIZE.STANDARD; i++) {
          if (originalBlockData[i] !== blockData[i]) {
            blockComparison.differences++;
            if (blockComparison.differencePositions.length < 100) { // Store up to 100 differences
              blockComparison.differencePositions.push(i);
            }
          }
        }
        
        blockComparison.isIdentical = blockComparison.differences === 0;
        
        if (blockComparison.isIdentical) {
          console.log(`[ZONE DEBUG] ✓ Block ${blockIdx} is IDENTICAL to original (all ${BLOCK_SIZE.STANDARD} bytes match)`);
        } else {
          console.log(`[ZONE DEBUG] ✗ Block ${blockIdx} has ${blockComparison.differences} differences out of ${BLOCK_SIZE.STANDARD} bytes`);
          console.log(`[ZONE DEBUG] First ${Math.min(50, blockComparison.differencePositions.length)} difference positions:`, blockComparison.differencePositions.slice(0, 50));
          
          // Show detailed comparison for first few zones
          for (let zoneNum = 1; zoneNum <= 10; zoneNum++) { // Compare up to 10 zones
            const zoneOffset = OFFSET.ZONE_START + (zoneNum - 1) * BLOCK_SIZE.ZONE;
            if (zoneOffset + BLOCK_SIZE.ZONE <= BLOCK_SIZE.STANDARD) {
              const origZone = originalBlockData.slice(zoneOffset, zoneOffset + BLOCK_SIZE.ZONE);
              const newZone = blockData.slice(zoneOffset, zoneOffset + BLOCK_SIZE.ZONE);
              
              const origName = new TextDecoder('ascii', { fatal: false }).decode(origZone.slice(0, 11)).replace(/\x00/g, '').trim();
              const newName = new TextDecoder('ascii', { fatal: false }).decode(newZone.slice(0, 11)).replace(/\x00/g, '').trim();
              const origChCount = origZone[16];
              const newChCount = newZone[16];
              
              const zoneComp = {
                zoneNumber: zoneNum,
                offset: zoneOffset,
                originalName: origName,
                newName: newName,
                originalChannelCount: origChCount,
                newChannelCount: newChCount,
                matches: origName === newName && origChCount === newChCount,
                originalHex: Array.from(origZone).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' '),
                newHex: Array.from(newZone).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' '),
              };
              
              blockComparison.zoneComparisons.push(zoneComp);
              
              console.log(`[ZONE DEBUG] Zone ${zoneNum} (offset ${zoneOffset}):`);
              console.log(`  Original: name="${origName}", channels=${origChCount}`);
              console.log(`  New:      name="${newName}", channels=${newChCount}`);
              
              if (!zoneComp.matches) {
                console.log(`  ✗ MISMATCH!`);
                // Show hex comparison for first 32 bytes
                const origHex = Array.from(origZone.slice(0, 32)).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
                const newHex = Array.from(newZone.slice(0, 32)).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
                console.log(`  Original hex (first 32): ${origHex}`);
                console.log(`  New hex (first 32):       ${newHex}`);
              } else {
                console.log(`  ✓ Zone ${zoneNum} matches`);
              }
            }
          }
        }
        
        // Show metadata byte comparison
        blockComparison.originalMetadata = originalBlockData[0xFFF];
        blockComparison.newMetadata = blockData[0xFFF];
        blockComparison.metadataMatch = blockComparison.originalMetadata === blockComparison.newMetadata;
        
        if (!blockComparison.metadataMatch) {
          console.log(`[ZONE DEBUG] ✗ Metadata byte mismatch: original=0x${blockComparison.originalMetadata.toString(16)}, new=0x${blockComparison.newMetadata.toString(16)}`);
        } else {
          console.log(`[ZONE DEBUG] ✓ Metadata byte matches: 0x${blockComparison.originalMetadata.toString(16)}`);
        }
        
        console.log(`[ZONE DEBUG] ===== End Block ${blockIdx} Comparison =====\n`);
      }
      
      // Store comparison data for debug export
      this.zoneComparisonData.push(blockComparison);
        
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
        
      zoneDataOffset += BLOCK_SIZE.STANDARD;
    }

    // Generate scan list blocks - ALWAYS write scan lists when writing channels
    const scanBlocks = this.discoveredBlocks.filter(b => b.type === 'scan' && b.metadata === METADATA.SCAN_LIST);
    if (scanBlocks.length === 0) {
      throw new Error('No scan list blocks found');
    }

    // Encode scan lists (use provided scanLists or empty array)
    const scanListsToWrite = scanLists.length > 0 ? scanLists : [];
    const encodedScanLists = scanListsToWrite.map((scanList, idx) => encodeScanList(scanList, idx + 1));
      
      // Calculate total size needed
      let totalScanListSize = 0;
      for (let i = 0; i < scanListsToWrite.length; i++) {
        if (i < 44) {
          totalScanListSize = Math.max(totalScanListSize, OFFSET.SCAN_LIST_START + ((i + 1) * BLOCK_SIZE.SCAN_LIST));
        } else {
          const blockIndex = Math.floor((i - 44) / 44);
          const listIndexInBlock = (i - 44) % 44;
          const offset = (blockIndex * BLOCK_SIZE.STANDARD) + ((listIndexInBlock + 1) * BLOCK_SIZE.SCAN_LIST);
          totalScanListSize = Math.max(totalScanListSize, offset);
        }
      }
      const totalScanListBlocksNeeded = Math.ceil(totalScanListSize / BLOCK_SIZE.STANDARD);
      
      // Generate concatenated scan list data
      const allScanListData = new Uint8Array(totalScanListBlocksNeeded * BLOCK_SIZE.STANDARD);
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
      let scanListDataOffset = 0;
      for (let blockIdx = 0; blockIdx < scanBlocks.length; blockIdx++) {
        const block = scanBlocks[blockIdx];
        const blockData = allScanListData.slice(scanListDataOffset, scanListDataOffset + BLOCK_SIZE.STANDARD);
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
        
        scanListDataOffset += BLOCK_SIZE.STANDARD;
      }

    // Step 3: Prepare blocks to write - ONLY channels, zones, and scan lists
    // We should NOT write other configuration blocks (they remain unchanged)
    this.onProgress?.(50, 'Preparing blocks in write order...');
    
    const finalBlocksToWrite: Array<{ address: number; data: Uint8Array; metadata: number }> = [];
    
    // Only write blocks we actually changed:
    // 1. Channel blocks (metadata 0x12-0x41)
    // 2. Zone blocks (metadata 0x5c)
    // 3. Scan list blocks (metadata 0x11)
    
    // 1. Channel blocks: Only write blocks that contain channel data (in incrementing order)
    const channelBlocksToWrite = blocksToWrite
      .filter(b => b.metadata >= 0x12 && b.metadata <= 0x41)
      .sort((a, b) => a.metadata - b.metadata);
    
    for (const block of channelBlocksToWrite) {
      finalBlocksToWrite.push(block);
    }
    
    // 2. Zone blocks (metadata 0x5c)
    const zoneBlocksToWrite = blocksToWrite
      .filter(b => b.metadata === METADATA.ZONE)
      .sort((a, b) => a.address - b.address);
    
    for (const block of zoneBlocksToWrite) {
      finalBlocksToWrite.push(block);
    }
    
    // 3. Scan list blocks (metadata 0x11)
    const scanListBlocksToWrite = blocksToWrite
      .filter(b => b.metadata === METADATA.SCAN_LIST)
      .sort((a, b) => a.address - b.address);
    
    for (const block of scanListBlocksToWrite) {
      finalBlocksToWrite.push(block);
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
      const addressHex = `0x${block.address.toString(16).padStart(6, '0').toUpperCase()}`;
      
      console.log(`[WRITE ALL DATA] Writing block ${i + 1}/${finalBlocksToWrite.length}:`);
      console.log(`  Address: ${addressHex}`);
      console.log(`  Metadata: ${metadataHex}`);
      console.log(`  Data size: ${block.data.length} bytes`);
      console.log(`  Data preview (first 32 bytes): ${Array.from(block.data.slice(0, 32)).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ')}`);
      console.log(`  Metadata byte at 0xFFF: 0x${block.data[0xFFF].toString(16).padStart(2, '0').toUpperCase()}`);
      
      this.onProgress?.(progress, `Writing block ${i + 1} of ${finalBlocksToWrite.length} (${metadataHex})...`);
      
      // Verify connection is still valid before writing
      if (!this.connection) {
        throw new Error('Connection lost - cannot write block. Please reconnect and try again.');
      }
      
      try {
        await this.connection.writeMemory(block.address, block.data, block.metadata);
        console.log(`[WRITE ALL DATA] ✓ Successfully wrote block ${i + 1}/${finalBlocksToWrite.length} at ${addressHex}`);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(`[WRITE ALL DATA ERROR] ✗ Failed to write block ${i + 1}/${finalBlocksToWrite.length} at ${addressHex} (metadata: ${metadataHex}):`, errorMsg);
        console.error(`[WRITE ALL DATA ERROR] Block data size: ${block.data.length} bytes`);
        console.error(`[WRITE ALL DATA ERROR] Block data metadata byte: 0x${block.data[0xFFF].toString(16).padStart(2, '0').toUpperCase()}`);
        console.error(`[WRITE ALL DATA ERROR] Expected metadata: ${metadataHex}`);
        throw error;
      }
      
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

