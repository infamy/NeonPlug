import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  parseQuickContacts,
  encodeQuickContactsBlocks,
  encodeQuickAccessList,
} from '../../src/radios/dm32uv/structures';
import { DM32Connection } from '../../src/radios/dm32uv/connection';
import { DM32UVProtocol } from '../../src/radios/dm32uv/protocol';
import { LIMITS, OFFSET, VFRAME } from '../../src/radios/dm32uv/constants';
import type { MemoryBlock } from '../../src/radios/dm32uv/memory';
import type { QuickContact } from '../../src/models';

/**
 * DM-32 talk groups span blocks 0x44-0x48, 170 slots each, up to 800.
 *
 * The layout is Will-83's hardware work in PR #168: a radio read holding 606
 * talk groups, and vendor CPS write captures of 606 and 607. These pin the bytes
 * NeonPlug reads and writes; they can't show that the radio accepts them.
 */

const TALK_GROUP_BLOCKS = [0x44, 0x45, 0x46, 0x47, 0x48];

const talkGroup = (n: number, fields: Partial<QuickContact> = {}): QuickContact => ({
  index: n,
  offset: 0,
  name: `TG ${n}`,
  contactNumber: 3100000 + n,
  callType: 0x04,
  hasHeader: false,
  flag: 0,
  rawData: new Uint8Array(0),
  ...fields,
});

const talkGroups = (count: number) => Array.from({ length: count }, (_, i) => talkGroup(i + 1));

/** Parse blocks the way readQuickContacts does: in order, metadata byte left off, slots numbered on across blocks. */
function parseBlocks(blocks: Uint8Array[]): QuickContact[] {
  const all: QuickContact[] = [];
  let next = 1;
  for (const block of blocks) {
    const { contacts, nextIndex } = parseQuickContacts(block.slice(0, OFFSET.METADATA_BYTE), undefined, next);
    all.push(...contacts);
    next = nextIndex;
  }
  return all;
}

const summary = (list: QuickContact[]) => list.map((tg) => [tg.index, tg.name, tg.contactNumber, tg.callType]);

