/**
 * DM-32UV Protocol Implementation
 * Main protocol interface implementation using Web Serial API
 */

import { DM32Connection } from './connection';
import { discoverMemoryBlocks, readChannelCount, readChannelBlocks, type MemoryBlock } from './memory';
import { parseChannel, parseZones, parseScanLists } from './structures';
import type { RadioProtocol, RadioInfo } from '../interface';
import type { Channel, Zone, Contact, RadioSettings, ScanList } from '../../models';

export class DM32UVProtocol implements RadioProtocol {
  private connection: DM32Connection | null = null;
  private port: any = null; // SerialPort from Web Serial API
  private radioInfo: RadioInfo | null = null;
  public onProgress?: (progress: number, message: string) => void;
  public rawChannelData: Map<number, { data: Uint8Array; blockAddr: number; offset: number }> = new Map();
  public rawZoneData: Map<string, { data: Uint8Array; zoneNum: number; offset: number }> = new Map();
  public rawScanListData: Map<string, { data: Uint8Array; listNum: number; offset: number }> = new Map();
  public blockMetadata: Map<number, { metadata: number; type: string }> = new Map();
  public blockData: Map<number, Uint8Array> = new Map();
  private discoveredBlocks: MemoryBlock[] = []; // Store discovered blocks for reuse

  async connect(): Promise<void> {
    try {
      // Request serial port
      if (!('serial' in navigator)) {
        throw new Error('Web Serial API not supported. Please use Chrome/Edge.');
      }

      const port = await (navigator as any).serial.requestPort();
      
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
          await port.open({ baudRate: 115200 });
        } catch (e: any) {
          // If it says already open (race condition), check for locked streams
          if (e.message && e.message.includes('already open')) {
            if (port.readable?.locked || port.writable?.locked) {
              throw new Error('Port is in use by another connection. Please wait for the previous operation to complete.');
            }
            console.log('Port opened by another process, will use existing connection');
          } else {
            throw new Error(`Failed to open port: ${e instanceof Error ? e.message : 'Unknown error'}`);
          }
        }
      }
      
      // Brief delay after opening port (as per spec)
      await new Promise(resolve => setTimeout(resolve, 100));

      this.port = port;
      this.connection = new DM32Connection();
      await this.connection.connect(port);

      // Query V-frames to get radio info
      const vframes = await this.connection.queryVFrames();

      // Parse firmware version (V-frame 0x01)
      const firmwareData = vframes.get(0x01);
      const firmware = firmwareData ? new TextDecoder().decode(firmwareData).replace(/\0/g, '').trim() : 'Unknown';

      // Parse build date (V-frame 0x03)
      const buildDateData = vframes.get(0x03);
      const buildDate = buildDateData ? new TextDecoder().decode(buildDateData).replace(/\0/g, '').trim() : '';

      // Parse DSP version (V-frame 0x04)
      const dspData = vframes.get(0x04);
      const dspVersion = dspData ? new TextDecoder().decode(dspData).replace(/\0/g, '').trim() : '';

      // Parse radio version (V-frame 0x05)
      const radioVersionData = vframes.get(0x05);
      const radioVersion = radioVersionData ? new TextDecoder().decode(radioVersionData).replace(/\0/g, '').trim() : '';

      // Parse code plug version (V-frame 0x0B)
      const codeplugData = vframes.get(0x0B);
      const codeplugVersion = codeplugData ? new TextDecoder().decode(codeplugData).replace(/\0/g, '').trim() : '';

      // Parse memory layout (V-frame 0x0A) - Main config block range
      // Format from serial capture: 56 0a 08 00 10 00 00 ff 8f 0c 00
      // Header: 56 0a 08 (V, ID, length=8)
      // Data: 00 10 00 00 ff 8f 0c 00 (8 bytes: start_addr + end_addr, both little-endian)
      const configRange = vframes.get(0x0A);
      if (!configRange || configRange.length < 8) {
        throw new Error('Failed to get memory layout');
      }

      // V-frame 0x0A data format: 8 bytes = start_addr (4 bytes LE) + end_addr (4 bytes LE)
      // Example: 00 10 00 00 = 0x001000, ff 8f 0c 00 = 0x0C8FFF
      const startAddr = configRange[0] | (configRange[1] << 8) | (configRange[2] << 16) | (configRange[3] << 24);
      const endAddr = configRange[4] | (configRange[5] << 8) | (configRange[6] << 16) | (configRange[7] << 24);

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

  isConnected(): boolean {
    return this.connection !== null && this.port !== null;
  }

  async getRadioInfo(): Promise<RadioInfo> {
    if (!this.radioInfo) {
      throw new Error('Not connected to radio');
    }
    return this.radioInfo;
  }

