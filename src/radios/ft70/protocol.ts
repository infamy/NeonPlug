/**
 * FT70Protocol: RadioProtocol for the Yaesu FT-70D.
 * Analog-only (C4FM digital decoded as FM here), 900 channels, serial via
 * the radio's USB programming cable using the generic Yaesu clone protocol.
 *
 * Unlike FT-65 (which enters/exits clone mode per operation via PROGRAM/END),
 * the FT-70 expects the user to manually arm clone mode on the radio before
 * each Read/Write; the connection just streams the ID block + full image.
 */

import type { RadioInfo } from '../../types/radio';
import type { Channel, RadioSettings } from '../../models';
import type { Ft70Settings } from '../../types/ft70Settings';
import { BaseAnalogProtocol } from '../shared/BaseProtocols';
import { FT70Connection, openFT70Port, type FT70SerialPort } from './connection';
import { FT70_MEM_SIZE, FT70_MODEL_ID } from './constants';
import { parseAllChannels, encodeChannel, clearChannelRegions, applyChecksum } from './structures';
import { parseFt70Settings, writeFt70Settings } from './settingsFormat';

export class FT70Protocol extends BaseAnalogProtocol {
  private conn: FT70Connection | null = null;
  private port: FT70SerialPort | null = null;
  private cachedImage: Uint8Array | null = null;
  private pendingSettings: Ft70Settings | null = null;

  async connect(
    portOrOptions?: string | { forcePortSelection?: boolean; transport?: string }
  ): Promise<void> {
    const opts = typeof portOrOptions === 'object' ? portOrOptions : {};
    const forceSelection = opts.forcePortSelection ?? false;

    this.port = await openFT70Port(forceSelection);
    const conn = new FT70Connection();
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
      model: 'FT-70D',
      firmware: '',
      buildDate: '',
      memoryLayout: { configStart: 0x0000, configEnd: FT70_MEM_SIZE - 1 },
    };
  }

  async readChannels(): Promise<Channel[]> {
    if (!this.conn) throw new Error('Not connected');

    const image = await this.conn.readImage((pct, msg) => this.onProgress?.(pct, msg));

    const idStr = String.fromCharCode(...image.subarray(0, FT70_MODEL_ID.length));
    if (idStr !== FT70_MODEL_ID) {
      throw new Error(
        `Radio ID mismatch. Expected "${FT70_MODEL_ID}", got "${idStr}". Wrong model selected, or radio not in clone-send mode?`
      );
    }

    this.cachedImage = image;
    return parseAllChannels(image);
  }

  async writeChannels(channels: Channel[]): Promise<void> {
    if (!this.conn) throw new Error('Not connected');

    const image = new Uint8Array(FT70_MEM_SIZE);
    if (this.cachedImage) {
      image.set(this.cachedImage);
    } else {
      image.set(new TextEncoder().encode(FT70_MODEL_ID), 0);
    }

    if (this.pendingSettings) {
      writeFt70Settings(image, this.pendingSettings);
      this.pendingSettings = null;
    }

    clearChannelRegions(image);
    for (const ch of channels) {
      if (ch.number >= 1 && ch.number <= 900) {
        encodeChannel(image, ch);
      }
    }

    applyChecksum(image);

    await this.conn.writeImage(image, (pct, msg) => this.onProgress?.(pct, msg));
  }

  override async readRadioSettings(): Promise<RadioSettings | null> {
    if (!this.cachedImage) return null;
    const radioSpecific = parseFt70Settings(this.cachedImage);
    if (!radioSpecific) return null;
    return { radioSpecific } as unknown as RadioSettings;
  }

  override async writeRadioSettings(settings: RadioSettings): Promise<void> {
    const radioSpecific = settings.radioSpecific as Ft70Settings | undefined;
    if (!radioSpecific) return;
    this.pendingSettings = radioSpecific;
  }
}