describe('DM-32 talk group blocks', () => {
  it('holds 170 talk groups a block and brings all 800 back in slot order', () => {
    const list = talkGroups(LIMITS.TALK_GROUPS_MAX);
    const blocks = encodeQuickContactsBlocks(list, TALK_GROUP_BLOCKS);

    expect(blocks.map((block) => block[0xfff])).toEqual(TALK_GROUP_BLOCKS);
    expect(summary(parseBlocks(blocks))).toEqual(summary(list));
    expect(LIMITS.TALK_GROUPS_PER_BLOCK).toBe(170);
    expect(parseQuickContacts(blocks[0].slice(0, OFFSET.METADATA_BYTE)).contacts).toHaveLength(170);
    // Slot 171 is the second block's first, just after its header.
    const [first] = parseQuickContacts(blocks[1].slice(0, OFFSET.METADATA_BYTE), undefined, 171).contacts;
    expect(first).toMatchObject({ index: 171, name: 'TG 171', offset: 0, hasHeader: true });
  });

  it('refuses a list the blocks cannot hold, rather than drop the end of it', () => {
    expect(() => encodeQuickContactsBlocks(talkGroups(171), [0x44])).toThrow(/1 talk group\(s\) don't fit/);
  });

  it('writes a shorter list over every block, leaving the later ones empty', () => {
    const blocks = encodeQuickContactsBlocks(talkGroups(2), TALK_GROUP_BLOCKS);
    expect(blocks.map((block) => parseQuickContacts(block.slice(0, OFFSET.METADATA_BYTE)).contacts.length)).toEqual([
      2, 0, 0, 0, 0,
    ]);
  });

  it('counts an empty slot, so the talk groups after it keep their slot numbers', () => {
    const [block] = encodeQuickContactsBlocks(talkGroups(3), [0x44]);
    block[1 + 24 + 1] = 0x00; // slot 2's name: header, slot 1, then slot 2's flag byte
    expect(parseBlocks([block]).map((tg) => tg.index)).toEqual([1, 3]);
  });

  it("reads a block written the vendor CPS's way, with a 0xFF header and 0xFF fill", () => {
    const [block] = encodeQuickContactsBlocks(talkGroups(2), [0x44]);
    block[0] = 0xff;
    block.fill(0xff, 1 + 2 * 24, 0xfff);
    const { contacts, nextIndex } = parseQuickContacts(block.slice(0, OFFSET.METADATA_BYTE));
    expect(summary(contacts)).toEqual(summary(talkGroups(2)));
    expect(nextIndex).toBe(171);
  });

  it('writes the All Call default for an empty list', () => {
    const [first, ...rest] = encodeQuickContactsBlocks([], TALK_GROUP_BLOCKS);
    expect(summary(parseBlocks([first]))).toEqual([[1, 'All', 0xffffff, 0x05]]);
    expect(parseBlocks(rest)).toEqual([]);
  });

  it('keeps an accented name as single bytes', () => {
    const blocks = encodeQuickContactsBlocks([talkGroup(1, { name: 'Perú' })], [0x44]);
    expect(Array.from(blocks[0].slice(2, 6))).toEqual([0x50, 0x65, 0x72, 0xfa]);
    expect(parseBlocks(blocks)[0].name).toBe('Perú');
  });
});

const NAME_TABLE = 0x100;
const ID_TABLE = 0x740;

/** A 0x0B table reference as [slot, call type], or null where it is blank. */
function reference(block: Uint8Array, table: number, position: number): [number, number] | null {
  const low = block[table + position * 2];
  const high = block[table + position * 2 + 1];
  if (low === 0xff && high === 0xff) return null;
  return [((high & 0x0f) << 8) | low, high & 0xf0];
}

describe('DM-32 Quick Access Contact List (0x0B)', () => {
  it('references a slot past 255 with its high bits under the call type', () => {
    const list = talkGroups(300);
    list[299] = talkGroup(300, { contactNumber: 9 }); // the lowest DMR ID, so first in the ID table
    const block = encodeQuickAccessList(new Uint8Array(0x1000), list);
    expect(Array.from(block.slice(ID_TABLE, ID_TABLE + 2))).toEqual([0x2c, 0x41]);
    expect(reference(block, ID_TABLE, 0)).toEqual([300, 0x40]);
  });

  it('sorts the name table in byte order, as the vendor CPS does', () => {
    const list = [
      talkGroup(1, { name: 'Alabama' }),
      talkGroup(2, { name: 'ALERT-K4NWS' }),
      talkGroup(3, { name: 'alpha', callType: 0x03 }),
    ];
    const block = encodeQuickAccessList(new Uint8Array(0x1000), list);
    expect([0, 1, 2].map((position) => reference(block, NAME_TABLE, position))).toEqual([
      [2, 0x40],
      [1, 0x40],
      [3, 0x30],
    ]);
  });

  it('leaves the reference for DMR ID 0 blank without moving the ones after it', () => {
    const list = [talkGroup(1, { contactNumber: 0 }), talkGroup(2, { contactNumber: 5 })];
    const block = encodeQuickAccessList(new Uint8Array(0x1000), list);
    expect(reference(block, ID_TABLE, 0)).toBeNull();
    expect(reference(block, ID_TABLE, 1)).toEqual([2, 0x40]);
  });

  it('writes the counts and the used mask, and keeps every other byte', () => {
    const original = new Uint8Array(0x1000).fill(0xaa);
    const list = [...talkGroups(9), talkGroup(10, { callType: 0x03 })];
    const block = encodeQuickAccessList(original, list);

    expect(Array.from(block.slice(0, 5))).toEqual([10, 0, 9, 0, 1]);
    expect(Array.from(block.slice(0x10, 0x13))).toEqual([0x00, 0xfc, 0xff]);
    for (const [from, to] of [[0x05, 0x10], [0x20, 0x100], [0x700, 0x740], [0xd00, 0x1000]]) {
      expect(block.slice(from, to).every((b) => b === 0xaa)).toBe(true);
    }
    expect(original.every((b) => b === 0xaa)).toBe(true);
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

const CONFIG_START = 0x001000;
const CONFIG_END = 0x008fff;

/** A V-frame payload that holds a range: two little-endian u32s. */
function range(start: number, end: number): Uint8Array {
  const bytes = new Uint8Array(8);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, start, true);
  view.setUint32(4, end, true);
  return bytes;
}

const blockAt = (address: number, metadata: number, type: MemoryBlock['type']): MemoryBlock => ({
  address,
  metadata,
  type,
});

/** All five talk group blocks, with calibration, 0x0B and 0x06 in among them. */
const RADIO: MemoryBlock[] = [
  blockAt(0x001000, 0x44, 'talkgroup'),
  blockAt(0x002000, 0x45, 'talkgroup'),
  blockAt(0x003000, 0x02, 'calibration'),
  blockAt(0x004000, 0x46, 'talkgroup'),
  blockAt(0x005000, 0x0b, 'unknown'),
  blockAt(0x006000, 0x06, 'config'),
  blockAt(0x007000, 0x47, 'talkgroup'),
  blockAt(0x008000, 0x48, 'talkgroup'),
];

/**
 * A DM32UVProtocol connected through its real connectWithPort, so the write
 * guard is installed by production code. Only the serial I/O is faked: metadata
 * reads answer from `radio`, and writes are recorded and acknowledged.
 */
async function connectedRadio(radio: MemoryBlock[]) {
  const sent: Sent = [];
  vi.spyOn(DM32Connection.prototype, 'connect').mockResolvedValue(undefined);
  vi.spyOn(DM32Connection.prototype, 'queryVFrames').mockResolvedValue(
    new Map([[VFRAME.MEMORY_LAYOUT, range(CONFIG_START, CONFIG_END)]])
  );
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

/** What a read would have cached: `list` across the talk group blocks, and a tagged block for the rest. */
function cachedRead(radio: MemoryBlock[], list: QuickContact[]) {
  const talkGroupBlocks = radio.filter((b) => TALK_GROUP_BLOCKS.includes(b.metadata)).sort((a, b) => a.metadata - b.metadata);
  const encoded = encodeQuickContactsBlocks(list, talkGroupBlocks.map((b) => b.metadata));
  return radio.map((b) => {
    const i = talkGroupBlocks.indexOf(b);
    const data = i >= 0 ? encoded[i] : new Uint8Array(0x1000).fill(0xff);
    data[0xfff] = b.metadata;
    return { metadata: b.metadata, address: b.address, data };
  });
}

describe('DM-32 talk group read and write', () => {
  afterEach(() => vi.restoreAllMocks());

  it('reads talk groups from all five blocks', async () => {
    const { protocol } = await connectedRadio(RADIO);
    protocol.discoveredBlocks = RADIO;
    protocol.cachedBlockData = cachedRead(RADIO, talkGroups(606));
    expect(summary(await protocol.readQuickContacts())).toEqual(summary(talkGroups(606)));
  });

  it('refuses to read the list with a block missing, rather than return part of it', async () => {
    const { protocol } = await connectedRadio(RADIO);
    protocol.discoveredBlocks = RADIO;
    protocol.cachedBlockData = cachedRead(RADIO, talkGroups(606)).filter((b) => b.metadata !== 0x46);
    await expect(protocol.readQuickContacts()).rejects.toThrow(/block 0x46 at 0x004000 was not read/);
  });

  it('refuses talk group blocks that are not a run from 0x44', async () => {
    const gap = RADIO.filter((b) => b.metadata !== 0x45);
    const { protocol } = await connectedRadio(gap);
    protocol.discoveredBlocks = gap;
    protocol.cachedBlockData = cachedRead(gap, talkGroups(10));
    await expect(protocol.readQuickContacts()).rejects.toThrow(/are 0x44, 0x46, 0x47, 0x48, not a run from 0x44/);
  });

  it('writes every talk group block and then 0x0B, and leaves 0x06 alone', async () => {
    const { protocol, sent } = await connectedRadio(RADIO);
    protocol.cachedBlockData = cachedRead(RADIO, []);
    await protocol.writeQuickContacts(talkGroups(400));
    expect(sent).toEqual([0x001000, 0x002000, 0x004000, 0x007000, 0x008000, 0x005000]);
    expect(summary(await protocol.readQuickContacts())).toEqual(summary(talkGroups(400)));
  });

  it('refuses a list the radio has no room for before a block is sent', async () => {
    const twoBlocks = RADIO.filter((b) => ![0x46, 0x47, 0x48].includes(b.metadata));
    const { protocol, sent } = await connectedRadio(twoBlocks);
    protocol.cachedBlockData = cachedRead(twoBlocks, []);
    await expect(protocol.assertTalkGroupWriteFits(341)).rejects.toThrow(/found 2 talk group blocks, which hold 340/);
    await expect(protocol.writeQuickContacts(talkGroups(341))).rejects.toThrow(/No talk groups were written/);
    await expect(protocol.assertTalkGroupWriteFits(340)).resolves.toBeUndefined();
    expect(sent).toEqual([]);
  });

  it('refuses to write when 0x0B was not read, rather than read it in the middle of a write', async () => {
    const { protocol, sent } = await connectedRadio(RADIO);
    protocol.cachedBlockData = cachedRead(RADIO, []).filter((b) => b.metadata !== 0x0b);
    await expect(protocol.writeQuickContacts(talkGroups(10))).rejects.toThrow(/\(block 0x0B\) that indexes them was not read/);
    expect(sent).toEqual([]);
  });
});
