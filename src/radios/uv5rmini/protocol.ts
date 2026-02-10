/**
 * UV5R-Mini protocol: implements RadioProtocol (Serial and BLE).
 */

import type { RadioProtocol, RadioInfo } from '../../types/radio';
import type { Channel, Zone, Contact, RadioSettings, ScanList, DMRRadioID } from '../../models';
import { UV5RMiniSerialConnection, openUV5RMiniPort } from './serialConnection';
import { UV5RMiniBleConnection, requestUV5RMiniBleDevice } from './bleConnection';
import {
  BAOFENG_MEM_STARTS,
  BAOFENG_MEM_SIZES,
  BAOFENG_BLOCK_SIZE,
  BAOFENG_CLONE_BLOCK_COUNT,
  BAOFENG_CHANNEL_COUNT,
  BAOFENG_CHANNEL_SIZE,
} from './constants';
import { parseChannelsFromImage, writeChannelToImage, type Uv5rMiniChannelRaw } from './channelFormat';
import { uv5rMiniRawToChannel, channelToUv5rMiniRaw } from './channelMapping';

const UV5RMINI_MODEL = 'UV5R-Mini';

type ConnectionLike = {
  readBlock(addr: number): Promise<Uint8Array>;
  writeBlock(addr: number, block: Uint8Array): Promise<void>;
  handshakeUpload(): Promise<void>;
  disconnect(): Promise<void>;
};

export class UV5RMiniProtocol implements RadioProtocol {
  private connection: ConnectionLike | null = null;
  private port: import('./serialConnection').UV5RMiniSerialPort | null = null;
  public onProgress?: (progress: number, message: string) => void;

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
    return {
      model: UV5RMINI_MODEL,
      firmware: '',
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
    const channelRegion = image.subarray(0, BAOFENG_CHANNEL_COUNT * BAOFENG_CHANNEL_SIZE);
    const rawChannels = parseChannelsFromImage(channelRegion);
    return rawChannels.map((raw) => uv5rMiniRawToChannel(raw));
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

  async readZones(): Promise<Zone[]> {
    return [];
  }

  async writeZones(_zones: Zone[]): Promise<void> {
    // no-op
  }

  async readScanLists(): Promise<ScanList[]> {
    return [];
  }

  async readDMRRadioIDs(): Promise<DMRRadioID[]> {
    return [];
  }

  async writeDMRRadioIDs(_ids: DMRRadioID[]): Promise<void> {
    // no-op
  }

  async readContacts(): Promise<Contact[]> {
    return [];
  }

  async writeContacts(_contacts: Contact[]): Promise<void> {
    // no-op
  }

  async readRadioSettings(): Promise<RadioSettings | null> {
    return null;
  }

  async writeRadioSettings(_settings: RadioSettings): Promise<void> {
    // no-op
  }
}
