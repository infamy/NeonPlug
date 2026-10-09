/**
 * The RT-950 Pro over Bluetooth: a Web Bluetooth link for RT950ProSession.
 *
 * The radio's module is HM-10 style: the protocol runs on characteristic ffe1
 * (writes out, notifications back), 20 bytes at a time, exactly as it runs
 * over the cable — but only after a one-time unlock is written to ff31. The
 * unlock is the one the RT-950 Pro Bluetooth bridge captured from the radio's
 * phone app and replays; the radio accepts the replay.
 *
 * ⚠️ Not yet run against a radio from a browser. ff31's service UUID isn't
 * recorded anywhere, so it is looked for in every service the browser lets the
 * page see; if it isn't found, the error says so rather than carrying on.
 */

import {
  RT950PRO_BLE_CHUNK,
  RT950PRO_BLE_DATA_CHAR,
  RT950PRO_BLE_DATA_SERVICE,
  RT950PRO_BLE_UNLOCK,
  RT950PRO_BLE_UNLOCK_CHAR,
  RT950PRO_BLE_UNLOCK_SERVICES,
} from './constants';
import type { Rt950Link } from './session';

/** Between chunks written without response, as CHIRP paces this kind of module (#12251). */
const UNACKED_CHUNK_GAP_MS = 30;
/** Time for the radio to answer the unlock before the session starts. */
const UNLOCK_SETTLE_MS = 400;

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// The slice of Web Bluetooth this link uses.
export interface Rt950BleCharacteristic {
  readonly uuid: string;
  readonly properties: { write?: boolean; writeWithoutResponse?: boolean };
  startNotifications(): Promise<unknown>;
  addEventListener(type: 'characteristicvaluechanged', listener: (event: Event) => void): void;
  writeValueWithResponse(value: BufferSource): Promise<void>;
  writeValueWithoutResponse(value: BufferSource): Promise<void>;
  readonly value?: DataView | null;
}
interface Rt950BleService {
  getCharacteristic(uuid: string): Promise<Rt950BleCharacteristic>;
}
interface Rt950BleServer {
  readonly connected: boolean;
  connect(): Promise<Rt950BleServer>;
  disconnect(): void;
  getPrimaryService(uuid: string): Promise<Rt950BleService>;
}
export interface Rt950BleDevice {
  readonly gatt?: Rt950BleServer | null;
  addEventListener(type: 'gattserverdisconnected', listener: () => void): void;
}

/** Ask the browser for the radio. It advertises as "walkie-talkie", the same name as the UV5R-Mini. */
export async function requestRT950ProBleDevice(): Promise<Rt950BleDevice> {
  if (globalThis.isSecureContext === false) throw new Error('Web Bluetooth needs HTTPS or localhost.');
  const bluetooth = (navigator as Navigator & {
    bluetooth?: { requestDevice(options: unknown): Promise<Rt950BleDevice> };
  }).bluetooth;
  if (!bluetooth) throw new Error('Web Bluetooth is not supported here. Use Chrome on desktop or Android.');
  return bluetooth.requestDevice({
    filters: [{ name: 'walkie-talkie' }],
    optionalServices: [RT950PRO_BLE_DATA_SERVICE, ...RT950PRO_BLE_UNLOCK_SERVICES],
  });
}

export class RT950ProBleLink implements Rt950Link {
  /** A 132-byte block arrives as about seven notifications, one connection interval apart. */
  readonly replyTimeoutMs = 8000;

  private buffer = new Uint8Array(0);
  private lastArrival = 0;
  private dropped = false;
  private waiter: (() => void) | null = null;

  private constructor(
    private readonly server: Rt950BleServer,
    private readonly data: Rt950BleCharacteristic
  ) {}

