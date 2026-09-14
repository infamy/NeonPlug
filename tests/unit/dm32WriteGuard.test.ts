import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertBlockWritable, type WriteGuardContext } from '../../src/radios/dm32uv/writeGuard';
import { DM32Connection } from '../../src/radios/dm32uv/connection';
import { DM32UVProtocol } from '../../src/radios/dm32uv/protocol';
import { VFRAME } from '../../src/radios/dm32uv/constants';
import type { MemoryBlock } from '../../src/radios/dm32uv/memory';
import { BOOT_IMAGE } from '../../src/utils/bootImage';
import type { Contact, ScanList } from '../../src/models';

/**
 * The DM-32's calibration block is never written (writeGuard.ts).
 *
 * Calibration is the radio's factory frequency and power adjustment. Nothing in
 * NeonPlug has a reason to write it, and until 2026-09-12 nothing stopped a
 * write reaching it either: each writer picked its own addresses, and the only
 * protection was that they picked correctly. These hold every refusal rule,
 * that the connection refuses before a byte is sent, and that the codeplug,
 * contact and boot-image writes refuse before their FIRST block, so a refusal
 * never leaves a partial write behind.
 */

const CONFIG_START = 0x001000;
const CONFIG_END = 0x008fff;
const CALIBRATION = 0x003000;

const blockAt = (address: number, metadata: number, type: MemoryBlock['type']): MemoryBlock => ({
  address,
  metadata,
  type,
});

/** A small radio whose calibration block sits between the zone block and the scan list block. */
const RADIO: MemoryBlock[] = [
  blockAt(0x001000, 0x12, 'channel'),
  blockAt(0x002000, 0x5c, 'zone'),
  blockAt(CALIBRATION, 0x02, 'calibration'),
  blockAt(0x004000, 0x11, 'scan'),
  blockAt(0x005000, 0x04, 'vfo'),
  blockAt(0x006000, 0xff, 'empty'),
  blockAt(0x007000, 0xff, 'empty'),
  blockAt(0x008000, 0xff, 'empty'),
];

const context = (blocks: readonly MemoryBlock[] = RADIO): WriteGuardContext => ({
  configStart: CONFIG_START,
  configEnd: CONFIG_END,
  blocks,
});

/** A 4 KB block whose metadata byte (0xFFF) is `tag`. */
function blockData(tag: number): Uint8Array {
  const data = new Uint8Array(0x1000).fill(0xff);
  data[0xfff] = tag;
  return data;
}

describe('assertBlockWritable', () => {
  it('refuses everything when the memory layout is unknown', () => {
    expect(() => assertBlockWritable({ address: 0x278000, length: 0x1000 }, null)).toThrow(
      /memory layout is unknown/
    );
  });

  it('refuses the calibration block by address, whatever the write says it is', () => {
    expect(() =>
      assertBlockWritable({ address: CALIBRATION, length: 0x1000, data: blockData(0x12), metadata: 0x12 }, context())
    ).toThrow(/calibration data at 0x003000/);
  });

  it('refuses a write that only overlaps the calibration block', () => {
    expect(() => assertBlockWritable({ address: 0x002800, length: 0x1000 }, context())).toThrow(
      /calibration data at 0x003000/
    );
  });

  it('refuses tagging a config block as calibration, by metadata or by its own byte 0xFFF', () => {
    expect(() => assertBlockWritable({ address: 0x004000, length: 0x1000, metadata: 0x02 }, context())).toThrow(
      /tagged as calibration/
    );
    expect(() =>
      assertBlockWritable({ address: 0x004000, length: 0x1000, data: blockData(0x02), metadata: 0x11 }, context())
    ).toThrow(/tagged as calibration/);
  });

  it('refuses the config memory when no block scan has run', () => {
    expect(() =>
      assertBlockWritable({ address: 0x004000, length: 0x1000, data: blockData(0x11), metadata: 0x11 }, context([]))
    ).toThrow(/without a block scan/);
  });

  it('refuses a config address the scan did not report', () => {
    const withoutSettings = RADIO.filter((b) => b.address !== 0x005000);
    expect(() => assertBlockWritable({ address: 0x005000, length: 0x1000 }, context(withoutSettings))).toThrow(
      /not a block the scan reported/
    );
  });

  it('allows a scanned block that is not calibration', () => {
    expect(() =>
      assertBlockWritable({ address: 0x004000, length: 0x1000, data: blockData(0x11), metadata: 0x11 }, context())
    ).not.toThrow();
  });

  it('leaves memory outside the config range alone, even without a scan', () => {
    // Contacts and the boot image live out here, and their byte 0xFFF is data
    // rather than a block tag: a boot image pixel of 0x02 is not calibration.
    expect(() => assertBlockWritable({ address: 0x278000, length: 0x1000 }, context([]))).not.toThrow();
    expect(() =>
      assertBlockWritable({ address: 0x150000, length: 0x1000, data: blockData(0x02), metadata: 0x02 }, context())
    ).not.toThrow();
  });
});

