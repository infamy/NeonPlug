/**
 * The RT-950 Pro over Bluetooth, against the simulated radio behind a fake
 * GATT server shaped like the real one: data on ffe1 (service ffe0), ignored
 * until the unlock arrives on ff31, 20 bytes per write, replies trickling back
 * as 20-byte notifications. Not yet run against a radio from a browser.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { RT950ProBleLink, requestRT950ProBleDevice, type Rt950BleDevice } from '../../src/radios/rt950pro/bleConnection';
import { RT950ProSession } from '../../src/radios/rt950pro/session';
import { RT950ProProtocol } from '../../src/radios/rt950pro/protocol';
import {
  RT950PRO_BLE_DATA_CHAR,
  RT950PRO_BLE_DATA_SERVICE,
  RT950PRO_BLE_UNLOCK,
  RT950PRO_BLE_UNLOCK_CHAR,
} from '../../src/radios/rt950pro/constants';
import { SimulatedRT950 } from './helpers/simulatedRt950';

const UNLOCK_SERVICE = '0000ff30-0000-1000-8000-00805f9b34fb';

class FakeCharacteristic {
  value: DataView | null = null;
  readonly writes: Uint8Array[] = [];
  private listeners: ((event: Event) => void)[] = [];
  constructor(
    readonly uuid: string,
    readonly properties: { write?: boolean; writeWithoutResponse?: boolean },
    private readonly onWrite: (bytes: Uint8Array) => void
  ) {}
  async startNotifications() {}
  addEventListener(_type: string, listener: (event: Event) => void) {
    this.listeners.push(listener);
  }
  async writeValueWithResponse(value: BufferSource) {
    this.take(value);
  }
  async writeValueWithoutResponse(value: BufferSource) {
    this.take(value);
  }
  notify(bytes: Uint8Array) {
    this.value = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (const listener of this.listeners) listener({ target: this } as unknown as Event);
  }
  private take(value: BufferSource) {
    const bytes = new Uint8Array(ArrayBuffer.isView(value) ? value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) : value);
    this.writes.push(bytes);
    this.onWrite(bytes);
  }
}

/** The radio behind a GATT server, as the Bluetooth bridge describes it. */
class FakeBleRadio {
  readonly radio = new SimulatedRT950();
  unlocked = false;
  /** Where ff31 lives on this radio; null to leave it out entirely. */
  unlockService: string | null = UNLOCK_SERVICE;
  /** Drop the link the moment the APRS block is acknowledged, as the radio does over Bluetooth. */
  dropsAfterCommit = false;
  readonly events: string[] = [];
  private disconnectListeners: (() => void)[] = [];

  readonly data = new FakeCharacteristic(RT950PRO_BLE_DATA_CHAR, { write: true }, (bytes) => {
    this.events.push('ffe1');
    if (this.unlocked) this.radio.feed(bytes); // the radio ignores ffe1 until it is unlocked
  });
  readonly unlock = new FakeCharacteristic(RT950PRO_BLE_UNLOCK_CHAR, { write: true }, (bytes) => {
    this.events.push('ff31');
    if (bytes.length === RT950PRO_BLE_UNLOCK.length && bytes.every((b, i) => b === RT950PRO_BLE_UNLOCK[i])) {
      this.unlocked = true;
      this.data.notify(Uint8Array.of(0x21, 0x4f, 0x4b)); // the unlock's reply, on ffe1
    }
  });

