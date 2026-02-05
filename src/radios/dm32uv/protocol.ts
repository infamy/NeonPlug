/**
 * DM-32UV Protocol Implementation
 * Main protocol interface implementation using Web Serial API
 */

import { DM32Connection } from './connection';
import { discoverMemoryBlocks, readChannelCount, type MemoryBlock } from './memory';
import { parseChannel, parseZones, parseScanLists, parseContactEntry, encodeChannel, encodeZone, encodeScanList, encodeContactEntry, parseRadioSettings, encodeRadioSettings, encodeDigitalEmergencies, encodeAnalogEmergencies, parseQuickMessages, parseDMRRadioIDs, encodeDMRRadioID, parseCalibration, parseRXGroups, parseQuickContacts, encodeQuickContacts, encodeQuickMessages, parseTxContactForChannel, encodeTxContactForChannel, encodeRXGroups } from './structures';
import type { RadioProtocol, RadioInfo } from '../../types/radio';
import type { Channel, Zone, Contact, RadioSettings, ScanList, DigitalEmergency, DigitalEmergencyConfig, AnalogEmergency, QuickTextMessage, DMRRadioID, Calibration, RXGroup, QuickContact } from '../../models';
import type { WebSerialPort, ProtocolDebugData } from './types';
import { METADATA, BLOCK_SIZE, OFFSET, VFRAME, CONNECTION, LIMITS } from './constants';
import { BOOT_IMAGE } from '../../utils/bootImage';
import { withTimeout } from './utils';
import { 
  requireConnection,
  requireRadioInfo,
  requireDiscoveredBlocks, 
  checkEmptyBlocks,
  readAndConcatenateBlocks,
  storeRawData,
} from './helpers';
import { log } from './logger';

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
  public rawContactBlocks: Map<number, Uint8Array> = new Map(); // All contact blocks by address
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
   * and enters programming mode.
   * 
   * @param options.forcePortSelection - If true, always show the serial port picker
   *   in the same user gesture. Use this for Read so the browser allows requestPort().
   *   If false, tries a previously granted port first (can fail outside user gesture on retry).
   * @throws {Error} If Web Serial API is not supported
   * @throws {Error} If port is already in use
   * @throws {Error} If connection handshake fails
   */
  async connect(portOrOptions?: string | { forcePortSelection?: boolean }): Promise<void> {
    const forcePortSelection =
      typeof portOrOptions === 'object' && portOrOptions != null && 'forcePortSelection' in portOrOptions
        ? portOrOptions.forcePortSelection
        : false;

    // Per-request timeouts handle each message/ack cycle (2s each, resets on response)
    // No overall connection timeout - each request/response has its own 2s timeout

    // Request serial port
    if (!('serial' in navigator)) {
      throw new Error('Web Serial API not supported. Please use Chrome/Edge.');
    }

    let port: WebSerialPort | null = null;
    let usedPreviouslyGrantedPort = false;

    // Get port: either force picker (same user gesture) or try previously granted first
    try {
      port = await this.getOrSelectPort(forcePortSelection);
      if (port && !forcePortSelection) {
        const grantedPorts = await (navigator as any).serial.getPorts();
        if (grantedPorts && grantedPorts.length > 0 && grantedPorts.includes(port)) {
          usedPreviouslyGrantedPort = true;
        }
      }
    } catch (e: unknown) {
      const error = e as Error;
      if (error.message && error.message.includes('cancelled')) {
        throw error;
      }
      throw error;
    }

    // Try to connect with the port
    try {
      await this.connectWithPort(port!);
    } catch (connectError: unknown) {
      // If we used a previously granted port and it failed, do NOT call requestPort() here:
      // we're in a catch block, outside the user gesture, so the browser would block it.
      if (usedPreviouslyGrantedPort && port) {
        log.warn('Connection failed with previously granted port', 'Protocol', connectError);
        this.port = null;
        try {
          if (port && (port.readable || port.writable)) {
            await port.close();
          }
        } catch (closeError) {
          log.warn('Error closing failed port', 'Protocol', closeError);
        }
        const msg = connectError instanceof Error ? connectError.message : String(connectError);
        throw new Error(
          `Connection failed: ${msg} Please click the Read/Write button again and select the correct serial port when prompted.`
        );
      }
      throw connectError;
    }
  }

  async getOrSelectPort(forceSelection: boolean = false): Promise<WebSerialPort> {
    // Clear any previous cached data before starting a new connection
    // BUT: If we already have cached data (from restoreCacheFromStore), don't clear it
    // This happens when we're doing a write operation and have restored the cache
    const hasRestoredCache = this.cachedBlockData.length > 0 || this.discoveredBlocks.length > 0;
    if (!hasRestoredCache) {
      this.clearCache();
    } else {
      log.debug('Preserved cached data during port selection (write operation with restored cache)', 'Protocol');
    }

    // If forcing selection, skip all reuse logic and go straight to prompt
    if (forceSelection) {
      log.debug('Forcing port selection (port will be prompted)', 'Protocol');
      this.port = null; // Ensure port is cleared
      // Skip to prompt section below
    }

    let port: WebSerialPort | null = null;
    
    // FIRST: Try to reuse previously granted ports (autodetection)
    // This matches Momentum Firmware's behavior - seamless connection if port was previously granted
    if (!forceSelection) {
      try {
        const grantedPorts = await (navigator as any).serial.getPorts();
        if (grantedPorts && grantedPorts.length > 0) {
          // Try to use the first previously granted port (most recent)
          port = grantedPorts[0] as WebSerialPort;
          this.port = port;
          log.debug(`Found previously granted port (${grantedPorts.length} available), attempting to use...`, 'Protocol');
          
          // Check if port is already open and ready
          const isAlreadyOpen = port.readable !== null && port.writable !== null;
          const streamsLocked = port.readable?.locked || port.writable?.locked;
          
          if (isAlreadyOpen && !streamsLocked) {
            // Port is ready to use
            log.debug('Previously granted port is ready to use', 'Protocol');
            return port;
          } else if (!isAlreadyOpen) {
            // Try to open the port
            try {
              await withTimeout(
                port.open({ baudRate: CONNECTION.BAUD_RATE }),
                CONNECTION.TIMEOUT.PORT_OPEN,
                'Port open'
              );
              log.debug('Successfully opened previously granted port', 'Protocol');
              return port;
            } catch (e: unknown) {
              const error = e as Error;
              log.warn('Failed to open previously granted port, will prompt for new port', 'Protocol', error);
              port = null;
              this.port = null;
              // Fall through to prompt
            }
          } else {
            // Streams are locked, can't use this port
            log.warn('Previously granted port has locked streams, will prompt for new port', 'Protocol');
            port = null;
            this.port = null;
            // Fall through to prompt
          }
        } else {
          // No previously granted ports - will prompt below
          log.debug('No previously granted ports found, will prompt for port selection', 'Protocol');
        }
      } catch (e: unknown) {
        log.warn('Failed to get previously granted ports, will prompt for port selection', 'Protocol', e);
        port = null;
        // Fall through to prompt
      }
    }
    
    // SECOND: If we have a stored port instance, try to reuse it (fallback)
    if (!forceSelection && !port && this.port) {
      port = this.port;
      log.debug('Attempting to reuse stored port instance...', 'Protocol');
      
      const isAlreadyOpen = port.readable !== null && port.writable !== null;
      const streamsLocked = port.readable?.locked || port.writable?.locked;
      
      if (isAlreadyOpen && !streamsLocked) {
        log.debug('Stored port is ready to use', 'Protocol');
        return port;
      } else if (!isAlreadyOpen) {
        try {
          await withTimeout(
            port.open({ baudRate: CONNECTION.BAUD_RATE }),
            CONNECTION.TIMEOUT.PORT_OPEN,
            'Port reopen'
          );
          log.debug('Successfully reopened stored port', 'Protocol');
          return port;
        } catch (e: unknown) {
          const error = e as Error;
          log.warn('Failed to reopen stored port, will prompt for new port', 'Protocol', error);
          port = null;
          this.port = null;
          // Fall through to prompt
        }
      } else {
        log.warn('Stored port has locked streams, will prompt for new port', 'Protocol');
        port = null;
        this.port = null;
        // Fall through to prompt
      }
    }
    
    // FINALLY: Prompt for port if we don't have a usable one, or if forcing selection
    // This happens if: no previously granted ports, previously granted port failed, or forceSelection=true
    if (forceSelection || !port) {
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
        // If it's a user gesture error, provide a helpful message
        if (error.message && error.message.includes('user gesture')) {
          throw new Error('Please click the button directly to connect. The browser requires a direct user action to access the serial port.');
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
        log.debug('Port is already open, will use existing connection', 'Protocol');
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
            log.debug('Port opened by another process, will use existing connection', 'Protocol');
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
   * Get all debug data in a type-safe way
   * This replaces the need for (protocol as any) casts
   */
  getDebugData(): ProtocolDebugData {
    return {
      rawChannelData: this.rawChannelData,
      rawZoneData: this.rawZoneData,
      rawContactBlockData: this.rawContactBlockData,
      rawContactBlockAddress: this.rawContactBlockAddress,
      rawContactBlocks: this.rawContactBlocks,
      rawScanListData: this.rawScanListData,
      rawRadioSettingsData: this.rawRadioSettingsData,
      rawDigitalEmergencyData: this.rawDigitalEmergencyData,
      rawAnalogEmergencyData: this.rawAnalogEmergencyData,
      rawMessageData: this.rawMessageData,
      rawDMRRadioIDData: this.rawDMRRadioIDData,
      rawRXGroupData: this.rawRXGroupData,
      blockMetadata: this.blockMetadata,
      blockData: this.blockData,
      writeBlockData: this.writeBlockData,
      zoneComparisonData: this.zoneComparisonData,
      allBlockMetadata: (this as any).allBlockMetadata || new Map(),
      allBlockData: (this as any).allBlockData || new Map(),
      cachedBlockData: this.cachedBlockData,
      discoveredBlocks: this.discoveredBlocks,
    };
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
    // Note: allBlockData will be set after all blocks are read (see end of bulkReadRequiredBlocks)

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
        log.info(`Channel count: ${channelCount}`, 'Protocol');
        
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
      METADATA.DIGITAL_EMERGENCY,    // Digital Emergency Systems (0x10, same block as encryption keys)
      METADATA.ANALOG_EMERGENCY,     // Analog Emergency Systems (0x10)
      METADATA.METADATA_0x41,        // Metadata block 0x41 - REQUIRED
      METADATA.QUICK_MESSAGES,       // Quick Messages (0x0A)
      METADATA.METADATA_0x0B,        // Metadata block 0x0B
      METADATA.DMR_RADIO_IDS,        // DMR Radio IDs (0x67)
      METADATA.CALIBRATION,          // Calibration (0x02)
      METADATA.RX_GROUPS,            // RX Groups (0x0F)
      METADATA.METADATA_0x44,        // Metadata block 0x44 (Talk Groups data)
      METADATA.METADATA_0x06,        // Metadata block 0x06 (Config section 4 - Talk Groups counter)
      METADATA.TX_CONTACT_LOW,       // TX Contact block 0x42 (channels 1-2048)
      METADATA.TX_CONTACT_HIGH,      // TX Contact block 0x43 (channels 2049+ and VFOs)
    ];

    for (const metadata of fixedMetadataBlocks) {
      const block = blocks.find(b => b.metadata === metadata);
      if (block) {
        // Log if block is marked as unknown - we still need to read it
        if (block.type === 'unknown') {
          log.info(`Found required metadata block 0x${metadata.toString(16)} at 0x${block.address.toString(16).padStart(6, '0').toUpperCase()} (marked as unknown type, but will read)`, 'Protocol');
        }
        blocksToRead.push(block);
      } else {
        // Warn if required block is missing (especially 0x04, 0x42, 0x43, 0x44, 0x0B)
        const metadataNum = metadata as number;
        const isCritical = metadataNum === METADATA.VFO_SETTINGS || 
                           metadataNum === METADATA.TX_CONTACT_LOW || 
                           metadataNum === METADATA.TX_CONTACT_HIGH ||
                           metadataNum === METADATA.METADATA_0x44 ||
                           metadataNum === METADATA.METADATA_0x0B;
        if (isCritical) {
          log.warn(`CRITICAL metadata block 0x${metadata.toString(16)} not found during discovery! This block is required for TG mapping.`, 'Protocol');
        } else if (metadataNum === METADATA.VFO_SETTINGS) {
          log.warn('Radio Settings block (metadata 0x04) not found during discovery! This block is required.', 'Protocol');
        } else {
          log.debug(`Metadata block 0x${metadata.toString(16)} not found (optional)`, 'Protocol');
        }
      }
    }
    
    // Verify 0x04 block is included
    const vfoBlock = blocksToRead.find(b => b.metadata === METADATA.VFO_SETTINGS);
    if (!vfoBlock) {
      log.error('Radio Settings block (metadata 0x04) is missing from blocks to read!', 'Protocol');
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
    log.info(`Bulk reading ${finalBlocksToRead.length} blocks (channels, zones, scan lists, and fixed metadata blocks)`, 'Protocol');

    // Step 3: Read ALL required blocks upfront into cachedBlockData array
    // This is the ONLY place we read blocks from the radio
    this.onProgress?.(10, `Reading ${finalBlocksToRead.length} blocks...`);
    this.cachedBlockData = [];

    for (let i = 0; i < finalBlocksToRead.length; i++) {
      const block = finalBlocksToRead[i];
      const progress = 10 + Math.floor((i / finalBlocksToRead.length) * 85); // 10-95%
      const addressHex = `0x${block.address.toString(16).padStart(6, '0').toUpperCase()}`;
      const metadataHex = `0x${block.metadata.toString(16).padStart(2, '0')}`;
      this.onProgress?.(progress, `Reading block ${i + 1} of ${finalBlocksToRead.length} (metadata ${metadataHex} at ${addressHex})...`);

      try {
        const blockData = await this.connection!.readMemory(block.address, BLOCK_SIZE.STANDARD);
        
        // Verify we got exactly 4096 bytes
        if (blockData.length !== BLOCK_SIZE.STANDARD) {
          log.warn(`Block at ${addressHex} (metadata ${metadataHex}) has incorrect length: ${blockData.length} bytes (expected ${BLOCK_SIZE.STANDARD})`, 'Protocol');
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

        // IMPORTANT: Set rawRadioSettingsData when we read block 0x04
        // This is required for writeRadioSettings() to preserve unknown fields
        if (block.metadata === METADATA.VFO_SETTINGS) {
          this.rawRadioSettingsData = blockDataCopy;
          log.debug('Set rawRadioSettingsData from block 0x04 during bulk read', 'Protocol');
        }
        
        log.debug(`Successfully read block at ${addressHex} (metadata ${metadataHex}, type: ${block.type})`, 'Protocol');
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        // For required fixed metadata blocks, this is a critical error
        const isRequired = (fixedMetadataBlocks as number[]).includes(block.metadata);
        if (isRequired) {
          log.error(`Failed to read REQUIRED block at ${addressHex} (metadata ${metadataHex}, type: ${block.type}). Error: ${errorMsg}`, 'Protocol');
          throw new Error(`Failed to read required metadata block 0x${metadataHex} at ${addressHex}: ${errorMsg}`);
        } else {
          log.warn(`Failed to read optional block at ${addressHex} (metadata ${metadataHex}, type: ${block.type}). Error: ${errorMsg}. Continuing...`, 'Protocol');
          // For optional blocks, continue but log the failure
        }
      }

      // Small delay between reads
      if (i < finalBlocksToRead.length - 1) {
        await new Promise(resolve => setTimeout(resolve, CONNECTION.BLOCK_READ_DELAY));
      }
    }

    this.onProgress?.(100, `Successfully cached ${this.cachedBlockData.length} blocks`);
    log.info(`Bulk read complete: ${this.cachedBlockData.length} blocks cached`, 'Protocol');
    
    // Verify critical blocks for TG mapping are cached
    const txContact42 = this.cachedBlockData.find(b => b.metadata === METADATA.TX_CONTACT_LOW);
    const txContact43 = this.cachedBlockData.find(b => b.metadata === METADATA.TX_CONTACT_HIGH);
    const talkGroups44 = this.cachedBlockData.find(b => b.metadata === METADATA.METADATA_0x44);
    const quickAccess0B = this.cachedBlockData.find(b => b.metadata === METADATA.METADATA_0x0B);
    
    if (!txContact42) {
      log.warn('TX Contact block 0x42 (channels 1-2048) not in cache after read! TG mapping may fail.', 'Protocol');
    } else {
      log.debug(`TX Contact block 0x42 cached at 0x${txContact42.address.toString(16).padStart(6, '0').toUpperCase()}`, 'Protocol');
    }
    if (!txContact43) {
      log.warn('TX Contact block 0x43 (channels 2049+ and VFOs) not in cache after read! TG mapping may fail.', 'Protocol');
    } else {
      log.debug(`TX Contact block 0x43 cached at 0x${txContact43.address.toString(16).padStart(6, '0').toUpperCase()}`, 'Protocol');
    }
    if (!talkGroups44) {
      log.warn('Talk Groups block 0x44 not in cache after read! TG mapping may fail.', 'Protocol');
    } else {
      log.debug(`Talk Groups block 0x44 cached at 0x${talkGroups44.address.toString(16).padStart(6, '0').toUpperCase()}`, 'Protocol');
    }
    if (!quickAccess0B) {
      log.warn('Quick Access Contact List block 0x0B not in cache after read! TG mapping may fail.', 'Protocol');
    } else {
      log.debug(`Quick Access Contact List block 0x0B cached at 0x${quickAccess0B.address.toString(16).padStart(6, '0').toUpperCase()}`, 'Protocol');
    }
    
    log.debug('All blocks are now in cache - parsing can proceed without additional radio reads', 'Protocol');
    
    // Update allBlockData after all blocks are read (for store persistence)
    // This is critical - the store needs this data for cache restoration during writes
    (this as any).allBlockData = new Map(this.blockData); // Create a new Map to ensure it's a copy
    log.info(`Set allBlockData with ${this.blockData.size} blocks for store persistence (allBlockMetadata has ${(this as any).allBlockMetadata?.size || 0} entries)`, 'Protocol');
    
    // Verify critical blocks are in allBlockData
    const tx42Addr = this.discoveredBlocks.find(b => b.metadata === METADATA.TX_CONTACT_LOW)?.address;
    const tx43Addr = this.discoveredBlocks.find(b => b.metadata === METADATA.TX_CONTACT_HIGH)?.address;
    const tg44Addr = this.discoveredBlocks.find(b => b.metadata === METADATA.METADATA_0x44)?.address;
    const qa0BAddr = this.discoveredBlocks.find(b => b.metadata === METADATA.METADATA_0x0B)?.address;
    
    if (tx42Addr && !this.blockData.has(tx42Addr)) log.warn(`TX Contact 0x42 block at 0x${tx42Addr.toString(16).padStart(6, '0').toUpperCase()} not in blockData!`, 'Protocol');
    if (tx43Addr && !this.blockData.has(tx43Addr)) log.warn(`TX Contact 0x43 block at 0x${tx43Addr.toString(16).padStart(6, '0').toUpperCase()} not in blockData!`, 'Protocol');
    if (tg44Addr && !this.blockData.has(tg44Addr)) log.warn(`Talk Groups 0x44 block at 0x${tg44Addr.toString(16).padStart(6, '0').toUpperCase()} not in blockData!`, 'Protocol');
    if (qa0BAddr && !this.blockData.has(qa0BAddr)) log.warn(`Quick Access 0x0B block at 0x${qa0BAddr.toString(16).padStart(6, '0').toUpperCase()} not in blockData!`, 'Protocol');
    
    // Step 4: Disconnect from radio - we have all the data we need
    // Parsing will happen from cached blocks, no connection needed
    // Disconnect silently (no progress message needed)
    await this.disconnect();
    log.debug('Connection closed - all data is cached and ready for parsing', 'Protocol');
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
    // If we restored from cache, we already have discoveredBlocks, so skip discovery
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
        log.info(`Channel count: ${channelCount}`, 'Protocol');
        
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
      METADATA.METADATA_0x0B,
      METADATA.DMR_RADIO_IDS,
      METADATA.CALIBRATION,
      METADATA.RX_GROUPS,
      METADATA.METADATA_0x44,        // Talk Groups data
      METADATA.METADATA_0x06,        // Talk Groups counter
      METADATA.TX_CONTACT_LOW,       // TX Contact block 0x42 (channels 1-2048)
      METADATA.TX_CONTACT_HIGH,      // TX Contact block 0x43 (channels 2049+ and VFOs)
    ];

    for (const metadata of fixedMetadataBlocks) {
      const block = this.discoveredBlocks.find(b => b.metadata === metadata);
      if (block) {
        // Skip only empty blocks - we need to read unknown blocks if they have the right metadata
        // Unknown just means we don't recognize the type, but if it has the metadata we need, try to read it
        if (block.type === 'empty') {
          log.warn(`Fixed metadata block 0x${metadata.toString(16)} at 0x${block.address.toString(16).padStart(6, '0').toUpperCase()} is empty, skipping`, 'Protocol');
          continue;
        }
        if (block.type === 'unknown') {
          log.info(`Fixed metadata block 0x${metadata.toString(16)} at 0x${block.address.toString(16).padStart(6, '0').toUpperCase()} is marked unknown but has required metadata, will attempt to read`, 'Protocol');
        }
        blocksToRead.push(block);
      }
    }

    // Step 2c: Add zone and scan list blocks (filter out empty/unknown)
    const zoneBlocks = this.discoveredBlocks.filter(b => b.type === 'zone');
    const scanBlocks = this.discoveredBlocks.filter(b => b.type === 'scan');
    blocksToRead.push(...zoneBlocks);
    blocksToRead.push(...scanBlocks);

    // Step 2d: Add other data type blocks (filter out empty/unknown)
    const messageBlocks = this.discoveredBlocks.filter(b => b.type === 'message');
    const dmrRadioIdBlocks = this.discoveredBlocks.filter(b => b.type === 'dmrradioid');
    const rxGroupBlocks = this.discoveredBlocks.filter(b => b.type === 'rxgroup');
    blocksToRead.push(...messageBlocks);
    blocksToRead.push(...dmrRadioIdBlocks);
    blocksToRead.push(...rxGroupBlocks);

    // Remove duplicates and filter out empty/unknown blocks
    // BUT: Keep required fixed metadata blocks even if marked unknown (we need them for writes)
    const requiredMetadataSet = new Set<number>(fixedMetadataBlocks);
    const uniqueBlocks = new Map<number, MemoryBlock>();
    for (const block of blocksToRead) {
      // Skip empty blocks - they're not readable
      if (block.type === 'empty') {
        log.debug(`Skipping empty block at 0x${block.address.toString(16).padStart(6, '0').toUpperCase()} (metadata 0x${block.metadata.toString(16)})`, 'Protocol');
        continue;
      }
      // Skip unknown blocks UNLESS they're required fixed metadata blocks (we need them for writes)
      if (block.type === 'unknown' && !requiredMetadataSet.has(block.metadata)) {
        log.debug(`Skipping unknown block at 0x${block.address.toString(16).padStart(6, '0').toUpperCase()} (metadata 0x${block.metadata.toString(16)})`, 'Protocol');
        continue;
      }
      uniqueBlocks.set(block.address, block);
    }

    const finalBlocksToRead = Array.from(uniqueBlocks.values());
    
    // Log all blocks we're planning to read for debugging
    log.debug(`Blocks to read: ${finalBlocksToRead.map(b => `0x${b.address.toString(16).padStart(6, '0').toUpperCase()} (metadata 0x${b.metadata.toString(16)}, type ${b.type})`).join(', ')}`, 'Protocol');
    
    // Step 3: Check which blocks are already cached and only read missing ones
    const blocksToReadFromRadio: MemoryBlock[] = [];
    
    const cachedAddresses = new Set(this.cachedBlockData.map(b => b.address));
    
    for (const block of finalBlocksToRead) {
      if (!cachedAddresses.has(block.address)) {
        blocksToReadFromRadio.push(block);
      }
    }
    
    if (blocksToReadFromRadio.length === 0) {
      log.info(`All ${finalBlocksToRead.length} required blocks are already cached, skipping read`, 'Protocol');
      this.onProgress?.(100, `Using ${this.cachedBlockData.length} cached blocks`);
      return;
    }
    
    log.info(`Reading ${blocksToReadFromRadio.length} missing blocks (${finalBlocksToRead.length - blocksToReadFromRadio.length} already cached)`, 'Protocol');

    // Step 4: Read only missing blocks
    this.onProgress?.(10, `Reading ${blocksToReadFromRadio.length} missing blocks...`);

    for (let i = 0; i < blocksToReadFromRadio.length; i++) {
      const block = blocksToReadFromRadio[i];
      const progress = 10 + Math.floor((i / blocksToReadFromRadio.length) * 85); // 10-95%
      const addressHex = `0x${block.address.toString(16).padStart(6, '0').toUpperCase()}`;
      const metadataHex = `0x${block.metadata.toString(16).padStart(2, '0')}`;
      log.debug(`Reading block ${i + 1}/${blocksToReadFromRadio.length}: address=${addressHex}, metadata=${metadataHex}, type=${block.type}`, 'Protocol');
      this.onProgress?.(progress, `Reading block ${i + 1} of ${blocksToReadFromRadio.length} (metadata ${metadataHex} at ${addressHex})...`);

      const blockData = await this.connection!.readMemory(block.address, BLOCK_SIZE.STANDARD);
      
      // IMPORTANT: Create a copy of the data to prevent corruption if the buffer is reused
      const blockDataCopy = new Uint8Array(blockData);
      
      this.cachedBlockData.push({
        metadata: block.metadata,
        address: block.address,
        data: blockDataCopy,
      });

      this.blockData.set(block.address, blockDataCopy);

      // IMPORTANT: Set rawRadioSettingsData when we read block 0x04
      // This is required for writeRadioSettings() to preserve unknown fields
      if (block.metadata === METADATA.VFO_SETTINGS) {
        this.rawRadioSettingsData = blockDataCopy;
        log.debug('Set rawRadioSettingsData from block 0x04 during bulk read', 'Protocol');
      }

      if (i < blocksToReadFromRadio.length - 1) {
        await new Promise(resolve => setTimeout(resolve, CONNECTION.BLOCK_READ_DELAY));
      }
    }

    this.onProgress?.(100, `Successfully cached ${this.cachedBlockData.length} blocks`);
    log.info(`Bulk read complete: ${this.cachedBlockData.length} blocks cached (${blocksToReadFromRadio.length} newly read, ${finalBlocksToRead.length - blocksToReadFromRadio.length} reused from cache)`, 'Protocol');
    log.debug('All blocks are now in cache - connection remains open for writing', 'Protocol');
    // NOTE: We do NOT disconnect here - connection must stay open for writing
  }

  /**
   * Restore cached block data from store (blockData and blockMetadata)
   * Used when creating a new protocol instance for writing after a previous read
   */
  restoreCacheFromStore(blockData: Map<number, Uint8Array>, blockMetadata: Map<number, { metadata: number; type: string }>): void {
    this.cachedBlockData = [];
    this.blockData = new Map(blockData);
    
    log.info(`Restoring cache from store: ${blockData.size} block data entries, ${blockMetadata.size} metadata entries`, 'Protocol');
    
    // Reconstruct cachedBlockData from blockData and blockMetadata
    for (const [address, data] of blockData.entries()) {
      const metadata = blockMetadata.get(address);
      if (metadata) {
        this.cachedBlockData.push({
          metadata: metadata.metadata,
          address: address,
          data: new Uint8Array(data), // Create a copy
        });
      } else {
        log.warn(`Block at 0x${address.toString(16).padStart(6, '0').toUpperCase()} has data but no metadata in store`, 'Protocol');
      }
    }
    
    // Also restore discoveredBlocks from blockMetadata
    this.discoveredBlocks = [];
    for (const [address, meta] of blockMetadata.entries()) {
      this.discoveredBlocks.push({
        address: address,
        metadata: meta.metadata,
        type: meta.type as MemoryBlock['type'],
      });
    }
    
    // Verify critical blocks for TG mapping
    const txContact42 = this.cachedBlockData.find(b => b.metadata === METADATA.TX_CONTACT_LOW);
    const txContact43 = this.cachedBlockData.find(b => b.metadata === METADATA.TX_CONTACT_HIGH);
    const talkGroups44 = this.cachedBlockData.find(b => b.metadata === METADATA.METADATA_0x44);
    const quickAccess0B = this.cachedBlockData.find(b => b.metadata === METADATA.METADATA_0x0B);
    
    // IMPORTANT: Restore rawRadioSettingsData from block 0x04 (VFO_SETTINGS)
    // This is required for writeRadioSettings() to preserve unknown fields
    const radioSettingsBlock = this.cachedBlockData.find(b => b.metadata === METADATA.VFO_SETTINGS);
    if (radioSettingsBlock && radioSettingsBlock.data.length >= 0x1000) {
      this.rawRadioSettingsData = new Uint8Array(radioSettingsBlock.data); // Create a copy
      log.debug('Restored rawRadioSettingsData from block 0x04 during cache restore', 'Protocol');
    } else {
      log.warn('Radio Settings block (0x04) not found in restored cache - writeRadioSettings will fail if called', 'Protocol');
    }
    
    log.info(`Restored ${this.cachedBlockData.length} blocks from store cache`, 'Protocol');
    if (!txContact42 || !txContact43 || !talkGroups44 || !quickAccess0B) {
      log.warn('Some critical blocks for TG mapping are missing from restored cache!', 'Protocol');
    }
  }

  /**
   * Get boot image base address from V-Frame 0x0E (first 4 bytes LE). Fallback 0x150000.
   */
  private getBootImageBaseAddress(): number {
    const vframe0e = this.radioInfo?.vframes.get(0x0e);
    if (vframe0e && vframe0e.length >= 4) {
      return this.readUint32LE(vframe0e, 0);
    }
    return BOOT_IMAGE.DEFAULT_BASE_ADDRESS;
  }

  /**
   * Read boot/startup image from radio. Base address from V-Frame 0x0E (e.g. 0x150000).
   * Reads 37×4KB + 1×2048 = 153600 bytes raw BGR565. No extra OEM read sequence (avoids radio reboot).
   */
  async readBootImage(): Promise<Uint8Array> {
    if (!this.connection) {
      throw new Error('Not connected to radio');
    }
    if (!this.radioInfo) {
      throw new Error('Radio info required (V-Frame 0x0E for base address)');
    }
    const baseAddr = this.getBootImageBaseAddress();
    const totalSize = BOOT_IMAGE.SIZE;
    this.onProgress?.(0, 'Reading boot image...');
    const allData = new Uint8Array(totalSize);
    let offset = 0;
    const fullBlocks = BOOT_IMAGE.FULL_BLOCKS;
    for (let i = 0; i < fullBlocks; i++) {
      const progress = Math.floor((i / BOOT_IMAGE.BLOCKS) * 100);
      this.onProgress?.(progress, `Reading boot image block ${i + 1} of ${BOOT_IMAGE.BLOCKS}...`);
      const addr = baseAddr + i * BLOCK_SIZE.STANDARD;
      const chunk = await this.connection!.readMemory(addr, BLOCK_SIZE.STANDARD);
      allData.set(chunk, offset);
      offset += chunk.length;
      await new Promise((r) => setTimeout(r, CONNECTION.BLOCK_READ_DELAY));
    }
    this.onProgress?.(95, `Reading boot image block ${BOOT_IMAGE.BLOCKS} of ${BOOT_IMAGE.BLOCKS}...`);
    const lastAddr = baseAddr + fullBlocks * BLOCK_SIZE.STANDARD;
    const lastChunk = await this.connection!.readMemory(lastAddr, BOOT_IMAGE.LAST_CHUNK_SIZE);
    allData.set(lastChunk, offset);
    this.onProgress?.(100, 'Boot image read complete');
    return allData;
  }

  /**
   * Write boot/startup image to radio. Base address from V-Frame 0x0E.
   * Payload must be 153600 bytes raw BGR565. 37×4KB + 1×2048.
   */
  async writeBootImage(data: Uint8Array): Promise<void> {
    if (!this.connection) {
      throw new Error('Not connected to radio');
    }
    if (data.length !== BOOT_IMAGE.SIZE) {
      throw new Error(
        `Boot image must be ${BOOT_IMAGE.SIZE} bytes, got ${data.length}`
      );
    }
    const baseAddr = this.getBootImageBaseAddress();
    const fullBlocks = BOOT_IMAGE.FULL_BLOCKS;
    for (let i = 0; i < fullBlocks; i++) {
      const progress = Math.floor(((i + 1) / BOOT_IMAGE.BLOCKS) * 100);
      this.onProgress?.(progress, `Writing boot image block ${i + 1} of ${BOOT_IMAGE.BLOCKS}...`);
      const addr = baseAddr + i * BLOCK_SIZE.STANDARD;
      const block = data.slice(i * BLOCK_SIZE.STANDARD, (i + 1) * BLOCK_SIZE.STANDARD);
      await this.connection!.writeMemory(addr, block, block[0xfff] ?? 0);
      await new Promise((r) => setTimeout(r, CONNECTION.BLOCK_READ_DELAY));
    }
    this.onProgress?.(99, `Writing boot image block ${BOOT_IMAGE.BLOCKS} of ${BOOT_IMAGE.BLOCKS}...`);
    const lastAddr = baseAddr + fullBlocks * BLOCK_SIZE.STANDARD;
    const lastBlock = data.slice(fullBlocks * BLOCK_SIZE.STANDARD, BOOT_IMAGE.SIZE);
    await this.connection!.writeMemoryBlock(lastAddr, lastBlock);
    this.onProgress?.(100, 'Boot image write complete');
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
        log.warn(`Block at address 0x${block.address.toString(16)} not found in cache`, 'Protocol');
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

    // Read channel count from first 2 bytes (little-endian)
    const channelCount = firstBlockData.data[0] | (firstBlockData.data[1] << 8);
    log.info(`Channel count: ${channelCount}`, 'Protocol');

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
    
    log.info(`Parsing ${blocksToParse.length} cached channel blocks for ${channelCount} channels`, 'Protocol');

    // Get TX Contact blocks (0x42 and 0x43) for setting talkGroupId on digital channels
    const txContactBlock42 = this.cachedBlockData.find(b => b.metadata === METADATA.TX_CONTACT_LOW);
    const txContactBlock43 = this.cachedBlockData.find(b => b.metadata === METADATA.TX_CONTACT_HIGH);
    const block42Data = txContactBlock42?.data || null;
    const block43Data = txContactBlock43?.data || null;
    
    if (block42Data) {
      log.debug(`Found TX Contact block 0x42 (${block42Data.length} bytes)`, 'Protocol');
    } else {
      log.debug('TX Contact block 0x42 not found - contactId will be 0', 'Protocol');
    }
    if (block43Data) {
      log.debug(`Found TX Contact block 0x43 (${block43Data.length} bytes)`, 'Protocol');
    } else {
      log.debug('TX Contact block 0x43 not found - contactId for high channels/VFOs will use legacy', 'Protocol');
    }

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
        log.warn(`No cached data for block with metadata 0x${block.metadata.toString(16)} at 0x${block.address.toString(16)}`, 'Protocol');
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
      
      log.debug(`Processing block metadata 0x${block.metadata.toString(16)} at 0x${block.address.toString(16)}, isFirst: ${isFirstBlock}, startOffset: 0x${startOffset.toString(16)}, maxOffset: 0x${maxOffset.toString(16)}`, 'Protocol');

      for (let offset = startOffset; offset <= maxOffset; offset += BLOCK_SIZE.CHANNEL) {
        // Stop if we've reached the channel count
        if (channelIndex > channelCount) {
          log.debug(`Reached channel count limit (${channelCount}), stopping`, 'Protocol');
          break;
        }

        try {
          const channelData = blockDataBytes.slice(offset, offset + BLOCK_SIZE.CHANNEL);
          if (channelData.length < BLOCK_SIZE.CHANNEL) {
            log.warn(`Incomplete channel data at block 0x${block.address.toString(16)} offset 0x${offset.toString(16)}`, 'Protocol');
            break;
          }
          
          // Check if channel is empty (all 0xFF or all 0x00)
          const isEmpty = channelData.every(b => b === 0xFF || b === 0x00);
          if (isEmpty) {
            log.debug(`Skipping empty channel ${channelIndex}`, 'Protocol');
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
          
          // Apply TX Contact from blocks 0x42/0x43 for digital channels
          // Note: Byte 0x2B is the DMR Radio ID Index for TX, not the contact ID
          const isDigitalMode = channel.mode === 'Digital' || channel.mode === 'Fixed Digital';
          if (isDigitalMode && (block42Data || block43Data)) {
            const txContact = parseTxContactForChannel(channelIndex, block42Data, block43Data);
            if (txContact) {
              channel.contactId = txContact.contactId;
              log.verbose?.(`Channel ${channelIndex}: TX Contact from block = ${txContact.contactId}`, 'Protocol');
            }
          }
          
          channels.push(channel);
          channelIndex++;

          // Update progress more frequently (every 10 channels instead of 50)
          if (channelIndex % 10 === 0 || channelIndex === channelCount) {
            const parseProgress = 10 + ((channelIndex / channelCount) * 90); // 10-100%
            this.onProgress?.(parseProgress, `Parsed ${channelIndex} of ${channelCount} channels...`);
          }
        } catch (error) {
          log.error(`Error parsing channel ${channelIndex} at block 0x${block.address.toString(16)} offset 0x${offset.toString(16)}`, 'Protocol', error);
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

    log.info(`Successfully parsed ${channels.length} channels (expected ${channelCount})`, 'Protocol');
    this.onProgress?.(100, `Successfully read ${channels.length} channels`);
    
    // Store raw data in a property for retrieval
    this.rawChannelData = rawChannelData;
    
    return channels;
  }

  /**
   * Generate channel blocks for writing
   * 
   * Encodes channels to binary format and generates the appropriate memory blocks.
   * Updates the channel count in the first block header.
   * 
   * @param channels Array of channels to write
   * @returns Array of blocks to write (address, data, metadata)
   * @throws {Error} If channel count exceeds maximum (4000)
   */
  private generateChannelBlocks(channels: Channel[]): Array<{ address: number; data: Uint8Array; metadata: number }> {
    if (channels.length === 0) {
      return [];
    }
    
    if (channels.length > 4000) {
      throw new Error(`Too many channels: ${channels.length} (maximum 4000)`);
    }

    // Get channel blocks, sorted by metadata
    const channelBlocks = this.discoveredBlocks
      .filter(b => b.type === 'channel')
      .sort((a, b) => a.metadata - b.metadata);

    if (channelBlocks.length === 0) {
      throw new Error('No channel blocks found');
    }

    const firstChannelBlock = channelBlocks.find(b => b.metadata === METADATA.CHANNEL_FIRST);
    if (!firstChannelBlock) {
      throw new Error(`First channel block (metadata 0x${METADATA.CHANNEL_FIRST.toString(16)}) not found`);
    }

    // Encode all channels to binary
    const encodedChannels = channels.map(ch => encodeChannel(ch));
    
    const blocks: Array<{ address: number; data: Uint8Array; metadata: number }> = [];
    
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
      
      // Update channel count in first block header (bytes 0-1, little-endian)
      if (isFirstBlock) {
        blockData[0] = channels.length & 0xFF;
        blockData[1] = (channels.length >> 8) & 0xFF;
      }
      
      // Determine start offset and max channels for this block
      const startOffset = isFirstBlock ? OFFSET.FIRST_CHANNEL : 0x00;
      const maxChannelsInBlock = isFirstBlock ? 84 : 85;
      const maxOffset = startOffset + (maxChannelsInBlock * BLOCK_SIZE.CHANNEL);
      
      // Write channels to this block
      for (let offset = startOffset; offset < maxOffset && channelIndex < channels.length; offset += BLOCK_SIZE.CHANNEL) {
        blockData.set(encodedChannels[channelIndex], offset);
        channelIndex++;
      }
      
      blocks.push({
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
    
    return blocks;
  }

  /**
   * Write channels to the radio (public interface)
   * 
   * @param channels Array of channels to write
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

    // Ensure we have discovered blocks
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

    // Generate channel blocks using shared helper method
    this.onProgress?.(10, `Generating ${channels.length} channel blocks...`);
    const channelBlocks = this.generateChannelBlocks(channels);
    
    // Write blocks directly
    this.onProgress?.(20, `Writing ${channels.length} channels to ${channelBlocks.length} blocks...`);
    log.info(`Writing ${channels.length} channels to ${channelBlocks.length} blocks`, 'Protocol');
    
    for (let i = 0; i < channelBlocks.length; i++) {
      const block = channelBlocks[i];
      const progress = 20 + Math.floor((i / channelBlocks.length) * 70);
      this.onProgress?.(progress, `Writing channel block ${i + 1} of ${channelBlocks.length}...`);
      
      await this.connection!.writeMemory(block.address, block.data, block.metadata);
      log.info(`Successfully wrote channel block ${i + 1}/${channelBlocks.length} at 0x${block.address.toString(16).padStart(6, '0').toUpperCase()}`, 'Protocol');
    }

    // Write TX Contact blocks (0x42 and 0x43) for digital channels
    this.onProgress?.(92, 'Writing TX Contact data...');
    await this.writeTxContactBlocks(channels);

    this.onProgress?.(100, `Successfully wrote ${channels.length} channels`);
    log.info(`Successfully wrote ${channels.length} channels to radio`, 'Protocol');
  }

  /**
   * Write TX Contact blocks (0x42 and 0x43) for digital channels
   * 
   * TX Contact is stored separately from channel data in metadata blocks 0x42 and 0x43.
   * Block 0x42: Channels 1-2048
   * Block 0x43: Channels 2049+ and VFOs (4001, 4002)
   * 
   * @param channels Array of channels to write TX Contact for
   */
  private async writeTxContactBlocks(channels: Channel[]): Promise<void> {
    // Step 1: Confirm metadata block locations by re-discovering if needed
    // Block locations can change, so we need to verify them before writing
    if (this.discoveredBlocks.length === 0) {
      log.warn('No discovered blocks - re-discovering to confirm TX Contact block locations', 'Protocol');
      const blocks = await discoverMemoryBlocks(
        this.connection!,
        this.radioInfo!.memoryLayout.configStart,
        this.radioInfo!.memoryLayout.configEnd,
        () => {} // No progress callback needed
      );
      this.discoveredBlocks = blocks;
    }
    
    // Find TX Contact blocks in discovered blocks
    let block42 = this.discoveredBlocks.find(b => b.metadata === METADATA.TX_CONTACT_LOW);
    let block43 = this.discoveredBlocks.find(b => b.metadata === METADATA.TX_CONTACT_HIGH);
    
    // Initialize block data from cache - MUST have cached data to preserve existing TX Contact entries
    const cached42 = this.cachedBlockData.find(b => b.metadata === METADATA.TX_CONTACT_LOW);
    const cached43 = this.cachedBlockData.find(b => b.metadata === METADATA.TX_CONTACT_HIGH);
    
    // If blocks are cached but not discovered, use the cached address
    // This can happen if blocks were read during bulkRead but not found in initial discovery
    if (!block42 && cached42) {
      block42 = { address: cached42.address, metadata: METADATA.TX_CONTACT_LOW, type: 'unknown' };
    }
    if (!block43 && cached43) {
      block43 = { address: cached43.address, metadata: METADATA.TX_CONTACT_HIGH, type: 'unknown' };
    }
    
    // Verify block locations match cache (they shouldn't change, but confirm anyway)
    if (block42 && cached42 && block42.address !== cached42.address) {
      log.warn(`TX Contact block 0x42 address changed: cached=0x${cached42.address.toString(16).padStart(6, '0').toUpperCase()}, discovered=0x${block42.address.toString(16).padStart(6, '0').toUpperCase()}`, 'Protocol');
    }
    if (block43 && cached43 && block43.address !== cached43.address) {
      log.warn(`TX Contact block 0x43 address changed: cached=0x${cached43.address.toString(16).padStart(6, '0').toUpperCase()}, discovered=0x${block43.address.toString(16).padStart(6, '0').toUpperCase()}`, 'Protocol');
    }
    
    if (!block42 && !block43) {
      log.warn('TX Contact blocks (0x42, 0x43) not found - skipping TX Contact write', 'Protocol');
      log.warn(`Total discovered blocks: ${this.discoveredBlocks.length}, cached blocks: ${this.cachedBlockData.length}`, 'Protocol');
      // List all discovered metadata values for debugging
      const metadataValues = this.discoveredBlocks.map(b => `0x${b.metadata.toString(16)}`).join(', ');
      log.debug(`Discovered metadata values: ${metadataValues}`, 'Protocol');
      return;
    }
    
    // SAFETY CHECK: We must have cached data to avoid wiping TX Contact entries
    if (!cached42 || !cached43) {
      log.warn('TX Contact blocks not in cache - skipping TX Contact write to avoid data loss. Read from radio first!', 'Protocol');
      log.warn(`Total cached blocks: ${this.cachedBlockData.length}`, 'Protocol');
      return;
    }
    
    // Copy cached data to avoid modifying the original
    const block42Data = new Uint8Array(cached42.data);
    const block43Data = new Uint8Array(cached43.data);
    
    // Update TX Contact for each channel
    let updatedCount = 0;
    for (const channel of channels) {
      const isDigital = channel.mode === 'Digital' || channel.mode === 'Fixed Digital';
      // Prefer contactId (what the UI updates) over txContactId (original read value)
      // If user edited the dropdown, contactId will have the new value
      // If unchanged, txContactId will have the original value
      const contactId = channel.contactId ?? channel.txContactId ?? 0;
      
      // Encode TX Contact for this channel
      encodeTxContactForChannel(
        channel.number,
        contactId,
        isDigital,
        block42Data,
        block43Data
      );
      
      if (isDigital && contactId > 0) {
        updatedCount++;
      }
    }
    
    log.info(`Updated TX Contact for ${updatedCount} digital channels with TG assignments`, 'Protocol');
    
    // Set metadata bytes
    block42Data[0xFFF] = METADATA.TX_CONTACT_LOW;
    block43Data[0xFFF] = METADATA.TX_CONTACT_HIGH;
    
    // Write blocks to radio
    if (block42) {
      await this.connection!.writeMemory(block42.address, block42Data, METADATA.TX_CONTACT_LOW);
      log.info('Successfully wrote TX Contact block 0x42', 'Protocol');
    }
    
    if (block43) {
      await this.connection!.writeMemory(block43.address, block43Data, METADATA.TX_CONTACT_HIGH);
      log.info('Successfully wrote TX Contact block 0x43', 'Protocol');
    }
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
    log.info(`Found ${zoneBlocks.length} zone blocks (metadata 0x${METADATA.ZONE.toString(16)})`, 'Protocol');

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

    log.info(`Successfully parsed ${zones.length} zones`, 'Protocol');
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
    log.info(`Successfully wrote ${zones.length} zones to radio`, 'Protocol');
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
    log.info(`Found ${scanBlocks.length} scan list blocks (metadata 0x${METADATA.SCAN_LIST.toString(16)})`, 'Protocol');

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
    log.debug(`Parsing scan list data, total size: ${allScanListData.length} bytes`, 'Protocol');
    const scanLists = parseScanLists(allScanListData, (listNum, rawData, name) => {
      // Store raw scan list data for debug export
      // Offset calculation: (57 * N) - 56, where N is 1-indexed
      const offset = (BLOCK_SIZE.SCAN_LIST * (listNum + 1)) - 56;
      storeRawData(this.rawScanListData, name, rawData, { listNum }, offset);
      log.debug(`Parsed scan list ${listNum + 1}: "${name}" with ${rawData.length} bytes`, 'Protocol');
    });

    log.info(`Successfully parsed ${scanLists.length} scan lists: ${scanLists.map(sl => sl.name).join(', ')}`, 'Protocol');
    this.onProgress?.(100, `Successfully read ${scanLists.length} scan lists`);
    return scanLists;
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
    
    log.info(`Contacts memory range: 0x${baseAddr.toString(16)} - 0x${endAddr.toString(16)}`, 'Protocol');
    
    if (baseAddr === 0 && endAddr === 0) {
      log.warn('Contacts range is 0x00000000-0x00000000, contacts may be disabled', 'Protocol');
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
      log.info(`Max contacts: ${maxContacts}`, 'Protocol');
    }
    
    const ENTRY_SIZE = 0x5C; // 92 bytes per contact
    const CONTACTS_PER_BLOCK = Math.floor(BLOCK_SIZE.STANDARD / ENTRY_SIZE);
    const contacts: Contact[] = [];
    const rangeSize = endAddr - baseAddr;
    const maxContactsInRange = Math.floor(rangeSize / ENTRY_SIZE);
    
    this.onProgress?.(5, `Reading contacts from 0x${baseAddr.toString(16).toUpperCase()}...`);
    let contactIndex = 0;
    let blockIdx = 0;
    let foundEmptyEntry = false;
    let countFromHeader = 0;
    
    // Determine how many contacts to read
    // First, we need to read the first block to get the count from Contact 0
    const firstBlockAddr = Math.floor(baseAddr / BLOCK_SIZE.STANDARD) * BLOCK_SIZE.STANDARD;
    const firstBlockData = await this.connection!.readMemory(firstBlockAddr, BLOCK_SIZE.STANDARD);
    const countOffset = baseAddr - firstBlockAddr;
    countFromHeader = this.readUint32LE(firstBlockData, countOffset);
    
    // Store first contact block for debugging
    this.rawContactBlockData = new Uint8Array(firstBlockData);
    this.rawContactBlockAddress = firstBlockAddr;
    
    // Determine contacts to read (respect firmware and range limits)
    const contactsToRead = countFromHeader > 0 && countFromHeader <= maxContacts && countFromHeader <= maxContactsInRange
      ? countFromHeader
      : Math.min(maxContacts, maxContactsInRange);
    
    // Read blocks until we've read all contacts or hit an empty entry
    // Block 0: contacts start at baseAddr + 0x10 (after 16-byte header), 44 contacts
    // Block 1+: contacts start at offset 0 of the block, 44 contacts per block
    while (!foundEmptyEntry && contactIndex < contactsToRead) {
      const blockStartContact = blockIdx * CONTACTS_PER_BLOCK;
      
      // Calculate block address: first block is at firstBlockAddr, subsequent blocks are sequential
      const blockAddr = firstBlockAddr + (blockIdx * BLOCK_SIZE.STANDARD);
      
      if (blockAddr >= endAddr) break;
      
      const progress = 5 + Math.floor((contactIndex / contactsToRead) * 90);
      this.onProgress?.(progress, `Reading contact block ${blockIdx + 1} (${contactIndex}/${contactsToRead} contacts)...`);
      
      const blockData = (blockIdx === 0 && blockAddr === firstBlockAddr) 
        ? firstBlockData 
        : await this.connection!.readMemory(blockAddr, BLOCK_SIZE.STANDARD);
      
      // Store all contact blocks for diagnostics
      this.rawContactBlocks.set(blockAddr, new Uint8Array(blockData));
      
      const isFirstBlock = blockIdx === 0;
      
      // Parse contacts in this block
      for (let i = 0; i < CONTACTS_PER_BLOCK; i++) {
        const currentContactIndex = blockStartContact + i;
        
        // Check if we've read all contacts based on count - stop immediately
        if (currentContactIndex >= contactsToRead) {
          foundEmptyEntry = true; // Signal to stop outer loop
          break;
        }
        
        // Calculate offset within this block
        // Block 0: offset = 0x10 + (i * ENTRY_SIZE)  // After 16-byte header
        // Block 1+: offset = 0x00 + (i * ENTRY_SIZE) // Start at beginning
        const entryOffset = isFirstBlock 
          ? 0x10 + (i * ENTRY_SIZE)  // Block 0: after header
          : i * ENTRY_SIZE;          // Block 1+: at offset 0
        
        // Check if we've exceeded the block or range
        if (entryOffset + ENTRY_SIZE > blockData.length) break;
        
        const entryData = blockData.slice(entryOffset, entryOffset + ENTRY_SIZE);
        
        // Check for empty entry
        if (entryData[0x00] === 0xFF || entryData[0x00] === 0x00) {
          if (contactIndex >= countFromHeader) {
            foundEmptyEntry = true;
            break;
          }
        }
        
        const contact = parseContactEntry(entryData, currentContactIndex);
        if (contact) {
          contacts.push(contact);
          contactIndex = currentContactIndex + 1;
          if (contactIndex >= contactsToRead) {
            foundEmptyEntry = true;
            break;
          }
        } else if (entryData[0x00] === 0xFF || entryData[0x00] === 0x00) {
          foundEmptyEntry = true;
          break;
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
    
    log.info(`Successfully read ${contacts.length} contacts`, 'Protocol');
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
    
    // Contact block structure:
    // - Block 0: 16-byte header (count + padding), then 44 entries starting at offset 0x10
    // - Block 1+: 44 entries starting at offset 0x00 (no header)
    // Formula for entry N (0-based contactIndex):
    //   blockNum = contactIndex / 44
    //   indexInBlock = contactIndex % 44
    //   if blockNum == 0: offset = 0x10 + (indexInBlock * 0x5C)  // Block 0: header at 0x00-0x0F
    //   else: offset = indexInBlock * 0x5C                      // Block 1+: start at 0x00
    const CONTACTS_PER_BLOCK = 44; // 44 contacts per 4KB block (4096 - 16 header) / 92 = 44.3...
    
    // Calculate how many blocks we need
    const totalBlocks = Math.ceil(contacts.length / CONTACTS_PER_BLOCK);
    
    this.onProgress?.(10, `Writing ${contacts.length} contacts across ${totalBlocks} block(s)...`);
    
    // Iterate through each block
    for (let blockNum = 0; blockNum < totalBlocks; blockNum++) {
      const blockAddr = firstBlockAddr + (blockNum * BLOCK_SIZE.STANDARD);
      
      const progress = 10 + Math.floor((blockNum / totalBlocks) * 85); // 10-95%
      this.onProgress?.(progress, `Writing contact block ${blockNum + 1}/${totalBlocks} (address 0x${blockAddr.toString(16).toUpperCase()})...`);
      
      // Read existing block to preserve other data
      // Note: Contacts are in a raw data region (no metadata blocks), so we just preserve whatever is at 0xFFF
      let blockData: Uint8Array;
      let existingMetadata = 0xFF; // Default if we can't read
      try {
        blockData = await this.connection!.readMemory(blockAddr, BLOCK_SIZE.STANDARD);
        // Preserve existing metadata byte (raw data region, not structured metadata blocks)
        existingMetadata = blockData[0xFFF];
      } catch (error) {
        // If read fails, create empty block filled with 0xFF (padding)
        blockData = new Uint8Array(BLOCK_SIZE.STANDARD);
        blockData.fill(0xFF);
      }
      
      // Block structure:
      // - Block 0: 16-byte header (count + padding), then entries start at offset 0x10
      // - Block 1+: Entries start at offset 0 (no header)
      // - Empty fields: 0xFF
      // - Padding at end of block: 0xFF
      const isFirstBlock = blockNum === 0;
      
      // If this is Block 1+, ensure entries start at offset 0 (no header)
      // Clear any potential header area (offset 0-15) to 0xFF padding
      if (!isFirstBlock) {
        for (let i = 0; i < 0x10; i++) {
          blockData[i] = 0xFF;
        }
      }
      
      // Calculate which contacts are in this block
      const firstContactIndex = blockNum * CONTACTS_PER_BLOCK;
      const lastContactIndex = Math.min(contacts.length - 1, (blockNum + 1) * CONTACTS_PER_BLOCK - 1);
      
      // Write contacts in this block
      for (let contactIndex = firstContactIndex; contactIndex <= lastContactIndex; contactIndex++) {
        const indexInBlock = contactIndex % CONTACTS_PER_BLOCK;
        
        // Calculate offset within this block
        // Block 0: offset = 0x10 + (indexInBlock * 0x5C)  // After 16-byte header
        // Block 1+: offset = 0x00 + (indexInBlock * 0x5C) // Start at beginning
        const entryOffset = isFirstBlock 
          ? 0x10 + (indexInBlock * ENTRY_SIZE)  // Block 0: after header
          : indexInBlock * ENTRY_SIZE;          // Block 1+: at offset 0
        
        // Safety checks
        if (entryOffset < 0 || entryOffset + ENTRY_SIZE > blockData.length) {
          log.warn(`Contact ${contactIndex} at offset 0x${entryOffset.toString(16)} doesn't fit in block ${blockNum} at 0x${blockAddr.toString(16)}`, 'Protocol');
          continue;
        }
        
        const contact = contacts[contactIndex];
        const entryData = encodeContactEntry(contact);
        blockData.set(entryData, entryOffset);
      }
      
      // Ensure padding at end of block is 0xFF (except metadata byte at 0xFFF)
      // Fill any unused space between last contact and metadata byte with 0xFF
      if (lastContactIndex >= firstContactIndex) {
        const lastIndexInBlock = lastContactIndex % CONTACTS_PER_BLOCK;
        const lastEntryOffset = isFirstBlock 
          ? 0x10 + (lastIndexInBlock * ENTRY_SIZE) + ENTRY_SIZE  // Block 0: after header
          : (lastIndexInBlock + 1) * ENTRY_SIZE;                  // Block 1+: at offset 0
        
        if (lastEntryOffset < 0xFFF) {
          for (let i = lastEntryOffset; i < 0xFFF; i++) {
            blockData[i] = 0xFF;
          }
        }
      }
      
      // Preserve existing metadata byte (raw data region - no structured metadata blocks)
      blockData[0xFFF] = existingMetadata;
      
      // Store block data for diagnostics/debugging
      this.writeBlockData.set(blockAddr, {
        address: blockAddr,
        data: new Uint8Array(blockData), // Copy the data
        metadata: existingMetadata
      });
      
      // Write block (writeMemory requires metadata parameter, but this is just raw data)
      await this.connection!.writeMemory(blockAddr, blockData, existingMetadata);
      
      // Delay between writes
      if (blockNum < totalBlocks - 1) {
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
      log.debug('No quick message blocks found', 'Protocol');
      return [];
    }

    this.rawMessageData.clear();
    const messages: QuickTextMessage[] = [];

    for (let i = 0; i < messageBlocks.length; i++) {
      const block = messageBlocks[i];
      this.onProgress?.(Math.floor((i / messageBlocks.length) * 100), `Processing message block ${i + 1} of ${messageBlocks.length}...`);

      const cachedBlock = this.getCachedBlockByAddress(block.address);
      if (!cachedBlock) {
        log.warn(`Message block at 0x${block.address.toString(16)} not found in cache`, 'Protocol');
        continue;
      }
      
      const parsedMessages = parseQuickMessages(cachedBlock.data, (messageIndex, rawData) => {
        // Calculate offset: entry N (1-based) status at (N * 0x81) - 0x71
        const entryNum = messageIndex + 1;
        const statusOffset = (entryNum * 0x81) - 0x71;
        this.rawMessageData.set(messageIndex, {
          data: new Uint8Array(rawData),
          messageIndex,
          offset: statusOffset,
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
      log.debug('No DMR Radio ID blocks found', 'Protocol');
      return [];
    }

    this.rawDMRRadioIDData.clear();
    const radioIds: DMRRadioID[] = [];

    for (let i = 0; i < radioIdBlocks.length; i++) {
      const block = radioIdBlocks[i];
      this.onProgress?.(Math.floor((i / radioIdBlocks.length) * 100), `Processing DMR Radio ID block ${i + 1} of ${radioIdBlocks.length}...`);

      const cachedBlock = this.getCachedBlockByAddress(block.address);
      if (!cachedBlock) {
        log.warn(`DMR Radio ID block at 0x${block.address.toString(16)} not found in cache`, 'Protocol');
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
   * Write DMR Radio IDs to the radio
   * Structure:
   * - Count field at offset 0x00 (1 byte, max 250)
   * - Entries start at offset 0x10 (16 bytes each)
   * - Max 250 entries
   */
  async writeDMRRadioIDs(radioIds: DMRRadioID[]): Promise<void> {
    requireConnection(this.connection, this.radioInfo);
    
    if (radioIds.length > LIMITS.DMR_RADIO_IDS_MAX) {
      throw new Error(`Maximum of ${LIMITS.DMR_RADIO_IDS_MAX} DMR Radio IDs allowed. Got ${radioIds.length}`);
    }

    this.onProgress?.(0, 'Preparing to write DMR Radio IDs...');

    // Discover blocks if not already discovered
    if (this.discoveredBlocks.length === 0) {
      this.onProgress?.(5, 'Discovering DMR Radio ID blocks...');
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

    // Get DMR Radio ID blocks (metadata 0x67)
    const radioIdBlocks = this.discoveredBlocks.filter(b => b.type === 'dmrradioid' && b.metadata === METADATA.DMR_RADIO_IDS);

    if (radioIdBlocks.length === 0) {
      throw new Error('No DMR Radio ID blocks found');
    }

    if (radioIdBlocks.length > 1) {
      log.warn(`Found ${radioIdBlocks.length} DMR Radio ID blocks, expected 1. Using first block.`, 'Protocol');
    }

    const block = radioIdBlocks[0];
    this.onProgress?.(10, `Writing ${radioIds.length} DMR Radio IDs...`);

    // Read the current block to preserve unknown data
    const blockData = await this.connection!.readMemory(block.address, BLOCK_SIZE.STANDARD);
    
    // Fill with 0xFF (empty)
    blockData.fill(0xFF);

    // Write count at offset 0x00 (1 byte, max 250)
    const count = Math.min(radioIds.length, LIMITS.DMR_RADIO_IDS_MAX);
    blockData[0x00] = count & 0xFF;

    // Encode and write each DMR Radio ID entry starting at offset 0x10
    for (let i = 0; i < radioIds.length && i < LIMITS.DMR_RADIO_IDS_MAX; i++) {
      const entryOffset = 0x10 + (i * BLOCK_SIZE.DMR_RADIO_ID);
      
      if (entryOffset + BLOCK_SIZE.DMR_RADIO_ID > blockData.length) {
        log.warn(`DMR Radio ID ${i + 1} would exceed block size`, 'Protocol');
        break;
      }

      const encodedEntry = encodeDMRRadioID(radioIds[i]);
      blockData.set(encodedEntry, entryOffset);
      
      if (i % 10 === 0 || i === radioIds.length - 1) {
        const progress = 10 + Math.floor(((i + 1) / radioIds.length) * 80); // 10-90%
        this.onProgress?.(progress, `Encoded ${i + 1} of ${radioIds.length} DMR Radio IDs...`);
      }
    }

    // Set metadata byte at end of block
    blockData[0xFFF] = block.metadata;

    // Write to radio
    this.onProgress?.(95, 'Writing DMR Radio IDs to radio...');
    await this.connection!.writeMemory(block.address, blockData, block.metadata);

    this.onProgress?.(100, `Successfully wrote ${radioIds.length} DMR Radio IDs`);
    log.info(`Successfully wrote ${radioIds.length} DMR Radio IDs to radio`, 'Protocol');
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
      log.debug('No calibration blocks found', 'Protocol');
      return null;
    }

    // Use the first calibration block
    const block = calibrationBlocks[0];
    const cachedBlock = this.getCachedBlockByAddress(block.address);
    if (!cachedBlock) {
      log.warn(`Calibration block at 0x${block.address.toString(16)} not found in cache`, 'Protocol');
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
      log.debug('No DMR RX group blocks found', 'Protocol');
      return [];
    }

    this.rawRXGroupData.clear();
    const groups: RXGroup[] = [];

    for (let i = 0; i < rxGroupBlocks.length; i++) {
      const block = rxGroupBlocks[i];
      this.onProgress?.(Math.floor((i / rxGroupBlocks.length) * 100), `Processing DMR RX group block ${i + 1} of ${rxGroupBlocks.length}...`);

      const cachedBlock = this.getCachedBlockByAddress(block.address);
      if (!cachedBlock) {
        log.warn(`RX Group block at 0x${block.address.toString(16)} not found in cache`, 'Protocol');
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
   * Write DMR RX Groups to the radio
   * 
   * @param groups - Array of RX Groups to write
   * @throws {Error} If not connected or block not found
   */
  async writeRXGroups(groups: RXGroup[]): Promise<void> {
    requireConnection(this.connection, this.radioInfo);

    this.onProgress?.(0, 'Preparing to write DMR RX Groups...');

    // Discover blocks if not already discovered
    if (this.discoveredBlocks.length === 0) {
      if (!this.radioInfo) {
        throw new Error('Radio info not available. Connect and read radio info first.');
      }
      this.onProgress?.(5, 'Discovering blocks...');
      const blocks = await discoverMemoryBlocks(
        this.connection!,
        this.radioInfo.memoryLayout.configStart,
        this.radioInfo.memoryLayout.configEnd,
        (current, total) => {
          const progress = 5 + Math.floor((current / total) * 5); // 5-10%
          this.onProgress?.(progress, `Reading metadata ${current} of ${total}...`);
        }
      );
      this.discoveredBlocks = blocks;
    }

    // Find metadata block 0x0F (RX Groups)
    const rxGroupBlock = this.discoveredBlocks.find(b => b.metadata === METADATA.RX_GROUPS);
    if (!rxGroupBlock) {
      throw new Error('RX Groups block (metadata 0x0F) not found');
    }

    this.onProgress?.(10, 'Encoding DMR RX Groups...');

    // Get existing block data from cache or read it fresh to preserve existing data
    let blockData: Uint8Array;
    const cachedBlock = this.getCachedBlockByAddress(rxGroupBlock.address);
    if (cachedBlock) {
      // Use cached data (make a copy to avoid modifying the cache)
      blockData = new Uint8Array(cachedBlock.data);
      log.debug('Using cached RX Groups block data', 'Protocol');
    } else {
      // Read from radio if not cached
      log.debug('Reading RX Groups block from radio (not in cache)', 'Protocol');
      this.onProgress?.(15, 'Reading existing RX Groups block...');
      blockData = await this.connection!.readMemory(rxGroupBlock.address, BLOCK_SIZE.STANDARD);
    }

    // Encode all RX Groups into the block
    const encodedData = encodeRXGroups(groups, blockData);

    // Preserve metadata byte
    encodedData[0xFFF] = blockData[0xFFF];

    this.onProgress?.(90, 'Writing RX Groups block to radio...');

    // Write the block back to the radio
    await this.connection!.writeMemory(rxGroupBlock.address, encodedData, METADATA.RX_GROUPS);

    this.onProgress?.(100, `Successfully wrote ${groups.length} DMR RX groups`);
  }

  /**
   * Parse Talk Groups from cached blocks (metadata 0x44)
   * Blocks must be read first via bulkReadRequiredBlocks()
   * This method ONLY parses - it does NOT read from the radio
   * Connection is not required - data comes from cache
   * 
   * IMPORTANT: This method should ONLY be called AFTER all blocks have been read.
   * Parsing errors will not affect the reading process since reading is already complete.
   */
  async readQuickContacts(): Promise<QuickContact[]> {
    requireRadioInfo(this.radioInfo);

    // Ensure blocks have been read - this is critical to prevent parsing during read
    if (this.cachedBlockData.length === 0 || this.discoveredBlocks.length === 0) {
      throw new Error('Blocks must be read first. Call bulkReadRequiredBlocks() before processing.');
    }

    // Additional safety check: ensure we're not connected (reading should be complete)
    if (this.connection) {
      log.warn('Connection still open when parsing Quick Contacts - this should not happen if reading is complete', 'Protocol');
    }

    this.onProgress?.(0, 'Parsing Talk Groups from cached blocks...');

    // Find metadata block 0x44
    const quickContactBlock = this.discoveredBlocks.find(b => b.metadata === METADATA.METADATA_0x44);
    if (!quickContactBlock) {
      // Talk Groups are optional - return empty array if not found
      log.debug('Talk Groups block (metadata 0x44) not found', 'Protocol');
      return [];
    }

    const cachedBlock = this.getCachedBlockByAddress(quickContactBlock.address);
    if (!cachedBlock) {
      log.warn(`Talk Groups block at 0x${quickContactBlock.address.toString(16)} not found in cache`, 'Protocol');
      return [];
    }

    // Parse from cached data only - no radio access
    // Wrap in try-catch to ensure parsing errors don't propagate and affect other parsing
    try {
      const contacts = parseQuickContacts(cachedBlock.data);
      this.onProgress?.(100, `Successfully processed ${contacts.length} talk groups`);
      return contacts;
    } catch (error) {
      log.error('Error parsing Talk Groups - returning empty array to prevent blocking other parsing', 'Protocol', error);
      // Return empty array instead of throwing - parsing errors should not block other operations
      return [];
    }
  }

  /**
   * Write Talk Groups to the radio
   * 
   * Updates three metadata blocks:
   * - 0x44: Talk Groups data (contact entries)
   * - 0x06: Talk Groups counter (at offset 0x1FF)
   * - 0x0B: Quick Access Contact List (header, bitmask, and sorted index tables)
   * 
   * @param contacts - Array of Talk Groups to write
   * @throws {Error} If not connected or block not found
   */
  async writeQuickContacts(contacts: QuickContact[]): Promise<void> {
    requireConnection(this.connection, this.radioInfo);

    if (contacts.length > LIMITS.TALK_GROUPS_MAX) {
      throw new Error(`Maximum of ${LIMITS.TALK_GROUPS_MAX} talk groups allowed. Got ${contacts.length}`);
    }

    this.onProgress?.(0, 'Preparing to write Talk Groups...');

    // Discover blocks if not already discovered
    if (this.discoveredBlocks.length === 0) {
      if (!this.radioInfo) {
        throw new Error('Radio info not available. Connect and read radio info first.');
      }
      this.onProgress?.(5, 'Discovering blocks...');
      const blocks = await discoverMemoryBlocks(
        this.connection!,
        this.radioInfo.memoryLayout.configStart,
        this.radioInfo.memoryLayout.configEnd,
        (current, total) => {
          const progress = 5 + Math.floor((current / total) * 5); // 5-10%
          this.onProgress?.(progress, `Reading metadata ${current} of ${total}...`);
        }
      );
      this.discoveredBlocks = blocks;
    }

    // Find metadata block 0x44 (Talk Groups data)
    const quickContactBlock = this.discoveredBlocks.find(b => b.metadata === METADATA.METADATA_0x44);
    if (!quickContactBlock) {
      throw new Error('Talk Groups block (metadata 0x44) not found');
    }

    // Find metadata block 0x06 (Config section 4 - contains Talk Groups counter)
    const counterBlock = this.discoveredBlocks.find(b => b.metadata === METADATA.METADATA_0x06);
    if (!counterBlock) {
      throw new Error('Config block 0x06 (Talk Groups counter) not found');
    }

    // Find metadata block 0x0B (Quick Access Contact List)
    const quickAccessBlock = this.discoveredBlocks.find(b => b.metadata === METADATA.METADATA_0x0B);
    if (!quickAccessBlock) {
      throw new Error('Quick Access Contact List block (metadata 0x0B) not found');
    }

    this.onProgress?.(10, 'Encoding Talk Groups...');

    // Encode contacts to 4KB block
    const blockData = encodeQuickContacts(contacts);

    // Get block 0x06 from cache or read it fresh
    this.onProgress?.(30, 'Preparing config block 0x06...');
    let counterBlockData: Uint8Array;
    
    const cachedCounterBlock = this.getCachedBlockByAddress(counterBlock.address);
    if (cachedCounterBlock) {
      // Use cached data (make a copy to avoid modifying the cache)
      counterBlockData = new Uint8Array(cachedCounterBlock.data);
      log.debug('Using cached block 0x06 data', 'Protocol');
    } else {
      // Read from radio if not cached
      log.debug('Reading block 0x06 from radio (not in cache)', 'Protocol');
      counterBlockData = await this.connection!.readMemory(counterBlock.address, BLOCK_SIZE.STANDARD);
    }

    // Update ONLY the Talk Groups counter at offset 0x1FF (byte 511)
    // All other data in the block is preserved
    this.onProgress?.(40, 'Updating Talk Groups counter...');
    const oldCounter = counterBlockData[OFFSET.TALK_GROUP_COUNTER];
    counterBlockData[OFFSET.TALK_GROUP_COUNTER] = contacts.length & 0xFF; // Write count as single byte
    log.info(`Updating Talk Groups counter from ${oldCounter} to ${contacts.length} at offset 0x1FF`, 'Protocol');

    // Write the counter block first
    this.onProgress?.(50, 'Writing Talk Groups counter to radio...');
    await this.connection!.writeMemory(counterBlock.address, counterBlockData, METADATA.METADATA_0x06);
    log.info(`Updated Talk Groups counter to ${contacts.length} at block 0x06 offset 0x1FF`, 'Protocol');

    // Write the Talk Groups data block
    this.onProgress?.(70, 'Writing Talk Groups data to radio...');
    await this.connection!.writeMemory(quickContactBlock.address, blockData, METADATA.METADATA_0x44);

    // Update cache (store the written data)
    const cachedBlockIndex = this.cachedBlockData.findIndex(b => b.address === quickContactBlock.address);
    if (cachedBlockIndex >= 0) {
      this.cachedBlockData[cachedBlockIndex] = {
        metadata: METADATA.METADATA_0x44,
        address: quickContactBlock.address,
        data: blockData,
      };
    } else {
      this.cachedBlockData.push({
        metadata: METADATA.METADATA_0x44,
        address: quickContactBlock.address,
        data: blockData,
      });
    }

    // Update cache for counter block too
    const cachedCounterIndex = this.cachedBlockData.findIndex(b => b.address === counterBlock.address);
    if (cachedCounterIndex >= 0) {
      this.cachedBlockData[cachedCounterIndex] = {
        metadata: METADATA.METADATA_0x06,
        address: counterBlock.address,
        data: counterBlockData,
      };
    } else {
      this.cachedBlockData.push({
        metadata: METADATA.METADATA_0x06,
        address: counterBlock.address,
        data: counterBlockData,
      });
    }

    // Update metadata block 0x0B (Quick Access Contact List)
    this.onProgress?.(75, 'Updating Quick Access Contact List (0x0B)...');
    
    // Get block 0x0B from cache or read it fresh
    let quickAccessData: Uint8Array;
    const cachedQuickAccessBlock = this.getCachedBlockByAddress(quickAccessBlock.address);
    if (cachedQuickAccessBlock) {
      quickAccessData = new Uint8Array(cachedQuickAccessBlock.data);
      log.debug('Using cached block 0x0B data', 'Protocol');
    } else {
      log.debug('Reading block 0x0B from radio (not in cache)', 'Protocol');
      quickAccessData = await this.connection!.readMemory(quickAccessBlock.address, BLOCK_SIZE.STANDARD);
    }

    // Count call types
    let groupCallCount = 0;
    let privateCallCount = 0;
    let allCallCount = 0;
    
    contacts.forEach(contact => {
      if (contact.callType === 0x04) groupCallCount++;      // Group Call
      else if (contact.callType === 0x03) privateCallCount++; // Private Call
      else if (contact.callType === 0x05) allCallCount++;    // All Call
    });

    // Update header (0x00-0x0F)
    const totalCount = contacts.length;
    quickAccessData[0x00] = totalCount & 0xFF;           // Total count low byte
    quickAccessData[0x01] = (totalCount >> 8) & 0xFF;    // Total count high byte
    quickAccessData[0x02] = groupCallCount & 0xFF;       // Group call count low byte
    quickAccessData[0x03] = (groupCallCount >> 8) & 0xFF; // Group call count high byte
    quickAccessData[0x04] = privateCallCount & 0xFF;     // Private call count
    
    log.info(`Updating Quick Access List: Total=${totalCount}, Group=${groupCallCount}, Private=${privateCallCount}`, 'Protocol');

    // Initialize bitmask (0x10-0x1F) - all slots free initially (1 = free, 0 = used)
    for (let i = 0x10; i < 0x20; i++) {
      quickAccessData[i] = 0xFF;
    }

    // Clear Index Table 1 (0x100-0x6FF) and Index Table 2 (0x740-0xCFF)
    for (let i = 0x100; i < 0x700; i++) {
      quickAccessData[i] = 0xFF;
    }
    for (let i = 0x740; i < 0xD00; i++) {
      quickAccessData[i] = 0xFF;
    }

    // Build sorted index lists using physical position (1-based) in block 0x44
    // The index stored in 0x0B must match the physical position in block 0x44,
    // NOT the contact.index value (which may have gaps after deletions)
    const contactsWithIndices = contacts.map((contact, arrayIndex) => ({
      contactIndex: arrayIndex + 1, // Physical position in block 0x44 (1-based)
      name: contact.name,
      callType: contact.callType,
      contactNumber: contact.contactNumber, // DMR ID
      typeByte: contact.callType === 0x03 ? 0x30 : // Private Call
                contact.callType === 0x04 ? 0x40 : // Group Call
                contact.callType === 0x05 ? 0x50 : // All Call
                0x40 // Default to Group Call
    }));

    // Index Table 1 (@ 0x100): Sort entries alphabetically by Talk Group name (ASCII string comparison)
    const sortedByName = [...contactsWithIndices].sort((a, b) => 
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true })
    );
    
    sortedByName.forEach((item, displayIndex) => {
      const offset = 0x100 + (displayIndex * 2);
      if (offset < 0x700) {
        quickAccessData[offset] = item.contactIndex;
        quickAccessData[offset + 1] = item.typeByte;
        
        // Clear bit in bitmask (0 = used, 1 = free)
        // Use displayIndex for bitmask position, not contactIndex
        const byteIdx = Math.floor(displayIndex / 8);
        const bitIdx = displayIndex % 8;
        if (0x10 + byteIdx < 0x20) {
          quickAccessData[0x10 + byteIdx] &= ~(1 << bitIdx);
        }
      }
    });

    // Index Table 2 (@ 0x740): Sort entries by DMR ID numerically (lowest ID first)
    const sortedByDmrId = [...contactsWithIndices].sort((a, b) => 
      a.contactNumber - b.contactNumber
    );
    
    sortedByDmrId.forEach((item, displayIndex) => {
      const offset = 0x740 + (displayIndex * 2);
      if (offset < 0xD00) {
        quickAccessData[offset] = item.contactIndex;
        quickAccessData[offset + 1] = item.typeByte;
      }
    });

    // Write block 0x0B
    this.onProgress?.(85, 'Writing Quick Access Contact List to radio...');
    await this.connection!.writeMemory(quickAccessBlock.address, quickAccessData, METADATA.METADATA_0x0B);
    log.info(`Updated Quick Access Contact List (0x0B) with ${totalCount} entries`, 'Protocol');

    // Update cache for quick access block
    const cachedQuickAccessIndex = this.cachedBlockData.findIndex(b => b.address === quickAccessBlock.address);
    if (cachedQuickAccessIndex >= 0) {
      this.cachedBlockData[cachedQuickAccessIndex] = {
        metadata: METADATA.METADATA_0x0B,
        address: quickAccessBlock.address,
        data: quickAccessData,
      };
    } else {
      this.cachedBlockData.push({
        metadata: METADATA.METADATA_0x0B,
        address: quickAccessBlock.address,
        data: quickAccessData,
      });
    }

    // Don't update blockData map - preserve original raw data from radio for diagnostics
    // The blockData map should contain the original read data, not the encoded/written data
    // This allows users to download the original raw data from the radio

    this.onProgress?.(100, `Successfully wrote ${contacts.length} talk groups`);
    log.info(`Successfully wrote ${contacts.length} talk groups to blocks 0x44, 0x06, and 0x0B`, 'Protocol');
  }

  /**
   * Write Quick Messages to radio
   * 
   * @param messages - Array of quick messages to write
   * @throws {Error} If not connected or block not found
   */
  async writeQuickMessages(messages: QuickTextMessage[]): Promise<void> {
    requireConnection(this.connection, this.radioInfo);

    this.onProgress?.(0, 'Preparing to write Quick Messages...');

    // Discover blocks if not already discovered
    if (this.discoveredBlocks.length === 0) {
      if (!this.radioInfo) {
        throw new Error('Radio info not available. Connect and read radio info first.');
      }
      this.onProgress?.(5, 'Discovering blocks...');
      const blocks = await discoverMemoryBlocks(
        this.connection!,
        this.radioInfo.memoryLayout.configStart,
        this.radioInfo.memoryLayout.configEnd,
        (current, total) => {
          const progress = 5 + Math.floor((current / total) * 5); // 5-10%
          this.onProgress?.(progress, `Reading metadata ${current} of ${total}...`);
        }
      );
      this.discoveredBlocks = blocks;
    }

    // Find metadata block 0x0A (Quick Messages)
    const quickMessagesBlock = this.discoveredBlocks.find(b => b.metadata === METADATA.QUICK_MESSAGES);
    if (!quickMessagesBlock) {
      throw new Error('Quick Messages block (metadata 0x0A) not found');
    }

    this.onProgress?.(10, 'Encoding Quick Messages...');

    // Get existing block data from cache or read it fresh to preserve existing data
    let blockData: Uint8Array;
    const cachedBlock = this.getCachedBlockByAddress(quickMessagesBlock.address);
    if (cachedBlock) {
      // Use cached data (make a copy to avoid modifying the cache)
      blockData = new Uint8Array(cachedBlock.data);
      log.debug('Using cached Quick Messages block data', 'Protocol');
    } else {
      // Read from radio if not cached
      log.debug('Reading Quick Messages block from radio (not in cache)', 'Protocol');
      blockData = await this.connection!.readMemory(quickMessagesBlock.address, BLOCK_SIZE.STANDARD);
    }

    // Encode messages into the existing block (preserves other data)
    encodeQuickMessages(messages, blockData);

    // Write the Quick Messages data block
    this.onProgress?.(50, 'Writing Quick Messages to radio...');
    await this.connection!.writeMemory(quickMessagesBlock.address, blockData, METADATA.QUICK_MESSAGES);

    // Update cache (store the written data)
    const cachedBlockIndex = this.cachedBlockData.findIndex(b => b.address === quickMessagesBlock.address);
    if (cachedBlockIndex >= 0) {
      this.cachedBlockData[cachedBlockIndex] = {
        metadata: METADATA.QUICK_MESSAGES,
        address: quickMessagesBlock.address,
        data: blockData,
      };
    } else {
      this.cachedBlockData.push({
        metadata: METADATA.QUICK_MESSAGES,
        address: quickMessagesBlock.address,
        data: blockData,
      });
    }

    this.onProgress?.(100, `Successfully wrote ${messages.length} quick message(s)`);
    log.info(`Successfully wrote ${messages.length} quick message(s) to block 0x0A`, 'Protocol');
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
      log.debug('Radio Settings block (metadata 0x04) not found - radio may not support this feature', 'Protocol');
      return null;
    }

    this.onProgress?.(0, 'Parsing Radio Settings from cached blocks...');

    try {
      const cachedBlock = this.getCachedBlockByAddress(radioSettingsBlock.address);
      if (!cachedBlock) {
        log.warn('Radio Settings block not found in cache', 'Protocol');
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
            log.warn('Failed to parse VFO channels from block 0x41', 'Protocol', err);
          }
        }
      }

      // Get TX Contact blocks (0x42 and 0x43) for VFO Talk Group IDs
      const txContactBlock42 = this.cachedBlockData.find(b => b.metadata === METADATA.TX_CONTACT_LOW);
      const txContactBlock43 = this.cachedBlockData.find(b => b.metadata === METADATA.TX_CONTACT_HIGH);
      const block42Data = txContactBlock42?.data || null;
      const block43Data = txContactBlock43?.data || null;

      // Apply TX Contact to VFO A (channel 4001) if it's digital
      if (vfoA && (vfoA.mode === 'Digital' || vfoA.mode === 'Fixed Digital') && (block42Data || block43Data)) {
        const txContact = parseTxContactForChannel(4001, block42Data, block43Data);
        if (txContact) {
          vfoA.contactId = txContact.contactId;
          log.debug(`VFO A (4001): TX Contact from block 0x43 = ${txContact.contactId}`, 'Protocol');
        }
      }

      // Apply TX Contact to VFO B (channel 4002) if it's digital
      if (vfoB && (vfoB.mode === 'Digital' || vfoB.mode === 'Fixed Digital') && (block42Data || block43Data)) {
        const txContact = parseTxContactForChannel(4002, block42Data, block43Data);
        if (txContact) {
          vfoB.contactId = txContact.contactId;
          log.debug(`VFO B (4002): TX Contact from block 0x43 = ${txContact.contactId}`, 'Protocol');
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
      log.warn('Failed to parse Radio Settings block', 'Protocol', err);
      return null;
    }
  }

  /**
   * Write Radio Settings to metadata 0x04 block
   */
  async writeRadioSettings(settings: RadioSettings, changedFields?: string[]): Promise<void> {
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

    // SAFETY CHECK: Ensure we have valid original data to preserve unknown bytes
    // Without original data, we would fill with 0xFF which wipes the block!
    if (!this.rawRadioSettingsData || this.rawRadioSettingsData.length < 0x1000) {
      log.error('Cannot write Radio Settings: No valid original data cached. Read from radio first!', 'Protocol');
      throw new Error('Cannot write Radio Settings without reading from radio first. Original block data is required to preserve unknown fields.');
    }

    // Encode settings to 4KB block, preserving original data
    // If changedFields is provided, only encode those specific fields
    const blockData = encodeRadioSettings(settings, this.rawRadioSettingsData, changedFields);

    // Write the entire block (writeMemory takes address, data, and metadata)
    await this.connection!.writeMemory(radioSettingsBlock.address, blockData, METADATA.VFO_SETTINGS);
    this.rawRadioSettingsData = blockData;

    // Write VFO A and VFO B to block 0x41 (as channels 4001 and 4002) only if changed
    const block41 = this.discoveredBlocks.find(b => b.metadata === METADATA.METADATA_0x41);
    const vfoChanged = changedFields && (changedFields.includes('vfoA') || changedFields.includes('vfoB'));
    if (block41 && settings.vfoA && settings.vfoB && vfoChanged) {
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

      // NOTE: TX Contact for VFOs is stored in block 0x43, but we don't write it here
      // to avoid potential corruption. VFO TX Contact write is disabled until properly debugged.
      // The TX Contact data is read-only for now - VFO Talk Group changes won't persist.
      // TODO: Implement safe VFO TX Contact write after verifying block structure
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

    // Find Digital Emergency Systems block (metadata 0x10, same block as encryption keys)
    const emergencyBlock = this.discoveredBlocks.find(b => b.metadata === METADATA.DIGITAL_EMERGENCY);

    if (!emergencyBlock) {
      log.debug('Digital Emergency Systems block (metadata 0x10) not found', 'Protocol');
      return null;
    }

    this.onProgress?.(0, 'Parsing Digital Emergency Systems from cached blocks...');

    try {
      const cachedBlock = this.getCachedBlockByAddress(emergencyBlock.address);
      if (!cachedBlock) {
        log.warn('Digital Emergency Systems block not found in cache', 'Protocol');
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
      log.warn('Failed to process Digital Emergency Systems block', 'Protocol', err);
      return null;
    }
  }

  /**
   * Write Digital Emergency Systems to metadata 0x10 block (same block as encryption keys, offset 0x000)
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

    // Find Digital Emergency Systems block (metadata 0x10, same block as encryption keys)
    const emergencyBlock = this.discoveredBlocks.find(b => b.metadata === METADATA.DIGITAL_EMERGENCY);

    if (!emergencyBlock) {
      throw new Error('Digital Emergency Systems block (metadata 0x10) not found');
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
      log.debug('Analog Emergency Systems block (metadata 0x10) not found', 'Protocol');
      return null;
    }

    this.onProgress?.(0, 'Parsing Analog Emergency Systems from cached blocks...');

    try {
      const cachedBlock = this.getCachedBlockByAddress(emergencyBlock.address);
      if (!cachedBlock) {
        log.warn('Analog Emergency Systems block not found in cache', 'Protocol');
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
      log.warn('Failed to process Analog Emergency Systems block', 'Protocol', err);
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

    // Step 1: Follow the EXACT same steps as read operation for verification
    // connect() already queried V-frames and entered programming mode, so we use that radioInfo
    // Then we discover blocks (same as bulkReadRequiredBlocks does after connect)
    this.onProgress?.(2, 'Verifying radio memory map and block locations...');
    
    // Use radioInfo from connect() - it already queried V-frames and verified memory layout
    if (!this.radioInfo) {
      throw new Error('Radio info not available - connect() must be called first');
    }
    
    const startAddr = this.radioInfo.memoryLayout.configStart;
    const endAddr = this.radioInfo.memoryLayout.configEnd;
    
    // Step 1a: Discover all metadata blocks (same as bulkReadRequiredBlocks)
    // We're already in programming mode from connect(), so we can discover blocks directly
    this.onProgress?.(3, 'Discovering metadata block locations (200 blocks)...');
    const blocks = await discoverMemoryBlocks(
      this.connection!,
      startAddr,
      endAddr,
      (current, total) => {
        const progress = 3 + Math.floor((current / total) * 5); // 3-8%
        this.onProgress?.(progress, `Reading metadata ${current} of ${total}...`);
      }
    );
    
    // Compare discovered blocks with cached blocks and warn if locations changed
    const previousDiscoveredBlocks = this.discoveredBlocks.length > 0 ? [...this.discoveredBlocks] : [];
    if (previousDiscoveredBlocks.length > 0) {
      const cachedBlocksMap = new Map(previousDiscoveredBlocks.map(b => [b.address, b]));
      let locationChanges = 0;
      for (const newBlock of blocks) {
        const cachedBlock = cachedBlocksMap.get(newBlock.address);
        if (cachedBlock && cachedBlock.metadata !== newBlock.metadata) {
          log.warn(`⚠️ Block at 0x${newBlock.address.toString(16).padStart(6, '0').toUpperCase()} metadata changed: cached=0x${cachedBlock.metadata.toString(16)}, radio=0x${newBlock.metadata.toString(16)}`, 'Protocol');
          locationChanges++;
        }
      }
      if (locationChanges > 0) {
        log.warn(`⚠️ ${locationChanges} metadata block locations changed - this might indicate a different radio!`, 'Protocol');
      }
    }
    
    // Update discovered blocks with current radio state (always use fresh discovery)
    this.discoveredBlocks = blocks;
    
    // Step 2: Ensure we have cached block data
    // If not, we need to read them first
    if (this.cachedBlockData.length === 0) {
      this.onProgress?.(8, 'Reading blocks from radio (required for smart write)...');
      
      // Read all blocks into cache (but don't disconnect - we need connection for writing)
      await this.bulkReadRequiredBlocksForWrite();
    } else {
      this.onProgress?.(8, 'Using cached blocks for smart write...');
    }
    
    // Verify connection is still valid before proceeding
    requireConnection(this.connection, this.radioInfo);

    // Step 2: Generate new block data for channels, zones, and scan lists
    // All other blocks will be used from cache as-is
    this.onProgress?.(10, 'Generating new data blocks for channels, zones, and scan lists...');
    
    // Track which blocks we're replacing (only channels, zones, scan lists)
    const blocksToWrite: Array<{ address: number; data: Uint8Array; metadata: number }> = [];

    // Generate channel blocks using shared helper method
    if (channels.length > 0) {
      const channelBlocks = this.generateChannelBlocks(channels);
      blocksToWrite.push(...channelBlocks);
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
      log.debug(`Using cached zone data, total size: ${originalZoneData.length} bytes`, 'Protocol');
    } else {
      log.warn('Zone blocks not in cache - skipping comparison', 'Protocol');
    }

    // Calculate total size needed for all zone blocks
    const totalZoneBlocksSize = zoneBlocks.length * BLOCK_SIZE.STANDARD;
    
    // Generate fresh zone data from scratch (filled with 0xFF)
    const allZoneData = new Uint8Array(totalZoneBlocksSize);
    allZoneData.fill(0xFF);

    // Encode all zones and write them to the fresh data
    const zonesToWrite = zones.length > 0 ? zones : [];
    log.info(`Writing ${zonesToWrite.length} zones to ${zoneBlocks.length} block(s)`, 'Protocol');
    
    if (zonesToWrite.length === 0) {
      log.warn('No zones provided - writing empty zone blocks', 'Protocol');
    } else {
      const encodedZones = zonesToWrite.map((zone, idx) => encodeZone(zone, idx + 1));
      log.debug(`Encoded ${encodedZones.length} zones`, 'Protocol');
      
      // Write all zones to the fresh data
      // Zones are 145 bytes each, starting at offset 16
      // Zone N is at: 16 + (N - 1) * 145
      for (let i = 0; i < encodedZones.length; i++) {
        const zoneOffset = OFFSET.ZONE_START + (i * BLOCK_SIZE.ZONE);
        if (zoneOffset + BLOCK_SIZE.ZONE > allZoneData.length) {
          log.error(`Zone ${i + 1} would exceed block size: offset ${zoneOffset}, data length ${allZoneData.length}`, 'Protocol');
          throw new Error(`Zone ${i + 1} would exceed block size`);
        }
        
        allZoneData.set(encodedZones[i], zoneOffset);
      }
      
      // Write 0x0000 terminator after the last zone to indicate end of zones
      const lastZoneOffset = OFFSET.ZONE_START + (encodedZones.length * BLOCK_SIZE.ZONE);
      if (lastZoneOffset + 2 <= allZoneData.length) {
        allZoneData[lastZoneOffset] = 0x00;
        allZoneData[lastZoneOffset + 1] = 0x00;
        log.debug(`Wrote zone terminator (0x0000) at offset ${lastZoneOffset} after ${encodedZones.length} zones`, 'Protocol');
      } else {
        log.warn(`Cannot write zone terminator: offset ${lastZoneOffset} would exceed block size (${allZoneData.length})`, 'Protocol');
      }
    }
    
    // Split into blocks and set metadata
    for (let blockIdx = 0; blockIdx < zoneBlocks.length; blockIdx++) {
      const block = zoneBlocks[blockIdx];
      
      // Get original block data for comparison (only if we have cached data)
      const originalBlockData = originalZoneData ? originalZoneData.slice(blockIdx * BLOCK_SIZE.STANDARD, (blockIdx + 1) * BLOCK_SIZE.STANDARD) : null;
      
      // Calculate how many zones are in this block
      // First block: zones start at byte 16, max (4096-16)/145 = 28 zones
      // Subsequent blocks: zones start at byte 0, max 4096/145 = 28 zones
      const isFirstBlock = blockIdx === 0;
      const maxZonesFirstBlock = Math.floor((BLOCK_SIZE.STANDARD - OFFSET.ZONE_START) / BLOCK_SIZE.ZONE); // 28
      const maxZonesPerBlock = Math.floor(BLOCK_SIZE.STANDARD / BLOCK_SIZE.ZONE); // 28
      
      let firstZoneIdx: number;
      let zonesInBlock: number;
      
      if (isFirstBlock) {
        firstZoneIdx = 0;
        zonesInBlock = Math.min(zonesToWrite.length, maxZonesFirstBlock);
      } else {
        firstZoneIdx = maxZonesFirstBlock + ((blockIdx - 1) * maxZonesPerBlock);
        zonesInBlock = Math.min(zonesToWrite.length - firstZoneIdx, maxZonesPerBlock);
      }
      
      log.verbose(`Block ${blockIdx}: firstZoneIdx=${firstZoneIdx}, zonesInBlock=${zonesInBlock}, totalZones=${zonesToWrite.length}, isFirstBlock=${isFirstBlock}`, 'Protocol');
      
      // Create a new block data array initialized with 0xFF
      const blockData = new Uint8Array(BLOCK_SIZE.STANDARD);
      blockData.fill(0xFF);
      
      // Copy zone data for this block from allZoneData
      if (zonesInBlock > 0) {
        // Calculate source offset in allZoneData (zones always start at byte 16 in allZoneData)
        const sourceOffset = OFFSET.ZONE_START + (firstZoneIdx * BLOCK_SIZE.ZONE);
        const sourceLength = zonesInBlock * BLOCK_SIZE.ZONE;
        const sourceData = allZoneData.slice(sourceOffset, sourceOffset + sourceLength);
        
        // First block: zones start at byte 16, subsequent blocks: zones start at byte 0
        const destOffset = isFirstBlock ? OFFSET.ZONE_START : 0;
        blockData.set(sourceData, destOffset);
        
        // Only set zone count at byte 0 for the first block
        if (isFirstBlock) {
          const zoneCount = Math.min(Math.max(zonesInBlock, 1), 28); // Clamp to 1-28
          blockData[0] = zoneCount;
          log.debug(`Set zone count in byte 0: ${zoneCount} zones for first block`, 'Protocol');
          
          // Preserve the original bytes 1-15 if available (to match original structure)
          if (originalBlockData) {
            blockData.set(originalBlockData.slice(1, 16), 1);
            log.verbose(`Preserved original bytes 1-15 for first block: ${Array.from(originalBlockData.slice(1, 16)).map(b => `0x${b.toString(16).padStart(2, '0')}`).join(' ')}`, 'Protocol');
          }
        } else {
          log.debug(`Block ${blockIdx} is not first block, zones start at byte 0 (no header)`, 'Protocol');
        }
      } else {
        if (isFirstBlock) {
          blockData[0] = 0; // No zones in first block
          log.debug(`First block has no zones, setting byte 0 to 0`, 'Protocol');
        }
      }
      
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
        log.verbose(`===== Zone Block ${blockIdx} Comparison (Address: ${blockComparison.address}) =====`, 'Protocol');
        
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
          log.verbose(`✓ Block ${blockIdx} is IDENTICAL to original (all ${BLOCK_SIZE.STANDARD} bytes match)`, 'Protocol');
        } else {
          log.verbose(`✗ Block ${blockIdx} has ${blockComparison.differences} differences out of ${BLOCK_SIZE.STANDARD} bytes`, 'Protocol');
          log.verbose(`First ${Math.min(50, blockComparison.differencePositions.length)} difference positions: ${blockComparison.differencePositions.slice(0, 50).join(', ')}`, 'Protocol');
          
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
              
              log.verbose(`Zone ${zoneNum} (offset ${zoneOffset}): Original name="${origName}", channels=${origChCount}; New name="${newName}", channels=${newChCount}`, 'Protocol');
              
              if (!zoneComp.matches) {
                log.verbose(`✗ MISMATCH!`, 'Protocol');
                // Show hex comparison for first 32 bytes
                const origHex = Array.from(origZone.slice(0, 32)).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
                const newHex = Array.from(newZone.slice(0, 32)).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
                log.verbose(`Original hex (first 32): ${origHex}`, 'Protocol');
                log.verbose(`New hex (first 32): ${newHex}`, 'Protocol');
              } else {
                log.verbose(`✓ Zone ${zoneNum} matches`, 'Protocol');
              }
            }
          }
        }
        
        // Show metadata byte comparison
        blockComparison.originalMetadata = originalBlockData[0xFFF];
        blockComparison.newMetadata = blockData[0xFFF];
        blockComparison.metadataMatch = blockComparison.originalMetadata === blockComparison.newMetadata;
        
        if (!blockComparison.metadataMatch) {
          log.verbose(`✗ Metadata byte mismatch: original=0x${blockComparison.originalMetadata.toString(16)}, new=0x${blockComparison.newMetadata.toString(16)}`, 'Protocol');
        } else {
          log.verbose(`✓ Metadata byte matches: 0x${blockComparison.originalMetadata.toString(16)}`, 'Protocol');
        }
        
        log.verbose(`===== End Block ${blockIdx} Comparison =====`, 'Protocol');
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
      
      // Write scan lists to fixed 57-byte boundaries: (57 * N) - 56
      // Entry 1 at offset 1, Entry 2 at offset 58, Entry 3 at offset 115, etc.
      for (let i = 0; i < encodedScanLists.length; i++) {
        const listNum = i + 1; // 1-indexed
        const scanListOffset = (BLOCK_SIZE.SCAN_LIST * listNum) - 56;
        
        if (scanListOffset + BLOCK_SIZE.SCAN_LIST > allScanListData.length) {
          throw new Error(`Scan list ${listNum} would exceed block size (offset ${scanListOffset})`);
        }
        
        allScanListData.set(encodedScanLists[i], scanListOffset);
      }
      
      // Write count at offset 0x00 AFTER all entries
      const scanListCount = Math.min(scanLists.length, LIMITS.SCAN_LISTS_MAX);
      allScanListData[0x00] = scanListCount;
      log.debug(`Smart write: Set scan list count to ${scanListCount} at offset 0x00`, 'Protocol');
      log.debug(`Smart write: First 32 bytes = [${Array.from(allScanListData.slice(0, 32)).map(b => b.toString(16).padStart(2, '0')).join(' ')}]`, 'Protocol');
      
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
    
    for (const block of finalBlocksToWrite) {
      const metadataHex = `0x${block.metadata.toString(16).padStart(2, '0').toUpperCase()}`;
      const addressHex = `0x${block.address.toString(16).padStart(6, '0')}`;
      log.debug(`${metadataHex} at ${addressHex} (${block.data.length} bytes)`, 'Protocol');
    }
    
    // Step 5: Write all blocks to radio in the correct order
    this.onProgress?.(60, `Writing ${finalBlocksToWrite.length} blocks to radio in correct order...`);
    
    for (let i = 0; i < finalBlocksToWrite.length; i++) {
      const block = finalBlocksToWrite[i];
      const progress = 60 + Math.floor((i / finalBlocksToWrite.length) * 40);
      const metadataHex = `0x${block.metadata.toString(16).padStart(2, '0').toUpperCase()}`;
      const addressHex = `0x${block.address.toString(16).padStart(6, '0').toUpperCase()}`;
      
      log.debug(`Writing block ${i + 1}/${finalBlocksToWrite.length}: Address=${addressHex}, Metadata=${metadataHex}, Size=${block.data.length} bytes`, 'Protocol');
      log.verbose(`Data preview (first 32 bytes): ${Array.from(block.data.slice(0, 32)).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ')}`, 'Protocol');
      log.verbose(`Metadata byte at 0xFFF: 0x${block.data[0xFFF].toString(16).padStart(2, '0').toUpperCase()}`, 'Protocol');
      
      this.onProgress?.(progress, `Writing block ${i + 1} of ${finalBlocksToWrite.length} (${metadataHex})...`);
      
      // Verify connection is still valid before writing
      if (!this.connection) {
        throw new Error('Connection lost - cannot write block. Please reconnect and try again.');
      }
      
      try {
        await this.connection.writeMemory(block.address, block.data, block.metadata);
        log.info(`Successfully wrote block ${i + 1}/${finalBlocksToWrite.length} at ${addressHex}`, 'Protocol');
      } catch (error) {
        log.error(`Failed to write block ${i + 1}/${finalBlocksToWrite.length} at ${addressHex} (metadata: ${metadataHex})`, 'Protocol', error);
        log.error(`Block data size: ${block.data.length} bytes, metadata byte: 0x${block.data[0xFFF].toString(16).padStart(2, '0').toUpperCase()}, expected: ${metadataHex}`, 'Protocol');
        throw error;
      }
      
      if (i < finalBlocksToWrite.length - 1) {
        await new Promise(resolve => setTimeout(resolve, CONNECTION.BLOCK_READ_DELAY));
      }
    }

    this.onProgress?.(100, 'Successfully wrote all data to radio');
    const changedCount = blocksToWrite.length;
    const totalCount = finalBlocksToWrite.length;
    log.info(`Smart write complete: Wrote ${totalCount} blocks total (${changedCount} changed, ${totalCount - changedCount} from cache)`, 'Protocol');
    log.info(`- ${channels.length} channels, ${zones.length} zones, ${scanLists.length} scan lists`, 'Protocol');
    
    // Step 6: Write TX Contact blocks (0x42 and 0x43) for digital channels
    // This must be done after writing channels, and we need to confirm block locations first
    if (channels.length > 0) {
      this.onProgress?.(95, 'Writing TX Contact data...');
      await this.writeTxContactBlocks(channels);
    }
  }
}