/** The write commands (0x57) that reached the serial port, by address. */
type Sent = number[];

function recordWrites(target: object, sent: Sent) {
  const serial = target as unknown as {
    write(data: Uint8Array): Promise<void>;
    readBytes(count: number): Promise<Uint8Array>;
  };
  vi.spyOn(serial, 'write').mockImplementation(async (data: Uint8Array) => {
    if (data[0] === 0x57) sent.push(data[1] | (data[2] << 8) | (data[3] << 16));
  });
  vi.spyOn(serial, 'readBytes').mockResolvedValue(new Uint8Array([0x06]));
}

describe('DM32Connection checks before sending a byte', () => {
  afterEach(() => vi.restoreAllMocks());

  it('writes nothing with no guard installed', async () => {
    const connection = new DM32Connection();
    const sent: Sent = [];
    recordWrites(connection, sent);
    await expect(connection.writeMemory(0x004000, blockData(0x11), 0x11)).rejects.toThrow(/memory layout is unknown/);
    await expect(connection.writeMemoryBlock(0x150000, new Uint8Array(2048))).rejects.toThrow(
      /memory layout is unknown/
    );
    expect(sent).toEqual([]);
  });

  it('refuses the calibration block through both write methods', async () => {
    const connection = new DM32Connection();
    const sent: Sent = [];
    recordWrites(connection, sent);
    connection.setWriteGuard(() => context());
    await expect(connection.writeMemory(CALIBRATION, blockData(0x02), 0x02)).rejects.toThrow(/calibration/);
    await expect(connection.writeMemoryBlock(CALIBRATION, new Uint8Array(2048))).rejects.toThrow(/calibration/);
    expect(sent).toEqual([]);
  });

  it('sends a block the guard allows', async () => {
    const connection = new DM32Connection();
    const sent: Sent = [];
    recordWrites(connection, sent);
    connection.setWriteGuard(() => context());
    await connection.writeMemory(0x004000, blockData(0x11), 0x11);
    expect(sent).toEqual([0x004000]);
  });
});

/** A V-frame payload that holds a range: two little-endian u32s. */
function range(start: number, end: number): Uint8Array {
  const bytes = new Uint8Array(8);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, start, true);
  view.setUint32(4, end, true);
  return bytes;
}

/**
 * A DM32UVProtocol connected through its real connectWithPort, so the guard is
 * installed by production code. Only the serial I/O is faked: metadata reads
 * answer from `radio`, and writes are recorded and acknowledged.
 */
async function connectedRadio(radio: MemoryBlock[], vframes: Array<[number, Uint8Array]> = []) {
  const sent: Sent = [];
  const frames = new Map<number, Uint8Array>([[VFRAME.MEMORY_LAYOUT, range(CONFIG_START, CONFIG_END)], ...vframes]);
  vi.spyOn(DM32Connection.prototype, 'connect').mockResolvedValue(undefined);
  vi.spyOn(DM32Connection.prototype, 'queryVFrames').mockResolvedValue(frames);
  vi.spyOn(DM32Connection.prototype, 'enterProgrammingMode').mockResolvedValue(undefined);
  vi.spyOn(DM32Connection.prototype, 'readMemory').mockImplementation(async (address: number, length: number) => {
    const block = radio.find((b) => b.address === Math.floor(address / 0x1000) * 0x1000);
    return new Uint8Array(length).fill(block ? block.metadata : 0xff);
  });
  recordWrites(DM32Connection.prototype, sent);

  const protocol = new DM32UVProtocol();
  await (protocol as unknown as { connectWithPort(port: unknown): Promise<void> }).connectWithPort({});
  return { protocol, sent };
}

