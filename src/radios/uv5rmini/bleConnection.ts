/**
 * UV5R-Mini BLE transport (HM-10 style: FFE0/FFE1).
 * Chunked writes 20 bytes with 30ms delay (CHIRP #12251).
 */

import {
  BAOFENG_IDENT,
  BAOFENG_ACK,
  BAOFENG_BLOCK_SIZE,
  BAOFENG_READ_RESPONSE_LEN,
} from './constants';
import {
  BAOFENG_MAGICS_READ,
  BAOFENG_MAGICS_UPLOAD,
  buildBaofengReadFrame,
  buildBaofengWriteFrame,
  parseBaofengReadResponse,
} from './baofengProtocol';

const FFE0_SERVICE = '0000ffe0-0000-1000-8000-00805f9b34fb';
const FFE1_CHAR = '0000ffe1-0000-1000-8000-00805f9b34fb';

const CHUNK_SIZE = 20;
const CHUNK_DELAY_MS = 30;
const READ_TIMEOUT_MS = 6000;
const WRITE_ACK_TIMEOUT_MS = 400;

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

interface BleGattServer {
  connect(): Promise<BleGattServer>;
  connected: boolean;
  disconnect(): void;
  getPrimaryService(uuid: string): Promise<{ getCharacteristic(uuid: string): Promise<BleChar> }>;
}

interface BleChar {
  startNotifications(): Promise<void>;
  addEventListener(type: string, listener: (ev: { target: { value: DataView } }) => void): void;
  writeValue(value: ArrayBuffer | ArrayBufferView): Promise<void>;
}

export interface BluetoothDevice {
  gatt: BleGattServer | null;
}

export async function requestUV5RMiniBleDevice(): Promise<BluetoothDevice> {
  if (!window.isSecureContext) {
    throw new Error('Web Bluetooth requires HTTPS or localhost.');
  }
  const nav = navigator as Navigator & { bluetooth?: { requestDevice(opts: unknown): Promise<BluetoothDevice> } };
  if (!nav.bluetooth) {
    throw new Error('Web Bluetooth not supported. Use Chrome (desktop or Android).');
  }
  const device = await nav.bluetooth.requestDevice({
    filters: [{ name: 'walkie-talkie' }],
    optionalServices: [FFE0_SERVICE],
  });
  return device;
}

export async function connectUV5RMiniBle(
  device: BluetoothDevice
): Promise<{ server: BleGattServer; char: BleChar }> {
  const server = await device.gatt!.connect();
  const service = await server.getPrimaryService(FFE0_SERVICE);
  const char = await service.getCharacteristic(FFE1_CHAR);
  return { server, char };
}

/**
 * BLE connection for UV5R-Mini: same handshake and read/write as serial, over FFE1.
 */
export class UV5RMiniBleConnection {
  private char: BleChar | null = null;
  private server: BleGattServer | null = null;
  private rxBuffer = new Uint8Array(0);
  private resolveWhenByte: { byte: number; resolve: (v: boolean) => void; t: ReturnType<typeof setTimeout> } | null = null;

  async connect(device: BluetoothDevice): Promise<void> {
    const { server, char } = await connectUV5RMiniBle(device);
    this.server = server;
    this.char = char;
    this.rxBuffer = new Uint8Array(0);
    await char.startNotifications();
    char.addEventListener('characteristicvaluechanged', (ev: { target: { value: DataView } }) => {
      const value = ev.target.value;
      const arr = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
      this.appendRx(arr);
    });
    await delay(200);
    this.clearBuffer();

    await this.send(BAOFENG_IDENT);
    await this.waitForByte(BAOFENG_ACK, 8000);
    for (const { send, responseLen } of BAOFENG_MAGICS_READ) {
      this.clearBuffer();
      await this.send(send);
      await this.readBytes(responseLen, 4000);
    }
  }

  async disconnect(): Promise<void> {
    if (this.server?.connected) {
      this.server.disconnect();
    }
    this.char = null;
    this.server = null;
  }

  async readBlock(addr: number): Promise<Uint8Array> {
    const frame = buildBaofengReadFrame(addr, BAOFENG_BLOCK_SIZE);
    await this.send(frame);
    const raw = await this.waitForReadResponse(READ_TIMEOUT_MS);
    return parseBaofengReadResponse(raw);
  }