  async readChannels(): Promise<Channel[]> {
    if (!this.connection || !this.radioInfo) {
      throw new Error('Not connected to radio');
    }

    this.onProgress?.(0, 'Discovering channel blocks...');

    // Discover channel blocks
    // V-frame 0x0A gives us the range: 200 blocks (800KB / 4KB)
    // We read 1 byte at offset 0xFFF for each block
    const blocks = await discoverMemoryBlocks(
      this.connection,
      this.radioInfo.memoryLayout.configStart,
      this.radioInfo.memoryLayout.configEnd,
      (current, total) => {
        const progress = Math.floor((current / total) * 20); // 0-20% for discovery
        this.onProgress?.(progress, `Reading metadata ${current} of ${total}...`);
      }
    );

    // Store discovered blocks for reuse in zone/scan list reading
    this.discoveredBlocks = blocks;
    
    // Store all block metadata for debug export
    const blockMetadataMap = new Map<number, { metadata: number; type: string }>();
    for (const block of blocks) {
      if (block.metadata !== 0x00 && block.metadata !== 0xFF) {
        blockMetadataMap.set(block.address, {
          metadata: block.metadata,
          type: block.type,
        });
      }
    }
    (this as any).allBlockMetadata = blockMetadataMap;

    const channelBlocks = blocks.filter(b => b.type === 'channel');
    if (channelBlocks.length === 0) {
      throw new Error('No channel blocks found');
    }

    // Sort channel blocks by metadata (0x12 = first, 0x13 = second, etc.)
    channelBlocks.sort((a, b) => a.metadata - b.metadata);
    
    // Find the first channel block (metadata 0x12)
    const firstChannelBlock = channelBlocks.find(b => b.metadata === 0x12);
    if (!firstChannelBlock) {
      throw new Error('First channel block (metadata 0x12) not found');
    }

    // Calculate metadata range for logging
    // Metadata ranges from 0x12 to 0x41 (48 blocks max)
    const maxMetadata = Math.max(...channelBlocks.map(b => b.metadata));
    const minMetadata = Math.min(...channelBlocks.map(b => b.metadata));
    console.log(`Found ${channelBlocks.length} channel blocks (metadata range: 0x${minMetadata.toString(16)}-0x${maxMetadata.toString(16)})`);

    this.onProgress?.(10, `Found ${channelBlocks.length} channel blocks`);

    // Read channel count from first 4 bytes of first block (metadata 0x12)
    console.log(`Reading channel count from first block (metadata 0x12) at 0x${firstChannelBlock.address.toString(16)}`);
    const channelCount = await readChannelCount(this.connection, firstChannelBlock.address);
    console.log(`Channel count: ${channelCount}`);
    this.onProgress?.(20, `Reading ${channelCount} channels from ${channelBlocks.length} blocks...`);

    // Read all channel blocks
    const channelBlockData = await readChannelBlocks(
      this.connection,
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

      const isFirstBlock = block.metadata === 0x12;
      const startOffset = isFirstBlock ? 0x10 : 0x00; // First block starts at 0x10, others at 0x00
      
      // First block has 84 channels (not 85) due to the 16-byte header
      // Last channel in first block is at: 0x10 + 83*48 = 0xFA0 (4000)
      // Subsequent blocks have 85 channels each
      const maxOffset = isFirstBlock 
        ? 0x10 + 83 * 48  // First block: stop at offset 0xFA0 (4000) = 84 channels
        : blockDataBytes.length - 48; // Other blocks: use full block (85 channels)
      
      console.log(`Processing block metadata 0x${block.metadata.toString(16)} at 0x${block.address.toString(16)}, isFirst: ${isFirstBlock}, startOffset: 0x${startOffset.toString(16)}, maxOffset: 0x${maxOffset.toString(16)}`);

      for (let offset = startOffset; offset <= maxOffset; offset += 48) {
        // Stop if we've reached the channel count
        if (channelIndex > channelCount) {
          console.log(`Reached channel count limit (${channelCount}), stopping`);
          break;
        }

        try {
          const channelData = blockDataBytes.slice(offset, offset + 48);
          if (channelData.length < 48) {
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

  async writeChannels(_channels: Channel[]): Promise<void> {
    // TODO: Implement channel writing
    throw new Error('Channel writing not yet implemented');
  }

  async readZones(): Promise<Zone[]> {
    if (!this.connection || !this.radioInfo) {
      throw new Error('Not connected to radio');
    }

    this.onProgress?.(0, 'Reading zones...');

    // Reuse discovered blocks from channel reading
    if (this.discoveredBlocks.length === 0) {
      throw new Error('No blocks discovered. Read channels first.');
    }

    // Zone metadata identified from debug export: 0x5c (92)
    // Found DEFCON and Vector zones in block with metadata 0x5c
    const zoneMetadata = 0x5c;
    const zoneBlocks = this.discoveredBlocks.filter(b => b.metadata === zoneMetadata);
    console.log(`Found ${zoneBlocks.length} zone blocks (metadata 0x${zoneMetadata.toString(16)})`);

    if (zoneBlocks.length === 0) {
      console.log('No zone blocks found');
      this.onProgress?.(100, 'No zones found');
      return [];
    }

    // Read all zone blocks and concatenate
    let allZoneData = new Uint8Array(0);
    for (let i = 0; i < zoneBlocks.length; i++) {
      const block = zoneBlocks[i];
      this.onProgress?.(Math.floor((i / zoneBlocks.length) * 50), `Reading zone block ${i + 1} of ${zoneBlocks.length}...`);
      const blockData = await this.connection.readMemory(block.address, 4096);
      const newAllZoneData = new Uint8Array(allZoneData.length + blockData.length);
      newAllZoneData.set(allZoneData);
      newAllZoneData.set(blockData, allZoneData.length);
      allZoneData = newAllZoneData;
      
      // Add delay between block reads to avoid overwhelming the radio
      if (i < zoneBlocks.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }

    this.onProgress?.(50, 'Parsing zone data...');
    const zones = parseZones(allZoneData, (zoneNum, rawData, name) => {
      // Store raw zone data for debug export
      if (!(this as any).rawZoneData) {
        (this as any).rawZoneData = new Map();
      }
      (this as any).rawZoneData.set(name, {
        data: new Uint8Array(rawData),
        zoneNum: zoneNum,
        offset: 16 + (zoneNum - 1) * 145, // Zones are 145 bytes apart, starting at offset 16
      });
    });

    console.log(`Successfully parsed ${zones.length} zones`);
    this.onProgress?.(100, `Successfully read ${zones.length} zones`);
    return zones;
  }

  async writeZones(_zones: Zone[]): Promise<void> {
    // TODO: Implement zone writing
    throw new Error('Zone writing not yet implemented');
  }

  async readScanLists(): Promise<ScanList[]> {
    if (!this.connection || !this.radioInfo) {
      throw new Error('Not connected to radio');
    }

    this.onProgress?.(0, 'Reading scan lists...');

    // Reuse discovered blocks from channel reading
    if (this.discoveredBlocks.length === 0) {
      throw new Error('No blocks discovered. Read channels first.');
    }

    const scanBlocks = this.discoveredBlocks.filter(b => b.type === 'scan' && b.metadata === 0x11);
    console.log(`Found ${scanBlocks.length} scan list blocks (metadata 0x11)`);

    if (scanBlocks.length === 0) {
      console.log('No scan list blocks found');
      this.onProgress?.(100, 'No scan lists found');
      return [];
    }

    // Read all scan list blocks and concatenate
    let allScanListData = new Uint8Array(0);
    for (let i = 0; i < scanBlocks.length; i++) {
      const block = scanBlocks[i];
      this.onProgress?.(Math.floor((i / scanBlocks.length) * 50), `Reading scan list block ${i + 1} of ${scanBlocks.length}...`);
      const blockData = await this.connection.readMemory(block.address, 4096);
      const newAllScanListData = new Uint8Array(allScanListData.length + blockData.length);
      newAllScanListData.set(allScanListData);
      newAllScanListData.set(blockData, allScanListData.length);
      allScanListData = newAllScanListData;
      
      // Add delay between block reads to avoid overwhelming the radio
      if (i < scanBlocks.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }

    this.onProgress?.(50, 'Parsing scan list data...');
    const scanLists = parseScanLists(allScanListData, (listNum, rawData, name) => {
      // Store raw scan list data for debug export
      if (!(this as any).rawScanListData) {
        (this as any).rawScanListData = new Map();
      }
      (this as any).rawScanListData.set(name, {
        data: new Uint8Array(rawData),
        listNum: listNum,
        offset: listNum <= 44 ? 16 + (listNum - 1) * 92 : (listNum - 45) * 92,
      });
    });

    console.log(`Successfully parsed ${scanLists.length} scan lists`);
    this.onProgress?.(100, `Successfully read ${scanLists.length} scan lists`);
    return scanLists;
  }

  async writeScanLists(_scanLists: ScanList[]): Promise<void> {
    // TODO: Implement scan list writing
    throw new Error('Scan list writing not yet implemented');
  }

  async readContacts(): Promise<Contact[]> {
    if (!this.connection || !this.radioInfo) {
      throw new Error('Not connected to radio');
    }

    // TODO: Find contact block and parse
    this.onProgress?.(0, 'Reading contacts...');
    this.onProgress?.(100, 'Contact reading not yet implemented');
    // Contact blocks are typically at higher addresses (0x278000+)
    // Need to implement contact block discovery
    return [];
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
}