const cachedBlocks = (radio: MemoryBlock[]) =>
  radio
    .filter((b) => b.type !== 'empty')
    .map((b) => ({ metadata: b.metadata, address: b.address, data: blockData(b.metadata) }));

const oneScanList: ScanList = { name: 'SL1', channels: [], ctcScanMode: 0, scanTxMode: 0 };

describe('DM-32 writes check every block before their first', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('a codeplug write never sends the calibration block', async () => {
    const { protocol, sent } = await connectedRadio(RADIO);
    protocol.cachedBlockData = cachedBlocks(RADIO);
    await protocol.writeAllData([], [], [oneScanList]);
    expect(sent).not.toContain(CALIBRATION);
    expect(sent).toEqual([0x002000, 0x004000]);
  });

  it('a codeplug write that would reach calibration sends nothing, not even the blocks ahead of it', async () => {
    const { protocol, sent } = await connectedRadio(RADIO);
    protocol.cachedBlockData = cachedBlocks(RADIO);
    // Stand in for a writer bug: the guard's map says the scan list block is calibration.
    const doctored = RADIO.map((b) => (b.address === 0x004000 ? blockAt(0x004000, 0x02, 'calibration') : b));
    vi.spyOn(
      protocol as unknown as { writeGuardContext(): WriteGuardContext | null },
      'writeGuardContext'
    ).mockReturnValue(context(doctored));
    await expect(protocol.writeAllData([], [], [oneScanList])).rejects.toThrow(/calibration/);
    expect(sent).toEqual([]);
  });

  it('a contact list that runs past the contact memory writes nothing', async () => {
    const { protocol, sent } = await connectedRadio(RADIO, [[VFRAME.CONTACTS, range(0x278000, 0x278fff)]]);
    const contacts = Array.from({ length: 45 }, (_, i) => ({ id: i + 1, name: `C${i + 1}`, dmrId: 3100000 + i }) as Contact);
    await expect(protocol.writeContacts(contacts)).rejects.toThrow(/past the end of the radio's contact memory/);
    await expect(protocol.writeContacts(contacts)).rejects.toThrow(/At most 44 fit/);
    expect(sent).toEqual([]);
  });

  it('a contact range reported inside the config memory writes nothing', async () => {
    const { protocol, sent } = await connectedRadio(RADIO, [[VFRAME.CONTACTS, range(CALIBRATION, CONFIG_END)]]);
    await expect(protocol.writeContacts([{ id: 1, name: 'C1', dmrId: 3100000 } as Contact])).rejects.toThrow(
      /config memory/
    );
    expect(sent).toEqual([]);
  });

  it('a boot image aimed at the config memory writes nothing', async () => {
    const { protocol, sent } = await connectedRadio(RADIO, [[0x0e, range(0x002000, 0x0fffff)]]);
    await expect(protocol.writeBootImage(new Uint8Array(BOOT_IMAGE.SIZE))).rejects.toThrow(
      /overlap the radio's config memory/
    );
    expect(sent).toEqual([]);
  });

  it('boot image pixels are not mistaken for a calibration tag', async () => {
    const { protocol, sent } = await connectedRadio(RADIO, [[0x0e, range(0x150000, 0x175fff)]]);
    const image = new Uint8Array(BOOT_IMAGE.SIZE);
    for (let i = 0; i < BOOT_IMAGE.FULL_BLOCKS; i++) image[i * 0x1000 + 0xfff] = 0x02;
    vi.useFakeTimers();
    const done = protocol.writeBootImage(image);
    await vi.runAllTimersAsync();
    await done;
    expect(sent).toHaveLength(BOOT_IMAGE.BLOCKS);
  });
});
