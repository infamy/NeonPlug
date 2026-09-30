/**
 * The RT-950 Pro driver against a simulated radio: the handshake, the block
 * framing and scrambling, the write guard, and a read → write that has to
 * leave the radio byte for byte as it was. No hardware has run this driver yet;
 * the simulation is built from the same protocol notes the driver is.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { RT950ProConnection, assertWritableBlock } from '../../src/radios/rt950pro/connection';
import { RT950ProProtocol } from '../../src/radios/rt950pro/protocol';
import { encodeFrequency, slotOf } from '../../src/radios/rt950pro/structures';
import { RT950PRO_SEGMENTS } from '../../src/radios/rt950pro/constants';
import { uv17proCrypt } from '../../src/radios/shared/uv17proCrypt';
import type { SerialLikePort } from '../../src/radios/shared/BaseSerialConnection';

const KEY = 1;

/** A radio on the other end of a Web Serial port, answering the way the protocol notes say it does. */
class SimulatedRT950 {
  clone = new Uint8Array(0x10000);
  aprs = new Uint8Array(0x80);
  model = 'RT-950';
  answersIdent = true;
  wrongHeader = false;
  writes: { command: number; address: number }[] = [];
  sessionsEnded = 0;
  private controller: ReadableStreamDefaultController<Uint8Array> | null = null;

  readonly port: SerialLikePort = {
    readable: null,
    writable: null,
    setSignals: async () => {},
    open: async () => {
      const port = this.port as { readable: ReadableStream<Uint8Array> | null; writable: WritableStream<Uint8Array> | null };
      port.readable = new ReadableStream<Uint8Array>({ start: (c) => { this.controller = c; } });
      port.writable = new WritableStream<Uint8Array>({ write: (chunk) => this.receive(chunk) });
    },
    close: async () => {
      const port = this.port as { readable: ReadableStream<Uint8Array> | null; writable: WritableStream<Uint8Array> | null };
      if (port.readable?.locked || port.writable?.locked) throw new TypeError('Cannot cancel a locked stream');
      port.readable = null;
      port.writable = null;
    },
  };

  constructor() {
    // Every region gets a pattern, the ones nothing may write included, so any stray write shows.
    for (let i = 0; i < this.clone.length; i++) this.clone[i] = (i * 13 + 7) & 0xff;
    for (let i = 0; i < this.aprs.length; i++) this.aprs[i] = (i * 5 + 3) & 0xff;
    this.clone.fill(0xff, 0, 0x7800); // 960 empty channel slots
  }

  /** Put a channel in slot `number`. */
  channel(number: number, name: string, mhz: number): void {
    const slot = slotOf(this.clone, number);
    slot.fill(0xff);
    encodeFrequency(mhz, slot, 0);
    encodeFrequency(mhz, slot, 4);
    slot.set([0, 0, 0, 0, 0x03, 0x01, 0x40, 0x06], 8); // no tones, signalling 3, PTT ID 1, scrambler 4, scan + TX
    slot.set(Array.from(name, (c) => c.charCodeAt(0)), 20);
  }

  private send(bytes: ArrayLike<number>): void {
    this.controller!.enqueue(Uint8Array.from(bytes));
  }

  private receive(chunk: Uint8Array): void {
    const text = String.fromCharCode(...chunk);
    if (text === 'PROGRAMBT9000U') {
      if (this.answersIdent) this.send([0x06]);
    } else if (chunk.length === 1 && chunk[0] === 0x46) {
      this.send(new Array(16).fill(0x5a));
    } else if (chunk.length === 1 && chunk[0] === 0x4d) {
      const reply = new Uint8Array(12);
      reply.set(Array.from(this.model, (c) => c.charCodeAt(0)));
      this.send(reply);
    } else if (chunk.length === 25 && text.startsWith('SEND')) {
      this.send([0x06]);
    } else if (chunk.length === 1 && chunk[0] === 0x45) {
      this.sessionsEnded++;
    } else if (chunk.length === 4) {
      const [command, high, low, length] = chunk;
      const address = (high << 8) | low;
      const memory = command === 0x54 ? this.aprs : this.clone;
      const header = this.wrongHeader ? [command, high, low ^ 0x80, length] : Array.from(chunk);
      this.send([...header, ...uv17proCrypt(KEY, memory.subarray(address, address + length))]);
    } else if (chunk.length === 4 + 0x80) {
      const [command, high, low, length] = chunk;
      const address = (high << 8) | low;
      this.writes.push({ command, address });
      (command === 0x55 ? this.aprs : this.clone).set(uv17proCrypt(KEY, chunk.subarray(4, 4 + length)), address);
      this.send([0x06]);
    } else {
      throw new Error(`the simulated radio got ${chunk.length} bytes it doesn't understand`);
    }
  }
}

