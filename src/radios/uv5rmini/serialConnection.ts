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

export interface UV5RMiniSerialPort {
  readonly readable: ReadableStream<Uint8Array> | null;
  readonly writable: WritableStream<Uint8Array> | null;
  open(options: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
}

const READ_TIMEOUT_MS = 6000;
const WRITE_ACK_TIMEOUT_MS = 400;

export class UV5RMiniSerialConnection {
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private readBuffer = new Uint8Array(0);
  private port: UV5RMiniSerialPort | null = null;

  async connect(port: UV5RMiniSerialPort): Promise<void> {
    this.port = port;
    this.readBuffer = new Uint8Array(0);
    if (!port.readable || !port.writable) {
      throw new Error('Port streams not available');
    }
    if (port.readable.locked || port.writable.locked) {
      throw new Error('Port already in use');
    }
    this.reader = port.readable.getReader();
    this.writer = port.writable.getWriter();
    await this.delay(300);
    await this.clearBuffer();
    await this.delay(200);

    // Handshake: ident -> ACK
    await this.send(BAOFENG_IDENT);
    await this.waitForByte(BAOFENG_ACK, 8000);

    // Magics (read mode)
    for (const { send, responseLen } of BAOFENG_MAGICS_READ) {
      await this.clearBuffer();
      await this.send(send);
      await this.readBytes(responseLen, 4000);
    }
  }

  async disconnect(): Promise<void> {
    try {
      await this.reader?.cancel();
    } catch {
      /* ignore */
    }
    try {
      await this.writer?.close();
    } catch {
      /* ignore */
    }
    if (this.port) {
      try {
        await this.port.close();
      } catch {
        /* ignore */
      }
    }
    this.reader = null;
    this.writer = null;
    this.port = null;
  }

  /** Read one 64-byte block at address (returns decrypted payload). */
  async readBlock(addr: number): Promise<Uint8Array> {
    const frame = buildBaofengReadFrame(addr, BAOFENG_BLOCK_SIZE);
    await this.send(frame);
    const raw = await this.waitForReadResponse(READ_TIMEOUT_MS);
    return parseBaofengReadResponse(raw);
  }

  /** Write one 64-byte block at address (block is plain; we encrypt in buildBaofengWriteFrame). */
  async writeBlock(addr: number, block: Uint8Array): Promise<void> {
    if (block.length !== BAOFENG_BLOCK_SIZE) throw new Error('Block must be 64 bytes');
    await this.clearBuffer();
    const frame = buildBaofengWriteFrame(addr, block);
    await this.send(frame);
    await this.waitForByte(BAOFENG_ACK, WRITE_ACK_TIMEOUT_MS);
  }

  /** Switch to upload magics (call before writing multiple blocks). */
  async handshakeUpload(): Promise<void> {
    await this.clearBuffer();
    await this.send(BAOFENG_IDENT);
    await this.waitForByte(BAOFENG_ACK, 8000);
    for (const { send, responseLen } of BAOFENG_MAGICS_UPLOAD) {
      await this.clearBuffer();
      await this.send(send);
      await this.readBytes(responseLen, 4000);
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  private async send(data: Uint8Array): Promise<void> {
    if (!this.writer) throw new Error('Not connected');
    await this.writer.write(data);
  }

  private async readBytes(n: number, timeoutMs: number): Promise<Uint8Array> {
    const deadline = Date.now() + timeoutMs;
    while (this.readBuffer.length < n) {
      if (Date.now() > deadline) {
        throw new Error(`Timeout waiting for ${n} bytes (got ${this.readBuffer.length})`);
      }
      const { value } = await this.reader!.read();
      if (value && value.length > 0) {
        const newLen = this.readBuffer.length + value.length;
        const next = new Uint8Array(newLen);
        next.set(this.readBuffer);
        next.set(value, this.readBuffer.length);
        this.readBuffer = next;
      }
      await this.delay(10);
    }
    const out = this.readBuffer.slice(0, n);
    this.readBuffer =
      this.readBuffer.length > n ? this.readBuffer.subarray(n) : new Uint8Array(0);
    return out;
  }

  private async waitForByte(byte: number, timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      for (let i = 0; i < this.readBuffer.length; i++) {
        if (this.readBuffer[i] === byte) {
          this.readBuffer =
            this.readBuffer.length > i + 1
              ? this.readBuffer.subarray(i + 1)
              : new Uint8Array(0);
          return;
        }
      }
      const { value } = await this.reader!.read();
      if (value && value.length > 0) {
        const newLen = this.readBuffer.length + value.length;
        const next = new Uint8Array(newLen);
        next.set(this.readBuffer);
        next.set(value, this.readBuffer.length);
        this.readBuffer = next;
      }
      await this.delay(20);
    }
    throw new Error(`Timeout waiting for byte 0x${byte.toString(16)}`);
  }

  /** Drain until buffer starts with 0x52, then read 68 bytes. */
  private async waitForReadResponse(timeoutMs: number): Promise<Uint8Array> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      while (this.readBuffer.length > 0 && this.readBuffer[0] !== 0x52) {
        this.readBuffer = this.readBuffer.subarray(1);
      }
      if (this.readBuffer.length >= BAOFENG_READ_RESPONSE_LEN) {
        const out = this.readBuffer.slice(0, BAOFENG_READ_RESPONSE_LEN);
        this.readBuffer =
          this.readBuffer.length > BAOFENG_READ_RESPONSE_LEN
            ? this.readBuffer.subarray(BAOFENG_READ_RESPONSE_LEN)
            : new Uint8Array(0);
        return out;
      }
      const { value } = await this.reader!.read();
      if (value && value.length > 0) {
        const newLen = this.readBuffer.length + value.length;
        const next = new Uint8Array(newLen);
        next.set(this.readBuffer);
        next.set(value, this.readBuffer.length);
        this.readBuffer = next;
      }
      await this.delay(20);
    }
    throw new Error(
      `Timeout waiting for read response (68 bytes). Have ${this.readBuffer.length} bytes.`
    );
  }

  private clearBuffer(): void {
    this.readBuffer = new Uint8Array(0);
  }
}

/** Request Web Serial port and open at UV5R-Mini baud rate. */
export async function openUV5RMiniPort(
  forcePortSelection?: boolean
): Promise<UV5RMiniSerialPort> {
  if (!('serial' in navigator)) {
    throw new Error('Web Serial API not supported. Please use Chrome/Edge.');
  }
  const nav = (navigator as any).serial;
  let port: UV5RMiniSerialPort;
  if (forcePortSelection) {
    port = await nav.requestPort();
  } else {
    const ports = await nav.getPorts();
    if (ports.length === 0) {
      port = await nav.requestPort();
    } else {
      port = ports[0];
    }
  }
  await port.open({ baudRate: UV5RMINI_BAUD_RATE });
  return port;
}