  readonly server = {
    connected: false,
    connect: async () => {
      this.server.connected = true;
      return this.server;
    },
    disconnect: () => {
      if (!this.server.connected) return;
      this.server.connected = false;
      for (const listener of this.disconnectListeners) listener();
    },
    getPrimaryService: async (uuid: string) => {
      if (uuid === RT950PRO_BLE_DATA_SERVICE) {
        return {
          getCharacteristic: async (c: string) => {
            if (c === RT950PRO_BLE_DATA_CHAR) return this.data;
            if (c === RT950PRO_BLE_UNLOCK_CHAR && this.unlockService === uuid) return this.unlock;
            throw new DOMException('no such characteristic', 'NotFoundError');
          },
        };
      }
      if (uuid === this.unlockService) {
        return {
          getCharacteristic: async (c: string) => {
            if (c === RT950PRO_BLE_UNLOCK_CHAR) return this.unlock;
            throw new DOMException('no such characteristic', 'NotFoundError');
          },
        };
      }
      throw new DOMException('no such service', 'NotFoundError');
    },
  };

  readonly device: Rt950BleDevice = {
    gatt: this.server,
    addEventListener: (_type, listener) => {
      this.disconnectListeners.push(listener);
    },
  };

  constructor() {
    this.radio.onReply = (bytes) => {
      for (let at = 0; at < bytes.length; at += 20) this.data.notify(bytes.slice(at, at + 20));
    };
    this.radio.onCommit = () => {
      if (this.dropsAfterCommit) this.server.disconnect();
    };
  }
}

function inRange(radio: FakeBleRadio) {
  const requestDevice = vi.fn(async () => radio.device);
  vi.stubGlobal('navigator', { bluetooth: { requestDevice } });
  return requestDevice;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('RT-950 Pro over Bluetooth', () => {
  it('offers only radios named walkie-talkie, and asks for the services it needs', async () => {
    const requestDevice = inRange(new FakeBleRadio());
    await requestRT950ProBleDevice();
    expect(requestDevice).toHaveBeenCalledWith({
      filters: [{ name: 'walkie-talkie' }],
      optionalServices: [RT950PRO_BLE_DATA_SERVICE, UNLOCK_SERVICE],
    });
  });

  it('unlocks on ff31 before a byte goes to ffe1, then shakes hands in 20-byte pieces', async () => {
    const ble = new FakeBleRadio();
    const session = new RT950ProSession(await RT950ProBleLink.connect(ble.device));
    await expect(session.handshake()).resolves.toBe('RT-950');

    expect(ble.events[0]).toBe('ff31');
    expect(Math.max(...ble.data.writes.map((w) => w.length))).toBeLessThanOrEqual(20);
  });

  it('finds ff31 in the data service too', async () => {
    const ble = new FakeBleRadio();
    ble.unlockService = RT950PRO_BLE_DATA_SERVICE;
    const session = new RT950ProSession(await RT950ProBleLink.connect(ble.device));
    await expect(session.handshake()).resolves.toBe('RT-950');
  });

  it("says ff31 couldn't be found, and lets go of the radio, when it isn't there", async () => {
    const ble = new FakeBleRadio();
    ble.unlockService = null;
    await expect(RT950ProBleLink.connect(ble.device)).rejects.toThrow('ff31');
    expect(ble.server.connected).toBe(false);
  });

  it('reads and writes the radio back unchanged, even when the radio drops the link after the commit', async () => {
    const ble = new FakeBleRadio();
    ble.radio.channel(1, 'CALL', 146.52);
    ble.radio.channel(2, 'LOCAL', 446.1);
    ble.dropsAfterCommit = true;
    inRange(ble);
    const before = ble.radio.clone.slice();

    const reader = new RT950ProProtocol();
    await reader.connect({ transport: 'ble' });
    const channels = await reader.readChannels();
    const image = reader.getMemoryImage()!.slice();
    await reader.disconnect();
    expect(channels.map((ch) => ch.name)).toEqual(['CALL', 'LOCAL']);

    const writer = new RT950ProProtocol();
    writer.setMemoryImage(image);
    await writer.connect({ transport: 'ble', mode: 'upload' });
    await expect(writer.writeChannels(channels)).resolves.toBeUndefined();
    await writer.disconnect();

    expect(ble.radio.clone).toEqual(before);
    expect(ble.radio.writes.at(-1)).toEqual({ command: 0x58, address: 0 });
  });
});
