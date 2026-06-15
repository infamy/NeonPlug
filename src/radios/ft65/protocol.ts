/**
 * FT65Protocol: RadioProtocol for the Yaesu FT-65/FT-4/FT-25 family.
 * Analog-only, 200 channels, serial via SCU-35 cable.
 *
 * Clone mode is self-contained per operation (mirrors CHIRP do_download/do_upload):
 *   enterCloneMode() → blocks → sendEnd()
 * The port stays open between operations; each read/write enters/exits independently.
 */

import type { RadioInfo } from '../../types/radio';
import type { Channel, RadioSettings } from '../../models';
import type { Ft65Settings } from '../../types/ft65Settings';
import { BaseAnalogProtocol } from '../shared/BaseProtocols';
import { FT65Connection, openFT65Port, type FT65SerialPort } from './connection';
import { FT65_NUM_BLOCKS, FT65_BLOCK_SIZE, FT65_MEM_SIZE } from './constants';
import { parseAllChannels, encodeChannel, clearChannelRegions } from './structures';
import { parseFt65Settings, writeFt65Settings } from './settingsFormat';

export class FT65Protocol extends BaseAnalogProtocol {
  private conn: FT65Connection | null = null;
  private port: FT65SerialPort | null = null;
  private cachedImage: Uint8Array | null = null;
  private pendingSettings: Ft65Settings | null = null;

  constructor(
    private readonly modelId: string,
    private readonly idPrefixes: string[],
    private readonly offsetFactor: number,
    private readonly maxNameLen: number = 8,
  ) {
    super();
  }

  async connect(
    portOrOptions?: string | { forcePortSelection?: boolean; transport?: string }
  ): Promise<void> {
    const opts = typeof portOrOptions === 'object' ? portOrOptions : {};
    const forceSelection = opts.forcePortSelection ?? false;

    this.port = await openFT65Port(forceSelection);
    const conn = new FT65Connection();
    conn.validIdPrefixes = this.idPrefixes;
    await conn.open(this.port);
    this.conn = conn;
  }

  async disconnect(): Promise<void> {
    this.cachedImage = null;
    this.pendingSettings = null;
    if (this.conn) {
      await this.conn.close();
      this.conn = null;
    }
    this.port = null;
  }

  isConnected(): boolean {
    return this.conn !== null;
  }

  async getRadioInfo(): Promise<RadioInfo> {
    return {
      model: this.modelId,
      firmware: '',
      buildDate: '',
      memoryLayout: { configStart: 0x0000, configEnd: FT65_MEM_SIZE - 1 },
    };
  }

  async readChannels(): Promise<Channel[]> {
    if (!this.conn) throw new Error('Not connected');

    await this.conn.enterCloneMode();

    const image = new Uint8Array(FT65_MEM_SIZE);
    for (let block = 0; block < FT65_NUM_BLOCKS; block++) {
      const addr = block * FT65_BLOCK_SIZE;
      const data = await this.conn.readBlock(addr);
      image.set(data, addr);

      if (this.onProgress && block % 16 === 0) {
        this.onProgress(
          Math.round((block / FT65_NUM_BLOCKS) * 100),
          `Reading block ${block + 1} of ${FT65_NUM_BLOCKS}`
        );
      }
    }

    await this.conn.sendEnd();

    this.cachedImage = image;
    return parseAllChannels(image, this.offsetFactor);
  }

  async writeChannels(channels: Channel[]): Promise<void> {
    if (!this.conn) throw new Error('Not connected');

    const image = new Uint8Array(FT65_MEM_SIZE);
    // Start from the cached read image so settings/DTMF/P-keys are preserved
    if (this.cachedImage) {
      image.set(this.cachedImage);
    }

    // Flush any pending settings changes into the image before writing
    if (this.pendingSettings) {
      writeFt65Settings(image, this.pendingSettings);
      this.pendingSettings = null;
    }

    // Clear channel data regions so deleted channels don't leave ghost entries
    clearChannelRegions(image);

    for (const ch of channels) {
      if (ch.number >= 1 && ch.number <= 200) {
        encodeChannel(image, ch, this.offsetFactor, this.maxNameLen);
      }
    }

    await this.conn.enterCloneMode();

    // Skip block 0 (radio type ID — read-only)
    const totalWritable = FT65_NUM_BLOCKS - 1;
    for (let block = 1; block < FT65_NUM_BLOCKS; block++) {
      const addr = block * FT65_BLOCK_SIZE;
      await this.conn.writeBlock(addr, image.subarray(addr, addr + FT65_BLOCK_SIZE));

      if (this.onProgress && block % 16 === 0) {
        this.onProgress(
          Math.round(((block - 1) / totalWritable) * 100),
          `Writing block ${block} of ${totalWritable}`
        );
      }
    }

    await this.conn.sendEnd();
  }

  override async readRadioSettings(): Promise<RadioSettings | null> {
    if (!this.cachedImage) return null;
    const radioSpecific = parseFt65Settings(this.cachedImage);
    if (!radioSpecific) return null;
    return { radioSpecific } as unknown as RadioSettings;
  }

  override async writeRadioSettings(settings: RadioSettings): Promise<void> {
    const radioSpecific = settings.radioSpecific as Ft65Settings | undefined;
    if (!radioSpecific) return;
    // Buffer settings; writeChannels picks them up and writes everything in one clone session.
    this.pendingSettings = radioSpecific;
  }
}
