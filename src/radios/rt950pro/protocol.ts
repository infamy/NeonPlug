/**
 * RT950ProProtocol: the Radtel RT-950 Pro. Analog, 960 channels, over the
 * radio's USB programming cable.
 *
 * Each read and each write is one session, run the vendor CPS's way:
 * handshake, every region block by block, then 'E'. A read keeps the whole
 * image; a write starts from that image, patches the channels into it and
 * sends every region back, so everything this app doesn't model goes back
 * byte for byte as it was read.
 *
 * ⚠️ Not yet run against a radio.
 */

import type { RadioInfo } from '../../types/radio';
import type { Channel, RadioSettings } from '../../models';
import type { Rt950ProSettings } from '../../types/rt950proSettings';
import { BaseAnalogProtocol } from '../shared/BaseProtocols';
import { RT950ProConnection, openRT950ProPort, type RT950ProSerialPort } from './connection';
import {
  RT950PRO_BLOCK_SIZE,
  RT950PRO_IMAGE_SIZE,
  RT950PRO_SEGMENTS,
  RT950PRO_SEGMENT_OFFSETS,
} from './constants';
import { applyChannels, parseAllChannels } from './structures';
import { parseRt950ProSettings, writeRt950ProSettings } from './settingsFormat';
import { RT950PRO_MODEL_ID } from './modelId';
import { log } from '../../utils/protocolLogger';

const TOTAL_BLOCKS = RT950PRO_IMAGE_SIZE / RT950PRO_BLOCK_SIZE;

export class RT950ProProtocol extends BaseAnalogProtocol {
  /** Settings go into the image and out with writeChannels, in the same session —
   *  the connection hook stages them with writeRadioSettings first. */
  readonly bufferedSettingsWrite = true;

  private conn: RT950ProConnection | null = null;
  private pendingSettings: Rt950ProSettings | null = null;
  private port: RT950ProSerialPort | null = null;
  private cachedImage: Uint8Array | null = null;

  async connect(
    portOrOptions?: string | { forcePortSelection?: boolean; transport?: string; mode?: 'download' | 'upload' }
  ): Promise<void> {
    const opts = typeof portOrOptions === 'object' ? portOrOptions : {};
    this.port = await openRT950ProPort(opts.forcePortSelection ?? false);
    const conn = new RT950ProConnection();
    await conn.open(this.port);
    try {
      // What the radio calls itself goes to the log, not into RadioInfo: it is
      // a model name, and the device card's Firmware row would show it as a
      // version (the DA-7X2 made that mistake first).
      const reported = await conn.handshake();
      log.info(`Identified as ${reported}`, 'RT950Pro');
    } catch (err) {
      // Close what the failed handshake opened, or the port stays locked and
      // every later attempt finds it busy.
      await conn.close();
      this.port = null;
      throw err;
    }
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
      model: RT950PRO_MODEL_ID,
      firmware: '',
      buildDate: '',
      memoryLayout: { configStart: 0, configEnd: RT950PRO_IMAGE_SIZE - 1 },
    };
  }

  getMemoryImage(): Uint8Array | null {
    return this.cachedImage;
  }

  setMemoryImage(image: Uint8Array): void {
    this.cachedImage = new Uint8Array(image);
  }

  async readChannels(): Promise<Channel[]> {
    const conn = this.requireConnection();
    const image = new Uint8Array(RT950PRO_IMAGE_SIZE);
    let done = 0;
    for (const [i, segment] of RT950PRO_SEGMENTS.entries()) {
      for (let offset = 0; offset < segment.length; offset += RT950PRO_BLOCK_SIZE) {
        const block = await conn.readBlock(segment.readCommand, segment.address + offset);
        image.set(block, RT950PRO_SEGMENT_OFFSETS[i] + offset);
        done++;
        this.onProgress?.(Math.round((done / TOTAL_BLOCKS) * 100), `Reading ${segment.label}`);
      }
    }
    await conn.end();
    this.cachedImage = image;
    return parseAllChannels(image);
  }

  async writeChannels(channels: Channel[]): Promise<void> {
    const conn = this.requireConnection();
    if (!this.cachedImage || this.cachedImage.length !== RT950PRO_IMAGE_SIZE) {
      // The write sends every region the vendor CPS sends. Without a read's
      // image, everything but the channels would go out as zeros.
      throw new Error('Read the radio first. A write needs the image from a read to keep the radio\'s settings.');
    }
    const image = this.cachedImage.slice();
    if (this.pendingSettings) {
      writeRt950ProSettings(image, this.pendingSettings);
      this.pendingSettings = null;
    }
    applyChannels(image, channels);

    let done = 0;
    for (const [i, segment] of RT950PRO_SEGMENTS.entries()) {
      for (let offset = 0; offset < segment.length; offset += RT950PRO_BLOCK_SIZE) {
        const at = RT950PRO_SEGMENT_OFFSETS[i] + offset;
        await conn.writeBlock(
          segment.writeCommand,
          segment.address + offset,
          image.subarray(at, at + RT950PRO_BLOCK_SIZE)
        );
        done++;
        this.onProgress?.(Math.round((done / TOTAL_BLOCKS) * 100), `Writing ${segment.label}`);
      }
    }
    await conn.end();
    this.cachedImage = image;
  }

  override async readRadioSettings(): Promise<RadioSettings | null> {
    if (!this.cachedImage) return null;
    const radioSpecific = parseRt950ProSettings(this.cachedImage);
    if (!radioSpecific) return null;
    return { radioSpecific } as unknown as RadioSettings;
  }

  override async writeRadioSettings(settings: RadioSettings): Promise<void> {
    const radioSpecific = settings.radioSpecific as Rt950ProSettings | undefined;
    if (!radioSpecific) return;
    this.pendingSettings = radioSpecific;
  }

  private requireConnection(): RT950ProConnection {
    if (!this.conn) throw new Error('Not connected');
    return this.conn;
  }
}
