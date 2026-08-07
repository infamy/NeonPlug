import { describe, it, expect } from 'vitest';
import {
  parseScanLists,
  encodeScanList,
  parseChannel,
  encodeChannel,
} from '../../src/radios/dm32uv/structures';
import type { ScanList } from '../../src/models';

// ---------------------------------------------------------------------------
// Fixtures captured from a real DM-32UV (2026-08-07 bug report, bugs/Scanlist
// issues/), read right after an OEM CPS write. These bytes pin the layout:
//  - membership is the +0x1A list only, max 15 channels
//  - the +0x0F slot is CPS bookkeeping, NOT a scannable member
//    (hardware-verified: a channel written there vanishes from the list);
//    the raw count byte at +0x0B = list + 1 because the CPS counts it
//  - hang time byte 6 = 3.0s (0.5s steps)
//  - 11-char names ("70CM REPTRS") fill the field with no null terminator
// ---------------------------------------------------------------------------

const SCAN_BLOCK_HEX =
  '07535720434c5553544552000900060001000000000002fe010000da00db00dc00dd00de00df00e000e1000000000000' +
  '00000000000000000000504d52004c697374203100100006000100000000000000000000020003000400050006000700' +
  '080009000a000b000c000d000e000f001000004252534c006973742031000a0006001100000000000000000000120013' +
  '001400150016001700180019001a00000000000000000000000000004149522042414e44003100100006000100000000' +
  '000000000000bc00bd00be00bf00c000c100c200c300c400c500c600c700c800c900ca00004149522053484f57530000' +
  '0b200600d400000000000000000000d500d600d700d800d900cf00d000d100d200d30000000000000000000000004d41' +
  '52494e450074203100100006000100000000000000000000380039003a003b003c003d003e003f004000410042004300' +
  '440045004700003730434d205245505452531000060093000000000000000000009400950096009700980099009a009b' +
  '009c009d009e009f00a000a100a2000000000000000000000000000000000000';

// Channel 1 "PMR1-00": byte 0x19 = 0x42 → scan add on, scan list 2 (PMR)
const CH1_HEX =
  '504d52312d303000310000000000000025066044250660440242000010000500ffffffffff0000000000000000000000';
// Channel 17: byte 0x19 = 0x43 → scan add on, scan list 3 (BRSL)
const CH17_HEX =
  '4252534c3600ffffffffffffffffffff00504016005040160443000010000500ffffffffff0000000000000000000000';

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function range(from: number, to: number): number[] {
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}

describe('parseScanLists (real radio dump)', () => {
  const lists = parseScanLists(hexToBytes(SCAN_BLOCK_HEX));

  it('parses all 7 scan lists', () => {
    expect(lists).toHaveLength(7);
  });

  it('parses names, including an 11-char name with no null terminator', () => {
    expect(lists.map(l => l.name)).toEqual([
      'SW CLUSTER', 'PMR', 'BRSL', 'AIR BAND', 'AIR SHOWS', 'MARINE', '70CM REPTRS',
    ]);
  });

  it('excludes the +0x0F bookkeeping slot from membership', () => {
    // PMR: CPS "Scan Numb" said 16, but only the 15 channels at +0x1A are
    // real members; channel 1 sits in the phantom +0x0F slot.
    expect(lists[1].channels).toEqual(range(2, 16));
    // BRSL: count byte 10, members are the 9 channels 18-26 (17 is phantom).
    expect(lists[2].channels).toEqual(range(18, 26));
    // SW CLUSTER: +0x0F holds channel 1 — a CPS default, clearly never a
    // member of a shortwave-cluster list.
    expect(lists[0].channels).toEqual(range(218, 225));
  });

  it('keeps members in user order (AIR SHOWS is not sorted)', () => {
    expect(lists[4].channels).toEqual([213, 214, 215, 216, 217, 207, 208, 209, 210, 211]);
  });

  it('reports channelCount as real membership, not the inflated count byte', () => {
    for (const list of lists) {
      expect(list.channelCount).toBe(list.channels.length);
      expect(list.channels.length).toBeLessThanOrEqual(15);
    }
  });

  it('parses hang time as the raw radio byte (6 = 3.0s in the CPS)', () => {
    for (const list of lists) {
      expect(list.hangTime).toBe(6);
    }
  });
});