function plugIn(radio: SimulatedRT950): void {
  vi.stubGlobal('navigator', {
    serial: { getPorts: async () => [radio.port], requestPort: async () => radio.port },
  });
}

async function connected(radio: SimulatedRT950): Promise<RT950ProConnection> {
  await radio.port.open({ baudRate: 115200 });
  const conn = new RT950ProConnection();
  await conn.open(radio.port);
  return conn;
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('RT-950 Pro handshake', () => {
  it('returns what the radio calls itself', async () => {
    const conn = await connected(new SimulatedRT950());
    await expect(conn.handshake()).resolves.toBe('RT-950');
  });

  it('refuses a radio that is not an RT-950', async () => {
    const radio = new SimulatedRT950();
    radio.model = 'UV-17PRO';
    const conn = await connected(radio);
    await expect(conn.handshake()).rejects.toThrow('"UV-17PRO", not an RT-950 Pro');
  });

  it("says so when the radio doesn't answer the ident", async () => {
    vi.useFakeTimers();
    const radio = new SimulatedRT950();
    radio.answersIdent = false;
    const conn = await connected(radio);
    const outcome = expect(conn.handshake()).rejects.toThrow("didn't answer the handshake");
    await vi.advanceTimersByTimeAsync(5000);
    await outcome;
  });
});

describe('RT-950 Pro blocks', () => {
  it('unscrambles a block and checks the reply is for the block asked for', async () => {
    const radio = new SimulatedRT950();
    const conn = await connected(radio);
    await conn.handshake();
    expect(await conn.readBlock(0x52, 0x9000)).toEqual(radio.clone.slice(0x9000, 0x9080));

    radio.wrongHeader = true;
    await expect(conn.readBlock(0x52, 0x9000)).rejects.toThrow('out of step');
  });

  it('never writes outside the regions the vendor software writes', () => {
    expect(() => assertWritableBlock(0x57, 0x7800)).toThrow('Refusing');
    expect(() => assertWritableBlock(0x57, 0xe000)).toThrow('Refusing');
    expect(() => assertWritableBlock(0x57, 0xd300)).toThrow('Refusing');
    expect(() => assertWritableBlock(0x57, 0x0040)).toThrow('Refusing'); // not on a block boundary
    expect(() => assertWritableBlock(0x55, 0x0080)).toThrow('Refusing'); // past the APRS block
    expect(() => assertWritableBlock(0x52, 0x0000)).toThrow('Refusing'); // a read command
    expect(() => assertWritableBlock(0x57, 0x0000)).not.toThrow();
    expect(() => assertWritableBlock(0x57, 0xd280)).not.toThrow();
    expect(() => assertWritableBlock(0x55, 0x0000)).not.toThrow();
  });
});

describe('RT-950 Pro read and write', () => {
  async function read() {
    const protocol = new RT950ProProtocol();
    await protocol.connect({ forcePortSelection: false });
    const channels = await protocol.readChannels();
    const image = protocol.getMemoryImage()!.slice();
    await protocol.disconnect();
    return { channels, image };
  }

  async function write(image: Uint8Array, channels: Parameters<RT950ProProtocol['writeChannels']>[0]) {
    const protocol = new RT950ProProtocol();
    protocol.setMemoryImage(image);
    await protocol.connect({ forcePortSelection: false, mode: 'upload' });
    await protocol.writeChannels(channels);
    await protocol.disconnect();
  }

  it('reads every channel', async () => {
    const radio = new SimulatedRT950();
    radio.channel(1, 'CALL', 146.52);
    radio.channel(2, 'LOCAL', 446.1);
    radio.channel(960, 'LAST', 145.5);
    plugIn(radio);

    const { channels } = await read();
    expect(channels.map((ch) => [ch.number, ch.name, ch.rxFrequency])).toEqual([
      [1, 'CALL', 146.52],
      [2, 'LOCAL', 446.1],
      [960, 'LAST', 145.5],
    ]);
    expect(radio.sessionsEnded).toBe(1);
  });

  it('writes back a radio it read without changing a byte, and only where the vendor software writes', async () => {
    const radio = new SimulatedRT950();
    radio.channel(1, 'CALL', 146.52);
    radio.channel(2, 'LOCAL', 446.1);
    plugIn(radio);
    const before = { clone: radio.clone.slice(), aprs: radio.aprs.slice() };

    const { channels, image } = await read();
    await write(image, channels);

    expect(radio.clone).toEqual(before.clone);
    expect(radio.aprs).toEqual(before.aprs);
    const blocks = RT950PRO_SEGMENTS.reduce((n, s) => n + s.length / 0x80, 0);
    expect(radio.writes).toHaveLength(blocks);
    for (const { command, address } of radio.writes) {
      expect(() => assertWritableBlock(command, address)).not.toThrow();
    }
  });

  it('changes only the edited slot and the deleted one', async () => {
    const radio = new SimulatedRT950();
    radio.channel(1, 'CALL', 146.52);
    radio.channel(2, 'LOCAL', 446.1);
    radio.channel(3, 'GONE', 145.5);
    plugIn(radio);
    const before = radio.clone.slice();

    const { channels, image } = await read();
    const edited = channels
      .filter((ch) => ch.number !== 3)
      .map((ch) => (ch.number === 2 ? { ...ch, name: 'RENAMED' } : ch));
    await write(image, edited);

    const changed = new Set<number>();
    for (let i = 0; i < before.length; i++) if (radio.clone[i] !== before[i]) changed.add(Math.floor(i / 32) + 1);
    expect([...changed].sort((a, b) => a - b)).toEqual([2, 3]);
    expect(Array.from(slotOf(radio.clone, 3))).toEqual(new Array(32).fill(0xff));
  });

  it('writes a changed setting into its own byte and nothing else', async () => {
    const radio = new SimulatedRT950();
    radio.clone.fill(0xff, 0x9000, 0x9100); // every setting at its factory default
    radio.clone[0x9000] = 0x03; // but squelch 3
    radio.channel(1, 'CALL', 146.52);
    plugIn(radio);
    const before = radio.clone.slice();

    const protocol = new RT950ProProtocol();
    await protocol.connect({ forcePortSelection: false });
    const channels = await protocol.readChannels();
    const settings = await protocol.readRadioSettings();
    const image = protocol.getMemoryImage()!.slice();
    await protocol.disconnect();
    expect(settings?.radioSpecific).toMatchObject({ squelch: 3, keyBeep: -1 });

    const writer = new RT950ProProtocol();
    writer.setMemoryImage(image);
    await writer.connect({ forcePortSelection: false, mode: 'upload' });
    await writer.writeRadioSettings({ ...settings!, radioSpecific: { ...(settings!.radioSpecific as object), squelch: 6 } });
    await writer.writeChannels(channels);
    await writer.disconnect();

    const changed: number[] = [];
    for (let i = 0; i < before.length; i++) if (radio.clone[i] !== before[i]) changed.push(i);
    expect(changed).toEqual([0x9000]);
    expect(radio.clone[0x9000]).toBe(0x06);
  });

  it('refuses to write without a read to start from', async () => {
    const radio = new SimulatedRT950();
    plugIn(radio);
    const protocol = new RT950ProProtocol();
    await protocol.connect({ forcePortSelection: false, mode: 'upload' });
    await expect(protocol.writeChannels([])).rejects.toThrow('Read the radio first');
    await protocol.disconnect();
    expect(radio.writes).toHaveLength(0);
  });
});
