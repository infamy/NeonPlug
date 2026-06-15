/**
 * FT65Protocol: RadioProtocol for the Yaesu FT-65/FT-4/FT-25 family.
 * Analog-only, 200 channels, serial via SCU-35 cable.
 *
 * Clone mode is self-contained per operation (mirrors CHIRP do_download/do_upload):
 *   enterCloneMode() → blocks → sendEnd()
 * The port stays open between operations; each read/write enters/exits independently.
 */

import type { RadioProtocol, RadioInfo } from '../../types/radio';
import type { Channel, Zone, Contact, RadioSettings, ScanList, DMRRadioID } from '../../models';
import { FT65Connection, openFT65Port, type FT65SerialPort } from './connection';
import { FT65_NUM_BLOCKS, FT65_BLOCK_SIZE, FT65_MEM_SIZE, FT65_ADDR_SETTINGS } from './constants';
import { parseAllChannels, encodeChannel, clearChannelRegions } from './structures';
import { parseFt65Settings, writeFt65Settings } from './settingsFormat';

export class FT65Protocol implements RadioProtocol {
  public onProgress?: (progress: number, message: string) => void;

  private conn: FT65Connection | null = null;
  private port: FT65SerialPort | null = null;
  private cachedImage: Uint8Array | null = null;

  constructor(
    private readonly modelId: string,
    private readonly idPrefixes: string[],
    private readonly offsetFactor: number,
    private readonly maxNameLen: number = 8,
  ) {}

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

  async readZones(): Promise<Zone[]> { return []; }
  async writeZones(_zones: Zone[]): Promise<void> {}
  async readScanLists(): Promise<ScanList[]> { return []; }
  async readDMRRadioIDs(): Promise<DMRRadioID[]> { return []; }
  async writeDMRRadioIDs(_ids: DMRRadioID[]): Promise<void> {}
  async readContacts(): Promise<Contact[]> { return []; }
  async writeContacts(_contacts: Contact[]): Promise<void> {}
  async readRadioSettings(): Promise<RadioSettings | null> {
    if (!this.cachedImage) return null;
    const ft65Settings = parseFt65Settings(this.cachedImage);
    if (!ft65Settings) return null;
    return { ft65Settings } as RadioSettings;
  }

  async writeRadioSettings(settings: RadioSettings): Promise<void> {
    if (!this.conn) throw new Error('Not connected');
    if (!this.cachedImage) throw new Error('Read from radio before writing settings');

    const ft65Settings = settings.ft65Settings;
    if (!ft65Settings) return;

    // Apply changes to cached image so it stays consistent with what's on the radio
    writeFt65Settings(this.cachedImage, ft65Settings);

    // Write only the 4 blocks covering the 64-byte settings region (0x2000–0x203F)
    await this.conn.enterCloneMode();
    for (let i = 0; i < 4; i++) {
      const addr = FT65_ADDR_SETTINGS + i * FT65_BLOCK_SIZE;
      await this.conn.writeBlock(addr, this.cachedImage.subarray(addr, addr + FT65_BLOCK_SIZE));
    }
    await this.conn.sendEnd();
  }
}
