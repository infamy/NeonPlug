/**
 * UV5R-Mini protocol: implements RadioProtocol (Serial and BLE).
 */

import type { RadioInfo } from '../../types/radio';
import type { Channel, RadioSettings } from '../../models';
import type { Uv5rMiniSettings } from '../../types/uv5rMiniSettings';
import { BaseRadioProtocol } from '../shared/BaseRadioProtocol';
import { UV5RMiniSerialConnection, openUV5RMiniPort } from './serialConnection';
import { UV5RMiniBleConnection, requestUV5RMiniBleDevice } from './bleConnection';
import {
  BAOFENG_MEM_STARTS,
  BAOFENG_MEM_SIZES,
  BAOFENG_BLOCK_SIZE,
  BAOFENG_CLONE_BLOCK_COUNT,
  BAOFENG_CHANNEL_COUNT,
  BAOFENG_CHANNEL_SIZE,
  BAOFENG_FW_VER_OFFSET,
} from './constants';
import { parseChannelsFromImage, writeChannelToImage, type Uv5rMiniChannelRaw } from './channelFormat';
import { uv5rMiniRawToChannel, channelToUv5rMiniRaw } from './channelMapping';
import { parseUv5rMiniSettings, writeUv5rMiniSettings, UV5RMINI_SETTINGS_OFFSET } from './settingsFormat';

const UV5RMINI_MODEL = 'UV5R-Mini';

type ConnectionLike = {
  readBlock(addr: number): Promise<Uint8Array>;
  writeBlock(addr: number, block: Uint8Array): Promise<void>;
  handshakeUpload(): Promise<void>;
  disconnect(): Promise<void>;
};

export class UV5RMiniProtocol extends BaseRadioProtocol {
  private connection: ConnectionLike | null = null;
  private port: import('./serialConnection').UV5RMiniSerialPort | null = null;
  /** Cached image from last readChannels (used by readRadioSettings and getFirmwareFromCache). */
  private cachedImage: Uint8Array | null = null;

  /** Parse firmware string from cached clone image (call after readChannels). Used to enrich radioInfo. */
  getFirmwareFromCache(): string {
    const img = this.cachedImage;
    if (!img || img.length <= BAOFENG_FW_VER_OFFSET) return '';
    const slice = img.subarray(BAOFENG_FW_VER_OFFSET);
    let end = 0;
    const maxLen = Math.min(24, slice.length);
    while (end < maxLen) {
      const b = slice[end];
      if (b === 0x00 || b === 0xff || b < 0x20 || b > 0x7e) break;
      end++;
    }
    return String.fromCharCode(...slice.subarray(0, end)).trim();
  }

  async connect(portOrOptions?: string | { forcePortSelection?: boolean; transport?: 'serial' | 'ble' }): Promise<void> {
    const options =
      typeof portOrOptions === 'object' && portOrOptions != null ? portOrOptions : {};
    const forcePortSelection = options.forcePortSelection ?? false;
    const transport = options.transport ?? 'serial';

    if (transport === 'ble') {
      const device = await requestUV5RMiniBleDevice();
      const bleConn = new UV5RMiniBleConnection();
      await bleConn.connect(device);
      this.connection = bleConn;
      this.port = null;
    } else {
      this.port = await openUV5RMiniPort(forcePortSelection);
      const serialConn = new UV5RMiniSerialConnection();
      await serialConn.connect(this.port);
      this.connection = serialConn;
    }
  }

  async disconnect(): Promise<void> {
    this.cachedImage = null;
    if (this.connection) {
      await this.connection.disconnect();
      this.connection = null;
    }
    if (this.port) {
      try {
        await this.port.close();
      } catch {
        /* ignore */
      }
      this.port = null;
    }
  }

  isConnected(): boolean {
    return this.connection != null;
  }

  async getRadioInfo(): Promise<RadioInfo> {
    let firmware = '';
    if (this.connection) {
      try {
        const blockAddr = Math.floor(BAOFENG_FW_VER_OFFSET / BAOFENG_BLOCK_SIZE) * BAOFENG_BLOCK_SIZE;
        const block = await this.connection.readBlock(blockAddr);
        const offsetInBlock = BAOFENG_FW_VER_OFFSET - blockAddr;
        const slice = block.subarray(offsetInBlock);
        let end = 0;
        const maxLen = Math.min(24, slice.length);
        while (end < maxLen) {
          const b = slice[end];
          if (b === 0x00 || b === 0xff || b < 0x20 || b > 0x7e) break;
          end++;
        }
        firmware = String.fromCharCode(...slice.subarray(0, end)).trim();
      } catch {
        /* ignore; firmware remains empty */
      }
    }
    return {
      model: UV5RMINI_MODEL,
      firmware,
      buildDate: '',
      maxContacts: 0,
      memoryLayout: { configStart: 0x0000, configEnd: 0x8240 - 1 },
    };
  }

