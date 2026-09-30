/**
 * RT950ProProtocol: the Radtel RT-950 Pro. Analog, 960 channels, over the
 * radio's USB programming cable or Bluetooth — the same session on either.
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
import { RT950ProSerialLink, openRT950ProPort } from './connection';
import { RT950ProBleLink, requestRT950ProBleDevice } from './bleConnection';
import { RT950ProSession, type Rt950Link } from './session';
import {
  RT950PRO_BLOCK_SIZE,
  RT950PRO_COMMIT_SETTLE_MS,
  RT950PRO_IMAGE_SIZE,
  RT950PRO_SEGMENTS,
  RT950PRO_SEGMENT_OFFSETS,
} from './constants';
import { applyChannels, parseAllChannels } from './structures';
import { parseRt950ProSettings, writeRt950ProSettings } from './settingsFormat';
import { RT950PRO_MODEL_ID } from './modelId';
import { log } from '../../utils/protocolLogger';

const TOTAL_BLOCKS = RT950PRO_IMAGE_SIZE / RT950PRO_BLOCK_SIZE;

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class RT950ProProtocol extends BaseAnalogProtocol {
  /** Settings go into the image and out with writeChannels, in the same session —
   *  the connection hook stages them with writeRadioSettings first. */
  readonly bufferedSettingsWrite = true;

  private session: RT950ProSession | null = null;
  private pendingSettings: Rt950ProSettings | null = null;
  private cachedImage: Uint8Array | null = null;

  async connect(
    portOrOptions?: string | { forcePortSelection?: boolean; transport?: string; mode?: 'download' | 'upload' }
  ): Promise<void> {
    const opts = typeof portOrOptions === 'object' ? portOrOptions : {};
    let link: Rt950Link;
    if (opts.transport === 'ble') {
      link = await RT950ProBleLink.connect(await requestRT950ProBleDevice());
    } else {
      const serial = new RT950ProSerialLink();
      await serial.open(await openRT950ProPort(opts.forcePortSelection ?? false));
      link = serial;
    }
    const session = new RT950ProSession(link);
    try {
      // What the radio calls itself goes to the log, not into RadioInfo: it is
      // a model name, and the device card's Firmware row would show it as a
      // version (the DA-7X2 made that mistake first).
      const reported = await session.handshake();
      log.info(`Identified as ${reported}`, 'RT950Pro');
    } catch (err) {
      // Close what the failed handshake opened, or the port stays locked and
      // every later attempt finds it busy.
      await session.close();
      throw err;
    }
    this.session = session;
  }

  async disconnect(): Promise<void> {
    this.cachedImage = null;
    this.pendingSettings = null;
    if (this.session) {
      await this.session.close();
      this.session = null;
    }
  }

  isConnected(): boolean {
    return this.session !== null;
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
    const session = this.requireSession();
    const image = new Uint8Array(RT950PRO_IMAGE_SIZE);
    let done = 0;
    for (const [i, segment] of RT950PRO_SEGMENTS.entries()) {
      for (let offset = 0; offset < segment.length; offset += RT950PRO_BLOCK_SIZE) {
        const block = await session.readBlock(segment.readCommand, segment.address + offset);
        image.set(block, RT950PRO_SEGMENT_OFFSETS[i] + offset);
        done++;
        this.onProgress?.(Math.round((done / TOTAL_BLOCKS) * 100), `Reading ${segment.label}`);
      }
    }
    await session.end();
    this.cachedImage = image;
    return parseAllChannels(image);
  }

  async writeChannels(channels: Channel[]): Promise<void> {
    const session = this.requireSession();
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
    let committed = false;
    for (const [i, segment] of RT950PRO_SEGMENTS.entries()) {
      for (let offset = 0; offset < segment.length; offset += RT950PRO_BLOCK_SIZE) {
        const at = RT950PRO_SEGMENT_OFFSETS[i] + offset;
        await session.writeBlock(
          segment.writeCommand,
          segment.address + offset,
          image.subarray(at, at + RT950PRO_BLOCK_SIZE),
          segment.ackTimeoutMs
        );
        if (segment.pauseAfterBlockMs) await delay(segment.pauseAfterBlockMs);
        done++;
        this.onProgress?.(Math.round((done / TOTAL_BLOCKS) * 100), `Writing ${segment.label}`);
      }
      committed ||= segment.commits === true;
    }
    // The APRS block commits the session to flash, and the radio may drop a
    // Bluetooth link straight after acknowledging it: let the commit settle,
    // then end the session without failing a write that has already landed.
    if (committed) await delay(RT950PRO_COMMIT_SETTLE_MS);
    await session.end({ bestEffort: committed });
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

  private requireSession(): RT950ProSession {
    if (!this.session) throw new Error('Not connected');
    return this.session;
  }
}
