/**
 * The RT-950 Pro driver over its cable, against a simulated radio: the
 * handshake, the block framing and scrambling, the write guard, and a read →
 * write that has to leave the radio byte for byte as it was. No hardware has
 * run this driver yet; the simulation is built from the same protocol notes.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { RT950ProSerialLink, assertWritableBlock } from '../../src/radios/rt950pro/connection';
import { RT950ProSession } from '../../src/radios/rt950pro/session';
import { RT950ProProtocol } from '../../src/radios/rt950pro/protocol';
import { slotOf } from '../../src/radios/rt950pro/structures';
import { RT950PRO_SEGMENTS } from '../../src/radios/rt950pro/constants';
import { SimulatedRT950, serialPortFor } from './helpers/simulatedRt950';

function plugIn(radio: SimulatedRT950) {
  const port = serialPortFor(radio);
  vi.stubGlobal('navigator', { serial: { getPorts: async () => [port], requestPort: async () => port } });
  return port;
}

async function session(radio: SimulatedRT950): Promise<RT950ProSession> {
  const port = serialPortFor(radio);
  await port.open({ baudRate: 115200 });
  const link = new RT950ProSerialLink();
  await link.open(port);
  return new RT950ProSession(link);
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('RT-950 Pro handshake', () => {
  it('returns what the radio calls itself', async () => {
    await expect((await session(new SimulatedRT950())).handshake()).resolves.toBe('RT-950');
  });

  it('refuses a radio that is not an RT-950', async () => {
    const radio = new SimulatedRT950();
    radio.model = 'UV-17PRO';
    await expect((await session(radio)).handshake()).rejects.toThrow('"UV-17PRO", not an RT-950 Pro');
  });

  it("says so when the radio doesn't answer the ident", async () => {
    vi.useFakeTimers();
    const radio = new SimulatedRT950();
    radio.answersIdent = false;
    const s = await session(radio);
    const outcome = expect(s.handshake()).rejects.toThrow("didn't answer the handshake");
    await vi.advanceTimersByTimeAsync(5000);
    await outcome;
  });
});

describe('RT-950 Pro blocks', () => {
  it('unscrambles a block and checks the reply is for the block asked for', async () => {
    const radio = new SimulatedRT950();
    const s = await session(radio);
    await s.handshake();
    expect(await s.readBlock(0x52, 0x9000)).toEqual(radio.clone.slice(0x9000, 0x9080));

    radio.wrongHeader = true;
    await expect(s.readBlock(0x52, 0x9000)).rejects.toThrow('out of step');
  });

  it('never writes outside the regions the vendor software writes', () => {
    expect(() => assertWritableBlock(0x57, 0x7800)).toThrow('Refusing');
    expect(() => assertWritableBlock(0x57, 0xe000)).toThrow('Refusing');
    expect(() => assertWritableBlock(0x57, 0xd300)).toThrow('Refusing');
    expect(() => assertWritableBlock(0x57, 0x0040)).toThrow('Refusing'); // not on a block boundary
    expect(() => assertWritableBlock(0x58, 0x0080)).toThrow('Refusing'); // past the APRS block
    expect(() => assertWritableBlock(0x55, 0x0000)).toThrow('Refusing'); // the APRS command the radio rejects
    expect(() => assertWritableBlock(0x52, 0x0000)).toThrow('Refusing'); // a read command
    expect(() => assertWritableBlock(0x57, 0x0000)).not.toThrow();
    expect(() => assertWritableBlock(0x57, 0xd280)).not.toThrow();
    expect(() => assertWritableBlock(0x58, 0x0000)).not.toThrow();
  });
});

describe('RT-950 Pro read and write', () => {
  async function read() {
    const protocol = new RT950ProProtocol();
    await protocol.connect({ forcePortSelection: false });
    const channels = await protocol.readChannels();
    const settings = await protocol.readRadioSettings();
    const image = protocol.getMemoryImage()!.slice();
    await protocol.disconnect();
    return { channels, settings, image };
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
    expect(radio.writes.at(-1)).toEqual({ command: 0x58, address: 0 }); // APRS last, with the command the radio accepts
    for (const { command, address } of radio.writes) {
      expect(() => assertWritableBlock(command, address)).not.toThrow();
    }
    expect(radio.sessionsEnded).toBe(2);
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

    const { channels, settings, image } = await read();
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
