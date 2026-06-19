/**
 * UV5R-Mini connection over Web Serial API.
 * Handshake: ident (PROGRAMCOLORPROU) -> ACK 0x06, then magics.
 */

import {
  BAOFENG_IDENT,
  BAOFENG_ACK,
  BAOFENG_BLOCK_SIZE,
  BAOFENG_READ_RESPONSE_LEN,
  UV5RMINI_BAUD_RATE,
} from './constants';
import {
  BAOFENG_MAGICS_READ,
  BAOFENG_MAGICS_UPLOAD,
  buildBaofengReadFrame,
  buildBaofengWriteFrame,
  parseBaofengReadResponse,
} from './baofengProtocol';
import { BaseSerialConnection, type SerialLikePort } from '../shared/BaseSerialConnection';
import { requestSerialPort } from '../shared/serialPort';

export type UV5RMiniSerialPort = SerialLikePort;

const READ_TIMEOUT_MS = 6000;
const WRITE_ACK_TIMEOUT_MS = 400;

export class UV5RMiniSerialConnection extends BaseSerialConnection {
  async connect(port: UV5RMiniSerialPort): Promise<void> {
    await super.openPort(port);
    await this.delay(300);
    this.buf = new Uint8Array(0);
    await this.delay(200);

    // Handshake: ident -> ACK
    await this.write(BAOFENG_IDENT);
    await this.waitForByte(BAOFENG_ACK, 8000);

    // Magics (read mode)
    for (const { send, responseLen } of BAOFENG_MAGICS_READ) {
      this.buf = new Uint8Array(0);
      await this.write(send);
      await this.readExact(responseLen, 4000);
    }
  }

  async disconnect(): Promise<void> {
    await super.closeStreams();
  }

  /** Read one 64-byte block at address (returns decrypted payload). */
  async readBlock(addr: number): Promise<Uint8Array> {
    const frame = buildBaofengReadFrame(addr, BAOFENG_BLOCK_SIZE);
    await this.write(frame);
    const raw = await this.waitForReadResponse(READ_TIMEOUT_MS);
    return parseBaofengReadResponse(raw);
  }

  /** Write one 64-byte block at address (block is plain; we encrypt in buildBaofengWriteFrame). */
  async writeBlock(addr: number, block: Uint8Array): Promise<void> {
    if (block.length !== BAOFENG_BLOCK_SIZE) throw new Error('Block must be 64 bytes');
    this.buf = new Uint8Array(0);
    const frame = buildBaofengWriteFrame(addr, block);
    await this.write(frame);
    await this.waitForByte(BAOFENG_ACK, WRITE_ACK_TIMEOUT_MS);
  }

  /** Switch to upload magics (call before writing multiple blocks). */
  async handshakeUpload(): Promise<void> {
    this.buf = new Uint8Array(0);
    await this.write(BAOFENG_IDENT);
    await this.waitForByte(BAOFENG_ACK, 8000);
    for (const { send, responseLen } of BAOFENG_MAGICS_UPLOAD) {
      this.buf = new Uint8Array(0);
      await this.write(send);
      await this.readExact(responseLen, 4000);
    }
  }

  private async waitForByte(byte: number, timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      for (let i = 0; i < this.buf.length; i++) {
        if (this.buf[i] === byte) {
          this.buf = this.buf.length > i + 1 ? this.buf.subarray(i + 1) : new Uint8Array(0);
          return;
        }
      }
      const { value } = await this.reader!.read();
      if (value && value.length > 0) {
        const next = new Uint8Array(this.buf.length + value.length);
        next.set(this.buf);
        next.set(value, this.buf.length);
        this.buf = next;
      }
      await this.delay(20);
    }
    throw new Error(`Timeout waiting for byte 0x${byte.toString(16)}`);
  }

  /** Drain until buffer starts with 0x52, then read 68 bytes. */
  private async waitForReadResponse(timeoutMs: number): Promise<Uint8Array> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      while (this.buf.length > 0 && this.buf[0] !== 0x52) {
        this.buf = this.buf.subarray(1);
      }
      if (this.buf.length >= BAOFENG_READ_RESPONSE_LEN) {
        const out = this.buf.slice(0, BAOFENG_READ_RESPONSE_LEN);
        this.buf = this.buf.length > BAOFENG_READ_RESPONSE_LEN
          ? this.buf.subarray(BAOFENG_READ_RESPONSE_LEN)
          : new Uint8Array(0);
        return out;
      }
      const { value } = await this.reader!.read();
      if (value && value.length > 0) {
        const next = new Uint8Array(this.buf.length + value.length);
        next.set(this.buf);
        next.set(value, this.buf.length);
        this.buf = next;
      }
      await this.delay(20);
    }
    throw new Error(
      `Timeout waiting for read response (68 bytes). Have ${this.buf.length} bytes.`
    );
  }
}

/** Request Web Serial port and open at UV5R-Mini baud rate. */
export async function openUV5RMiniPort(forcePortSelection = false): Promise<UV5RMiniSerialPort> {
  return requestSerialPort(UV5RMINI_BAUD_RATE, forcePortSelection);
}