describe('encodeScanList', () => {
  const fullList: ScanList = {
    name: 'PMR',
    channels: range(1, 15),
    ctcScanMode: 0,
    scanTxMode: 0,
    hangTime: 6,
  };

  it('writes all members to +0x1A and leaves +0x0F empty', () => {
    const data = encodeScanList(fullList, 1);
    expect(data[0x0B]).toBe(15);
    expect(data[0x0F]).toBe(0); // never a member slot
    expect(data[0x10]).toBe(0);
    expect(data[0x1A] | (data[0x1B] << 8)).toBe(1);
    expect(data[0x38 - 2] | (data[0x38 - 1] << 8)).toBe(15); // last slot
  });

  it('round-trips a full 15-channel list through parseScanLists', () => {
    const block = new Uint8Array(4096);
    block[0] = 1;
    block.set(encodeScanList(fullList, 1), 1);
    const [parsed] = parseScanLists(block);
    expect(parsed.name).toBe('PMR');
    expect(parsed.channels).toEqual(range(1, 15));
    expect(parsed.hangTime).toBe(6);
  });

  it('round-trips an 11-char name without a null terminator', () => {
    const list: ScanList = { ...fullList, name: '70CM REPTRS', channels: [147] };
    const data = encodeScanList(list, 1);
    expect(data[0x0A]).not.toBe(0); // 11th char, no terminator
    const block = new Uint8Array(4096);
    block[0] = 1;
    block.set(data, 1);
    expect(parseScanLists(block)[0].name).toBe('70CM REPTRS');
  });

  it('caps membership at 15 channels', () => {
    const list: ScanList = { ...fullList, channels: range(1, 20) };
    const data = encodeScanList(list, 1);
    expect(data[0x0B]).toBe(15);
    const block = new Uint8Array(4096);
    block[0] = 1;
    block.set(data, 1);
    expect(parseScanLists(block)[0].channels).toEqual(range(1, 15));
  });

  it('encodes an empty list with a zero count and no first member', () => {
    const list: ScanList = { ...fullList, channels: [] };
    const data = encodeScanList(list, 1);
    expect(data[0x0B]).toBe(0);
    expect(data[0x0F]).toBe(0);
    expect(data[0x10]).toBe(0);
  });
});

