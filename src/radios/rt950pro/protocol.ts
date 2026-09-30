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
import type { Channel } from '../../models';
import { BaseAnalogProtocol } from '../shared/BaseProtocols';
import { RT950ProConnection, openRT950ProPort, type RT950ProSerialPort } from './connection';
import {
  RT950PRO_BLOCK_SIZE,
  RT950PRO_IMAGE_SIZE,
  RT950PRO_SEGMENTS,
  RT950PRO_SEGMENT_OFFSETS,
} from './constants';
import { applyChannels, parseAllChannels } from './structures';
import { RT950PRO_MODEL_ID } from './modelId';

const TOTAL_BLOCKS = RT950PRO_IMAGE_SIZE / RT950PRO_BLOCK_SIZE;

export class RT950ProProtocol extends BaseAnalogProtocol {
  private conn: RT950ProConnection | null = null;
  private port: RT950ProSerialPort | null = null;
  private cachedImage: Uint8Array | null = null;
  /** What the radio called itself in the handshake. */
  private reportedModel = '';

  async connect(
    portOrOptions?: string | { forcePortSelection?: boolean; transport?: string; mode?: 'download' | 'upload' }
  ): Promise<void> {
    const opts = typeof portOrOptions === 'object' ? portOrOptions : {};
    this.port = await openRT950ProPort(opts.forcePortSelection ?? false);
    const conn = new RT950ProConnection();
    await conn.open(this.port);
    try {
      this.reportedModel = await conn.handshake();
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
      firmware: this.reportedModel,
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

  private requireConnection(): RT950ProConnection {
    if (!this.conn) throw new Error('Not connected');
    return this.conn;
  }
}