  /** Connect, find both characteristics, listen on ffe1 and send the unlock. */
  static async connect(device: Rt950BleDevice): Promise<RT950ProBleLink> {
    if (!device.gatt) throw new Error('This Bluetooth device has no GATT server to connect to.');
    const server = await device.gatt.connect();
    try {
      const data = await (await server.getPrimaryService(RT950PRO_BLE_DATA_SERVICE)).getCharacteristic(
        RT950PRO_BLE_DATA_CHAR
      );
      const unlock = await findUnlock(server);
      const link = new RT950ProBleLink(server, data);
      device.addEventListener('gattserverdisconnected', () => link.onDropped());
      data.addEventListener('characteristicvaluechanged', (event) => {
        const value = (event.target as unknown as Rt950BleCharacteristic).value;
        if (value) link.onNotify(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
      });
      await data.startNotifications();
      await unlock.writeValueWithResponse(RT950PRO_BLE_UNLOCK);
      await delay(UNLOCK_SETTLE_MS);
      return link;
    } catch (err) {
      server.disconnect();
      throw err;
    }
  }

  async send(bytes: Uint8Array): Promise<void> {
    for (let at = 0; at < bytes.length; at += RT950PRO_BLE_CHUNK) {
      if (this.dropped) throw new Error('The radio dropped the Bluetooth link.');
      const chunk = bytes.slice(at, at + RT950PRO_BLE_CHUNK);
      // With response where the characteristic allows it, for flow control;
      // otherwise paced by hand.
      if (this.data.properties.write) {
        await this.data.writeValueWithResponse(chunk);
      } else {
        await this.data.writeValueWithoutResponse(chunk);
        await delay(UNACKED_CHUNK_GAP_MS);
      }
    }
  }

  async receive(n: number, timeoutMs: number): Promise<Uint8Array> {
    const deadline = Date.now() + timeoutMs;
    while (this.buffer.length < n) {
      if (this.dropped) throw new Error('The radio dropped the Bluetooth link.');
      const remaining = deadline - Date.now();
      if (remaining <= 0 || !(await this.nextArrival(remaining))) {
        throw new Error(`Timeout: needed ${n} bytes, have ${this.buffer.length}`);
      }
    }
    const out = this.buffer.slice(0, n);
    this.buffer = this.buffer.slice(n);
    return out;
  }

  async drain(quietMs: number): Promise<void> {
    while (Date.now() - this.lastArrival < quietMs) {
      await delay(quietMs);
    }
    this.buffer = new Uint8Array(0);
  }

  async close(): Promise<void> {
    if (this.server.connected) this.server.disconnect();
  }

  private onNotify(bytes: Uint8Array): void {
    const next = new Uint8Array(this.buffer.length + bytes.length);
    next.set(this.buffer);
    next.set(bytes, this.buffer.length);
    this.buffer = next;
    this.lastArrival = Date.now();
    this.wake();
  }

  private onDropped(): void {
    this.dropped = true;
    this.wake();
  }

  private wake(): void {
    const waiter = this.waiter;
    this.waiter = null;
    waiter?.();
  }

  /** Wait for the next notification or drop; false if `timeoutMs` passes first. */
  private nextArrival(timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.waiter = null;
        resolve(false);
      }, timeoutMs);
      this.waiter = () => {
        clearTimeout(timer);
        resolve(true);
      };
    });
  }
}

/** ff31, wherever it lives among the services this page may see. */
async function findUnlock(server: Rt950BleServer): Promise<Rt950BleCharacteristic> {
  for (const serviceId of [...RT950PRO_BLE_UNLOCK_SERVICES, RT950PRO_BLE_DATA_SERVICE]) {
    try {
      return await (await server.getPrimaryService(serviceId)).getCharacteristic(RT950PRO_BLE_UNLOCK_CHAR);
    } catch {
      // not in this one
    }
  }
  throw new Error(
    "The radio's Bluetooth unlock characteristic (ff31) wasn't found. Its service is a guess nobody has checked; " +
      'chrome://bluetooth-internals shows the radio\'s real services.'
  );
}