describe('priority channel 1 at +0x11 (hardware-confirmed via OEM CPS write)', () => {
  // Fixture: the CZB entry as the OEM CPS wrote it on 2026-08-07 after the
  // user set members {74, 73, 75, 3}, FRS3 (channel 3) as Priority 1 and
  // channel 75 as Priority 2: count 4, first member 74 at +0x0F, priority
  // types 0x22, priority channels stored DIRECTLY at +0x11 and +0x13,
  // members 2-4 at +0x1A.
  const CZB_ENTRY_HEX =
    '435a42000000000000000004030622' + '4a00' + '0300' + '4b00' + '0000000000' +
    '49004b000300' + '00'.repeat(24) + '00';

  it('parses the CPS-written CZB entry: membership and priorities are separate', () => {
    const block = new Uint8Array(4096);
    block[0] = 1;
    block.set(hexToBytes(CZB_ENTRY_HEX), 1);
    const [parsed] = parseScanLists(block);
    expect(parsed.name).toBe('CZB');
    // 74 sits in the phantom +0x0F slot — not a member
    expect(parsed.channels).toEqual([73, 75, 3]);
    expect(parsed.priority1Type).toBe(2);
    expect(parsed.priorityChannel1).toBe(3);
    expect(parsed.priority2Type).toBe(2);
    expect(parsed.priorityChannel2).toBe(75);
    expect(parsed.hangTime).toBe(6);
  });

  it('writes priority channel 2 to +0x13 directly', () => {
    const list: ScanList = {
      name: 'PRI2',
      channels: [10, 11, 75],
      ctcScanMode: 0,
      scanTxMode: 0,
      priority2Type: 2,
      priorityChannel2: 75,
    };
    const data = encodeScanList(list, 1);
    expect(data[0x13] | (data[0x14] << 8)).toBe(75);
    const block = new Uint8Array(4096);
    block[0] = 1;
    block.set(data, 1);
    expect(parseScanLists(block)[0].priorityChannel2).toBe(75);
  });

  const base: ScanList = {
    name: 'PRI',
    channels: [10, 11, 12],
    ctcScanMode: 0,
    scanTxMode: 0,
    priority1Type: 2,
  };

  it('writes the priority channel to +0x11 directly without touching membership', () => {
    const data = encodeScanList({ ...base, priorityChannel1: 12 }, 1);
    expect(data[0x0B]).toBe(3);
    expect(data[0x0F]).toBe(0); // bookkeeping slot untouched
    expect(data[0x11] | (data[0x12] << 8)).toBe(12); // priority slot
    expect(data[0x1A] | (data[0x1B] << 8)).toBe(10); // members in order
    expect(data[0x1C] | (data[0x1D] << 8)).toBe(11);
  });

  it('drops a priority channel that is not a member (radio discards them)', () => {
    const data = encodeScanList({ ...base, priorityChannel1: 99 }, 1);
    expect(data[0x0B]).toBe(3); // membership unchanged
    expect(data[0x11]).toBe(0); // not written
    expect(data[0x12]).toBe(0);
    expect(data[0x0E] & 0x0F).toBe(0); // type downgraded to None
  });

  it('does not write the priority slot when type is None', () => {
    const data = encodeScanList({ ...base, priority1Type: 0, priorityChannel1: 12 }, 1);
    expect(data[0x11]).toBe(0);
    expect(data[0x12]).toBe(0);
  });

  it('round-trips priority through encode and parse', () => {
    const block = new Uint8Array(4096);
    block[0] = 1;
    block.set(encodeScanList({ ...base, priorityChannel1: 12 }, 1), 1);
    const [parsed] = parseScanLists(block);
    expect(parsed.priorityChannel1).toBe(12);
    expect(parsed.channels).toEqual([10, 11, 12]);
  });
});

describe('channel scan list reference (byte 0x19 bits 5-0)', () => {
  it('parses the scan list ID from the low 6 bits of a real channel', () => {
    const ch1 = parseChannel(hexToBytes(CH1_HEX), 1);
    expect(ch1.scanListId).toBe(2); // PMR is the radio's list #2
    expect(ch1.scanAdd).toBe(true);
    expect(ch1.bandwidth).toBe('12.5kHz');

    const ch17 = parseChannel(hexToBytes(CH17_HEX), 17);
    expect(ch17.scanListId).toBe(3); // BRSL is the radio's list #3
  });

  it('round-trips scan list IDs 0-32 through encode/parse', () => {
    const base = parseChannel(hexToBytes(CH1_HEX), 1);
    for (const id of [0, 1, 2, 15, 16, 32]) {
      const encoded = encodeChannel({ ...base, scanListId: id });
      expect(encoded[0x19] & 0x3F).toBe(id);
      expect(parseChannel(encoded, 1).scanListId).toBe(id);
    }
  });

  it('preserves scan add and bandwidth bits alongside the ID', () => {
    const base = parseChannel(hexToBytes(CH1_HEX), 1);
    const encoded = encodeChannel({ ...base, scanListId: 32, bandwidth: '25kHz', scanAdd: true });
    expect(encoded[0x19]).toBe(0x80 | 0x40 | 32);
  });
});
