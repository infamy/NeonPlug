/**
 * Web Serial connection for the Yaesu FT-70D using the generic Yaesu clone
 * protocol (chirp/drivers/yaesu_clone.py), NOT the SCU-35 PROGRAM/QX
 * handshake used by the FT-65/FT-4 family.
 *
 * There is no software-side "enter clone mode" command — the user manually
 * puts the radio into ADMS clone mode (hold AMS + power while clipping in
 * the battery, then press BAND to send from radio / MODE to receive into
 * radio) before clicking Read/Write in the app. Once in that mode the radio
 * just streams (or expects) two clone blocks:
 *   1. a 10-byte ID block ("AH51G" + 5 more bytes), ACK'd by the host
 *   2. the remaining 65217-byte data block, streamed continuously
 */

import { FT70_BAUD_RATE, FT70_ID_BLOCK_SIZE, FT70_DATA_BLOCK_SIZE, FT70_CHUNK_SIZE } from './constants';
import { BaseSerialConnection, type SerialLikePort } from '../shared/BaseSerialConnection';
import { requestSerialPort } from '../shared/serialPort';

const ACK = 0x06;
const READ_TIMEOUT_MS = 60_000;
const ACK_TIMEOUT_MS = 8_000;
const WRITE_CHUNK_DELAY_MS = 30;

export type FT70SerialPort = SerialLikePort;

/** Request / reuse a Web Serial port and open it at 38400 baud. */
export async function openFT70Port(forceSelection = false): Promise<FT70SerialPort> {
  return requestSerialPort(FT70_BAUD_RATE, forceSelection);
}

export class FT70Connection extends BaseSerialConnection {
  /** Open the port and set up reader/writer. */
  async open(port: FT70SerialPort): Promise<void> {
    await super.openPort(port);
    await this.delay(300);
    this.buf = new Uint8Array(0);
  }

  /** Close reader/writer and port. */
  async close(): Promise<void> {
    await super.closeStreams();
  }

  /**
   * Read the full memory image from the radio (must already be in clone
   * send mode). Reports progress via onProgress(0-100).
   */
  async readImage(onProgress?: (pct: number, message: string) => void): Promise<Uint8Array> {
    const image = new Uint8Array(FT70_ID_BLOCK_SIZE + FT70_DATA_BLOCK_SIZE);

    // ID block: some cables echo a single ACK byte ahead of the real data — chew it if present.
    let idBlock = await this.readExact(FT70_ID_BLOCK_SIZE, ACK_TIMEOUT_MS);
    if (idBlock[0] === ACK) {
      const extra = await this.readExact(1, ACK_TIMEOUT_MS);
      idBlock = new Uint8Array([...idBlock.slice(1), extra[0]]);
    }
    image.set(idBlock, 0);

    // Tell the radio to continue with the data block.
    await this.write(new Uint8Array([ACK]));

    let received = 0;
    while (received < FT70_DATA_BLOCK_SIZE) {
      const step = Math.min(FT70_CHUNK_SIZE, FT70_DATA_BLOCK_SIZE - received);
      const chunk = await this.readExact(step, READ_TIMEOUT_MS);
      image.set(chunk, FT70_ID_BLOCK_SIZE + received);
      received += step;
      onProgress?.(Math.round((received / FT70_DATA_BLOCK_SIZE) * 100), `Reading ${received}/${FT70_DATA_BLOCK_SIZE} bytes`);
    }

    return image;
  }

  /**
   * Write the full memory image to the radio (must already be in clone
   * receive mode). Reports progress via onProgress(0-100).
   */
  async writeImage(image: Uint8Array, onProgress?: (pct: number, message: string) => void): Promise<void> {
    if (image.length !== FT70_ID_BLOCK_SIZE + FT70_DATA_BLOCK_SIZE) {
      throw new Error(`FT-70 image must be ${FT70_ID_BLOCK_SIZE + FT70_DATA_BLOCK_SIZE} bytes`);
    }

    // ID block: write, then expect either a bare ACK, or (echoing cable) the
    // 10-byte echo of what we just sent followed by the real ACK.
    await this.write(image.subarray(0, FT70_ID_BLOCK_SIZE));
    const first = await this.readExact(1, ACK_TIMEOUT_MS);
    if (first[0] !== ACK) {
      const rest = await this.readExact(FT70_ID_BLOCK_SIZE, ACK_TIMEOUT_MS);
      if (rest[rest.length - 1] !== ACK) {
        throw new Error('Radio did not acknowledge ID block');
      }
    }

    // Data block: stream in paced chunks, no per-chunk ack.
    let sent = 0;
    while (sent < FT70_DATA_BLOCK_SIZE) {
      const step = Math.min(FT70_CHUNK_SIZE, FT70_DATA_BLOCK_SIZE - sent);
      await this.write(image.subarray(FT70_ID_BLOCK_SIZE + sent, FT70_ID_BLOCK_SIZE + sent + step));
      sent += step;
      onProgress?.(Math.round((sent / FT70_DATA_BLOCK_SIZE) * 100), `Writing ${sent}/${FT70_DATA_BLOCK_SIZE} bytes`);
      await this.delay(WRITE_CHUNK_DELAY_MS);
    }
  }
}