  /** Full clone: read all blocks, build image, parse channels. */
  async readChannels(): Promise<Channel[]> {
    if (!this.connection) throw new Error('Not connected');
    const image = new Uint8Array(0x8240);
    let offset = 0;
    let blockIndex = 0;
    for (let r = 0; r < BAOFENG_MEM_STARTS.length; r++) {
      const start = BAOFENG_MEM_STARTS[r];
      const size = BAOFENG_MEM_SIZES[r];
      for (let i = 0; i < size; i += BAOFENG_BLOCK_SIZE) {
        const addr = start + i;
        const block = await this.connection.readBlock(addr);
        image.set(block, offset);
        offset += BAOFENG_BLOCK_SIZE;
        blockIndex++;
        if (this.onProgress && blockIndex % 20 === 0) {
          this.onProgress(
            (blockIndex / BAOFENG_CLONE_BLOCK_COUNT) * 100,
            `Reading block ${blockIndex}/${BAOFENG_CLONE_BLOCK_COUNT}`
          );
        }
      }
    }
    this.cachedImage = image;
    const channelRegion = image.subarray(0, BAOFENG_CHANNEL_COUNT * BAOFENG_CHANNEL_SIZE);
    const rawChannels = parseChannelsFromImage(channelRegion);
    // Exclude empty channels (raw[0] === 0xff) - UV5R-Mini has no channel counter in memory
    return rawChannels
      .filter((raw) => !raw.empty)
      .map((raw) => uv5rMiniRawToChannel(raw));
  }

  /** Write channels: build image from channels, then write blocks (upload handshake first). */
  async writeChannels(channels: Channel[]): Promise<void> {
    if (!this.connection) throw new Error('Not connected');
    await this.connection.handshakeUpload();

    const image = new Uint8Array(0x8240);
    image.fill(0xff);
    const rawList: Uv5rMiniChannelRaw[] = channels
      .filter((c) => c.number >= 1 && c.number <= BAOFENG_CHANNEL_COUNT)
      .slice(0, BAOFENG_CHANNEL_COUNT)
      .map((c) => channelToUv5rMiniRaw(c));
    for (let i = 0; i < rawList.length; i++) {
      const raw = rawList[i];
      const idx = raw.num - 1;
      if (idx >= 0 && idx < BAOFENG_CHANNEL_COUNT) {
        writeChannelToImage(image, idx, raw);
      }
    }

    let written = 0;
    const totalBlocks = Math.ceil((BAOFENG_CHANNEL_COUNT * BAOFENG_CHANNEL_SIZE) / BAOFENG_BLOCK_SIZE);
    for (let addr = 0; addr < BAOFENG_CHANNEL_COUNT * BAOFENG_CHANNEL_SIZE; addr += BAOFENG_BLOCK_SIZE) {
      const block = image.subarray(addr, addr + BAOFENG_BLOCK_SIZE);
      await this.connection.writeBlock(addr, block);
      written++;
      if (this.onProgress && written % 20 === 0) {
        this.onProgress((written / totalBlocks) * 100, `Writing block ${written}/${totalBlocks}`);
      }
    }
  }

  override async readRadioSettings(): Promise<RadioSettings | null> {
    const image = this.cachedImage;
    if (!image || image.length < 0x8080) return null;
    const radioSpecific = parseUv5rMiniSettings(image);
    if (!radioSpecific) return null;
    return { radioSpecific } as unknown as RadioSettings;
  }

  override async writeRadioSettings(settings: RadioSettings, _options?: { changedFields?: string[] }): Promise<void> {
    const radioSpecific = settings.radioSpecific as Uv5rMiniSettings | undefined;
    if (!radioSpecific || !this.connection) return;
    // Read current settings block from radio, merge our changes, write back
    const block = await this.connection.readBlock(UV5RMINI_SETTINGS_OFFSET);
    const image = new Uint8Array(UV5RMINI_SETTINGS_OFFSET + 64);
    image.fill(0xff);
    image.set(block, UV5RMINI_SETTINGS_OFFSET);
    writeUv5rMiniSettings(image, radioSpecific);
    await this.connection.writeBlock(UV5RMINI_SETTINGS_OFFSET, image.subarray(UV5RMINI_SETTINGS_OFFSET));
  }
}