  async writeBlock(addr: number, block: Uint8Array): Promise<void> {
    if (block.length !== BAOFENG_BLOCK_SIZE) throw new Error('Block must be 64 bytes');
    this.clearBuffer();
    const frame = buildBaofengWriteFrame(addr, block);
    await this.send(frame);
    await this.waitForByte(BAOFENG_ACK, WRITE_ACK_TIMEOUT_MS);
  }

  async handshakeUpload(): Promise<void> {
    this.clearBuffer();
    await this.send(BAOFENG_IDENT);
    await this.waitForByte(BAOFENG_ACK, 8000);
    for (const { send, responseLen } of BAOFENG_MAGICS_UPLOAD) {
      this.clearBuffer();
      await this.send(send);
      await this.readBytes(responseLen, 4000);
    }
  }

  private clearBuffer(): void {
    this.rxBuffer = new Uint8Array(0);
  }

  private appendRx(arr: Uint8Array): void {
    const newLen = this.rxBuffer.length + arr.length;
    const next = new Uint8Array(newLen);
    next.set(this.rxBuffer);
    next.set(arr, this.rxBuffer.length);
    this.rxBuffer = next;
    if (this.resolveWhenByte && this.rxBuffer.length > 0) {
      for (let i = 0; i < this.rxBuffer.length; i++) {
        if (this.rxBuffer[i] === this.resolveWhenByte.byte) {
          const r = this.resolveWhenByte;
          this.resolveWhenByte = null;
          clearTimeout(r.t);
          this.rxBuffer = this.rxBuffer.length > i + 1 ? this.rxBuffer.subarray(i + 1) : new Uint8Array(0);
          r.resolve(true);
          return;
        }
      }
    }
  }

  private async send(data: Uint8Array): Promise<void> {
    if (!this.char) throw new Error('Not connected');
    for (let i = 0; i < data.length; i += CHUNK_SIZE) {
      const slice = data.subarray(i, Math.min(i + CHUNK_SIZE, data.length));
      await this.char.writeValue(new Uint8Array(slice));
      if (i + slice.length < data.length) await delay(CHUNK_DELAY_MS);
    }
  }

  private waitForByte(byte: number, timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      for (let i = 0; i < this.rxBuffer.length; i++) {
        if (this.rxBuffer[i] === byte) {
          this.rxBuffer = this.rxBuffer.length > i + 1 ? this.rxBuffer.subarray(i + 1) : new Uint8Array(0);
          resolve();
          return;
        }
      }
      const t = setTimeout(() => {
        if (this.resolveWhenByte) {
          this.resolveWhenByte = null;
          reject(new Error(`Timeout waiting for byte 0x${byte.toString(16)}`));
        }
      }, timeoutMs);
      this.resolveWhenByte = { byte, resolve: () => { clearTimeout(t); resolve(); }, t };
    });
  }

  private async readBytes(n: number, timeoutMs: number): Promise<Uint8Array> {
    const deadline = Date.now() + timeoutMs;
    while (this.rxBuffer.length < n) {
      if (Date.now() > deadline) {
        throw new Error(`Timeout waiting for ${n} bytes (got ${this.rxBuffer.length})`);
      }
      await delay(30);
    }
    const out = this.rxBuffer.slice(0, n);
    this.rxBuffer = this.rxBuffer.length > n ? this.rxBuffer.subarray(n) : new Uint8Array(0);
    return out;
  }

  private async waitForReadResponse(timeoutMs: number): Promise<Uint8Array> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      while (this.rxBuffer.length > 0 && this.rxBuffer[0] !== 0x52) {
        this.rxBuffer = this.rxBuffer.subarray(1);
      }
      if (this.rxBuffer.length >= BAOFENG_READ_RESPONSE_LEN) {
        const out = this.rxBuffer.slice(0, BAOFENG_READ_RESPONSE_LEN);
        this.rxBuffer = this.rxBuffer.length > BAOFENG_READ_RESPONSE_LEN ? this.rxBuffer.subarray(BAOFENG_READ_RESPONSE_LEN) : new Uint8Array(0);
        return out;
      }
      await delay(30);
    }
    throw new Error(`Timeout waiting for read response. Have ${this.rxBuffer.length} bytes.`);
  }
}
