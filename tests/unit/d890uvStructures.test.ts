import { describe, it, expect } from 'vitest';
import {
  channelAddresses,
  decodeOccupancyBitmap,
  occupiedIndices,
  decodeWideCharString,
  decodeBcdAsHexU32,
  decodeFrequencyHz,
  decodeFrequencyMHz,
  readU16LE,
  readU16BE,
  readU32LE,
  decodeU16Members,
  decodeU32Members,
  decodePriorityChannel,
  parseZone,
  parseTalkgroup,
  parseScanList,
  parseChannel,
  isVacantChannel,
  planChannelReads,
  talkgroupAddress,
  D890_TALKGROUPS_PER_BANK,
  decodeWideCharString,
} from '../../src/radios/d890uv/structures';
import {
  D890_ADDR,
  D890_LIMITS,
  D890_TALKGROUP_BITMAP_INVERTED,
} from '../../src/radios/d890uv/constants';

// NOTE: these pin the *documented* layout, not hardware-observed bytes. They
// stop the decoders drifting from the reference; they do not prove the
// reference is right. Real captures go in tests/fixtures/d890uv/ once a radio
// has been read — see D890UV-HARDWARE-CHECKLIST.md.

describe('registry wiring', () => {
  it('is registered under every rebrand name, so the picker and protocol agree', async () => {
    const { getRadioPickerOptions, createProtocolForModel } = await import('../../src/radios');
    const { D890_MODEL_IDS } = await import('../../src/radios/d890uv/descriptor');

    // One picker entry per descriptor, keyed on the first model ID.
    expect(getRadioPickerOptions().some((o) => o.modelId === 'DA-7X2')).toBe(true);

    // All three names must resolve to a protocol — the DA-7X2 and DA-7XR are
    // BTECH rebrands of the AT-D890UV, so a user picking any of them gets the
    // same driver.
    for (const id of D890_MODEL_IDS) {
      expect(createProtocolForModel(id), `no protocol for ${id}`).not.toBeNull();
    }
  });

  it('reports a model ID that resolves to capabilities, not the wire ID string', async () => {
    // Found on hardware 2026-08-25. The radio identifies itself as "ID890UV",
    // and getRadioInfo() used to return that verbatim. useRadioConnection feeds
    // it straight into getCapabilitiesForModel(), which is keyed on descriptor
    // modelIds — so the lookup missed and every `caps?.x` read as undefined,
    // silently disabling supportsChannelRead, supportsZones and supportsScanLists.
    const { getCapabilitiesForModel } = await import('../../src/radios/capabilities');
    const { D890_MODEL_IDS } = await import('../../src/radios/d890uv/constants');
    const { D890_ID_PREFIXES } = await import('../../src/radios/d890uv/constants');

    // The two namespaces are genuinely different — that is the trap.
    expect(D890_MODEL_IDS).not.toContain(D890_ID_PREFIXES[0]);
    expect(getCapabilitiesForModel(D890_ID_PREFIXES[0])).toBeFalsy();

    // Whatever getRadioInfo() reports must resolve. Guard the contract by
    // checking the constant the protocol actually returns.
    expect(getCapabilitiesForModel(D890_MODEL_IDS[0])).toBeTruthy();
    // Channels read normally now the tone table is derived, so the temporary
    // supportsChannelRead:false is gone. Assert something stable instead.
    expect(getCapabilitiesForModel(D890_MODEL_IDS[0])?.supportsRawRegionDump).toBe(true);
  });

  it('exposes capability limits rather than requiring model-string checks', async () => {
    const { getCapabilitiesForModel } = await import('../../src/radios/capabilities');
    const caps = getCapabilitiesForModel('DA-7X2');
    expect(caps?.maxChannels).toBe(D890_LIMITS.CHANNELS_MAX);
    expect(caps?.maxZones).toBe(D890_LIMITS.ZONES_MAX);
    expect(caps?.supportsZones).toBe(true);
    // No contiguous clone image on this radio, so the DM-32's bulk block read
    // does not apply.
    expect(caps?.supportsBulkRead).toBe(false);
  });
});

describe('channel addressing', () => {
  it('places channel 0 at the data base', () => {
    expect(channelAddresses(0)).toEqual({
      primary: 0x1000000,
      secondary: 0x1000040,
    });
  });

  it('strides 0x80 within a block', () => {
    expect(channelAddresses(1).primary).toBe(0x1000080);
    expect(channelAddresses(127).primary).toBe(0x1000000 + 127 * 0x80);
  });

  it('jumps a whole block at channel 128, not a further 0x80', () => {
    // The bug this guards: `base + index * 0x80` is right for the first 128
    // channels and silently wrong for every one after.
    const naive = 0x1000000 + 128 * 0x80;
    expect(channelAddresses(128).primary).toBe(0x1080000);
    expect(channelAddresses(128).primary).not.toBe(naive);
  });

  it('keeps the two halves 0x40 apart at every index', () => {
    for (const idx of [0, 1, 127, 128, 3999]) {
      const { primary, secondary } = channelAddresses(idx);
      expect(secondary - primary).toBe(0x40);
    }
  });

  it('covers the full 4000-channel range within the documented regions', () => {
    const last = channelAddresses(D890_LIMITS.CHANNELS_MAX - 1);
    expect(last.primary).toBeGreaterThan(D890_ADDR.CHANNEL_DATA);
    // 4000 channels / 128 per block = block 31
    expect(last.primary).toBe(0x1000000 + 31 * 0x80000 + 31 * 0x80);
  });
});

describe('occupancy bitmaps', () => {
  it('maps slot n to byte n/8, bit n%8', () => {
    const bytes = new Uint8Array([0b0000_0101, 0b0000_0010]);
    const occ = decodeOccupancyBitmap(bytes, 16);
    expect(occupiedIndices(occ)).toEqual([0, 2, 9]);
  });

  it('inverts for the talkgroup bitmap, where a set bit means EMPTY', () => {
    const bytes = new Uint8Array([0b1111_1110]);
    // Normal sense: slots 1-7 present. Inverted: only slot 0 present.
    expect(occupiedIndices(decodeOccupancyBitmap(bytes, 8))).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(
      occupiedIndices(decodeOccupancyBitmap(bytes, 8, D890_TALKGROUP_BITMAP_INVERTED))
    ).toEqual([0]);
  });

  it('treats bytes past the end of the array as empty rather than throwing', () => {
    expect(occupiedIndices(decodeOccupancyBitmap(new Uint8Array([0xff]), 24))).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7,
    ]);
  });

  it('the talkgroup bitmap is big enough for the documented 10,000 limit', () => {
    // The vendor CPS reads this bitmap with length 0x4e2 = 1250 bytes = exactly
    // 10,000 bits, matching the documented limit precisely. The reference doc's
    // 0x4f0 was rounded up; an exact fit is strong evidence the limit is real.
    expect(D890_ADDR.TALKGROUP_SET_SIZE * 8).toBe(D890_LIMITS.TALK_GROUPS_BITMAP_CAPACITY);
    expect(D890_LIMITS.TALK_GROUPS_BITMAP_CAPACITY).toBe(D890_LIMITS.TALK_GROUPS_MAX);
  });

  it('the zone bitmap holds the documented 250 zones', () => {
    expect(D890_ADDR.ZONE_SET_SIZE * 8).toBe(D890_LIMITS.ZONES_BITMAP_CAPACITY);
    expect(D890_LIMITS.ZONES_BITMAP_CAPACITY).toBeGreaterThanOrEqual(D890_LIMITS.ZONES_MAX);
  });
});

describe('wide-char names', () => {
  function wide(s: string, padTo = 0): Uint8Array {
    const out = new Uint8Array(Math.max(s.length * 2, padTo));
    for (let i = 0; i < s.length; i++) {
      out[i * 2] = s.charCodeAt(i) & 0xff;
      out[i * 2 + 1] = s.charCodeAt(i) >> 8;
    }
    return out;
  }

  it('decodes two-byte characters', () => {
    expect(decodeWideCharString(wide('SIMPLEX'))).toBe('SIMPLEX');
  });

  it('stops at the NUL terminator', () => {
    expect(decodeWideCharString(wide('GB3', 32))).toBe('GB3');
  });

  it('decodes a name that fills the field with no terminator', () => {
    const full = 'ABCDEFGHIJKLMNOP'; // exactly 16 chars = 32 bytes
    expect(decodeWideCharString(wide(full), 16)).toBe(full);
  });

  it('honours the character cap', () => {
    expect(decodeWideCharString(wide('ABCDEFGHIJ'), 4)).toBe('ABCD');
  });

  it('returns empty for an all-zero field', () => {
    expect(decodeWideCharString(new Uint8Array(32))).toBe('');
  });
});

describe('BCD-as-hex decoding', () => {
  it('reads hex digits as decimal, per the documented examples', () => {
    expect(decodeBcdAsHexU32(new Uint8Array([0x00, 0x00, 0x00, 0x09]))).toBe(9);
    expect(decodeBcdAsHexU32(new Uint8Array([0x00, 0x00, 0x00, 0x99]))).toBe(99);
    expect(decodeBcdAsHexU32(new Uint8Array([0x00, 0x02, 0x35, 0x59]))).toBe(23559);
  });

  it('is not a binary integer read', () => {
    // 0x23 is the digits "23", not the value 35. Confusing the two is the
    // classic BCD bug and would silently corrupt every DMR ID.
    expect(decodeBcdAsHexU32(new Uint8Array([0x00, 0x00, 0x00, 0x23]))).toBe(23);
    expect(decodeBcdAsHexU32(new Uint8Array([0x00, 0x00, 0x00, 0x23]))).not.toBe(35);
  });

  it('returns NaN on a non-BCD nibble instead of a plausible wrong number', () => {
    expect(decodeBcdAsHexU32(new Uint8Array([0x00, 0x00, 0x00, 0xaf]))).toBeNaN();
    expect(decodeFrequencyHz(new Uint8Array([0xff, 0xff, 0xff, 0xff]))).toBeNaN();
  });

  it('decodes a 7-digit DMR ID', () => {
    expect(decodeBcdAsHexU32(new Uint8Array([0x02, 0x34, 0x56, 0x78]))).toBe(2345678);
  });
});

describe('frequency decoding', () => {
  it('treats the stored value as 10 Hz units', () => {
    // 146.520 MHz -> 146520000 Hz / 10 = 14652000 -> digits "14652000"
    const bytes = new Uint8Array([0x14, 0x65, 0x20, 0x00]);
    expect(decodeFrequencyHz(bytes)).toBe(146_520_000);
    expect(decodeFrequencyMHz(bytes)).toBeCloseTo(146.52, 6);
  });

  it('handles a UHF frequency', () => {
    // 439.000 MHz -> 43900000
    const bytes = new Uint8Array([0x04, 0x39, 0x00, 0x00]);
    expect(decodeFrequencyMHz(bytes)).toBeCloseTo(43.9, 6);
  });

  it('decodes zero as zero, which marks a vacant channel', () => {
    expect(decodeFrequencyHz(new Uint8Array([0, 0, 0, 0]))).toBe(0);
  });
});

describe('integer readers', () => {
  const b = new Uint8Array([0x34, 0x12, 0x78, 0x56]);
  it('reads little-endian u16', () => expect(readU16LE(b, 0)).toBe(0x1234));
  it('reads big-endian u16 (used only for the contact ref)', () =>
    expect(readU16BE(b, 0)).toBe(0x3412));
  it('reads little-endian u32 unsigned', () => {
    expect(readU32LE(new Uint8Array([0xff, 0xff, 0xff, 0xff]), 0)).toBe(0xffffffff);
  });
  it('reads past the end as zero rather than NaN', () => expect(readU16LE(b, 10)).toBe(0));
});

describe('membership arrays', () => {
  it('stops at the first sentinel — it terminates, it does not mark a hole', () => {
    // The reference claims 0xffff is a hole to skip. Hardware disagrees, and
    // following the doc was an actual shipped bug: trailing 0x0000 padding after
    // the 0xffff run decoded as dozens of "channel 1" entries.
    const bytes = new Uint8Array([0x00, 0x00, 0xff, 0xff, 0x05, 0x00]);
    expect(decodeU16Members(bytes, 3)).toEqual([0]);
  });

  it('does not read trailing zero padding as channel 1', () => {
    // The exact shape of a real scan list: members, 0xffff padding, then zeros.
    const bytes = new Uint8Array(40).fill(0);
    bytes.set([0x00, 0x00, 0x01, 0x00, 0x02, 0x00], 0); // channels 1,2,3
    bytes.set([0xff, 0xff], 6);                          // terminator
    expect(decodeU16Members(bytes, 20)).toEqual([0, 1, 2]);
  });

  it('honours an offset, for scan-list members at 0x30', () => {
    const bytes = new Uint8Array(0x34);
    bytes.set([0x07, 0x00], 0x30);
    bytes.fill(0xff, 0x32, 0x34);
    expect(decodeU16Members(bytes, 2, 0x30)).toEqual([7]);
  });

  it('skips 32-bit sentinels for receive groups', () => {
    const bytes = new Uint8Array([0x03, 0, 0, 0, 0xff, 0xff, 0xff, 0xff, 0x09, 0, 0, 0]);
    expect(decodeU32Members(bytes, 3)).toEqual([3, 9]);
  });

  it('returns empty for a fully vacant list', () => {
    expect(decodeU16Members(new Uint8Array(8).fill(0xff), 4)).toEqual([]);
  });
});

describe('priority channel encoding', () => {
  it('distinguishes Off, Current, and a specific channel', () => {
    expect(decodePriorityChannel(0xffff)).toBeUndefined(); // Off
    expect(decodePriorityChannel(0)).toBeNull(); // Current
    expect(decodePriorityChannel(5)).toBe(5); // specific
  });
});

describe('channel decoding', () => {
  /** Build a 128-byte channel record with the documented layout. */
  function makeChannel(opts: {
    rx?: number[];
    offsetOrTx?: number[];
    flags?: number;
    /** Byte 0x0a — the ENCODE tone index, which the radio TRANSMITS. */
    encTone?: number;
    /** Byte 0x0b — the DECODE tone index, which gates RECEIVE. */
    decTone?: number;
    /** Byte 0x09: bit 0 enables the RX tone, bit 1 the TX tone. */
    toneFlags?: number;
    colorCode?: number;
    contact?: number;
    scanList?: number;
    name?: string;
  } = {}): Uint8Array {
    const rec = new Uint8Array(0x80);
    rec.set(opts.rx ?? [0x14, 0x55, 0x00, 0x00], 0x00); // 145.500
    rec.set(opts.offsetOrTx ?? [0x00, 0x00, 0x00, 0x00], 0x04);
    rec[0x08] = opts.flags ?? 0;
    rec[0x09] = opts.toneFlags ?? 0;
    rec[0x0a] = opts.encTone ?? 51; // none
    rec[0x0b] = opts.decTone ?? 51;
    rec[0x13] = ((opts.contact ?? 0) >> 8) & 0xff; // big-endian
    rec[0x14] = (opts.contact ?? 0) & 0xff;
    rec[0x1b] = opts.scanList ?? 0xff;
    rec[0x1c] = 0xff;
    rec[0x20] = opts.colorCode ?? 0;
    const name = opts.name ?? '';
    for (let i = 0; i < name.length; i++) rec[0x44 + i * 2] = name.charCodeAt(i);
    return rec;
  }

  it('decodes frequency, name and colour code', () => {
    const { channel } = parseChannel(makeChannel({ name: 'TESTCH', colorCode: 7 }), 0);
    expect(channel.number).toBe(1);
    expect(channel.name).toBe('TESTCH');
    expect(channel.rxFrequency).toBeCloseTo(145.5, 6);
    expect(channel.colorCode).toBe(7);
  });

  it('unpacks duplex, bandwidth, power and mode from byte 0x08', () => {
    // duplex=0 (bits 6-7), bandwidth=1 (bits 4-5), power=2 (bits 2-3), type=1 (bits 0-1)
    const flags = (0 << 6) | (1 << 4) | (2 << 2) | 1;
    const { channel } = parseChannel(makeChannel({ flags }), 0);
    expect(channel.bandwidth).toBe('25kHz');
    expect(channel.power).toBe('High');
    expect(channel.mode).toBe('Digital');
  });

  it('applies a positive offset to derive TX', () => {
    // duplex=1 => TX = RX + offset. Offset 0.600 MHz -> 60000 * 10Hz.
    const flags = 1 << 6;
    const rec = makeChannel({ flags, offsetOrTx: [0x00, 0x06, 0x00, 0x00] });
    const { channel } = parseChannel(rec, 0);
    expect(channel.rxFrequency).toBeCloseTo(145.5, 6);
    expect(channel.txFrequency).toBeCloseTo(146.1, 6);
  });

  it('applies a negative offset', () => {
    const flags = 2 << 6;
    const rec = makeChannel({ flags, offsetOrTx: [0x00, 0x06, 0x00, 0x00] });
    expect(parseChannel(rec, 0).channel.txFrequency).toBeCloseTo(144.9, 6);
  });

  it('treats simplex with no offset as TX = RX', () => {
    expect(parseChannel(makeChannel(), 0).channel.txFrequency).toBeCloseTo(145.5, 6);
  });

  it('converts 0-based wire refs to NeonPlug 1-based, with none as 0', () => {
    const withRefs = parseChannel(makeChannel({ contact: 4, scanList: 2 }), 0).channel;
    expect(withRefs.contactId).toBe(5);
    expect(withRefs.scanListId).toBe(3);

    const noRefs = parseChannel(makeChannel({ scanList: 0xff }), 0).channel;
    expect(noRefs.scanListId).toBe(0);
  });

  it('fills DM-32-only fields from createDefaultChannel rather than inventing them', () => {
    // The shared Channel model carries DM-32 wire fields with no D890 meaning.
    // Using the same factory the UV5R-Mini uses keeps them consistent.
    const { channel } = parseChannel(makeChannel(), 0);
    expect(channel.unknown2A).toBe(0);
    expect(channel.rxSquelchMode).toBe('Carrier/CTC');
    expect(channel.signalingType).toBe('None');
  });

  describe('the CTCSS gap', () => {
    it('reports no unresolved tone when the channel genuinely has none', () => {
      const d = parseChannel(makeChannel({ rxTone: 51, txTone: 51 }), 0);
      expect(d.hasUnresolvedTone).toBe(false);
      expect(d.channel.rxCtcssDcs).toEqual({ type: 'None' });
    });

    it('ignores tone bytes when byte 0x09 says no tone is active', () => {
      // Confirmed on hardware 2026-08-25: every programmed channel carried a
      // leftover CTCSS index (0x15) and DCS value (0x13) while 0x09 was 0x00.
      // Reading those unconditionally flagged an unresolved tone on 100% of
      // channels, which would have made the flag worthless.
      const d = parseChannel(makeChannel({ encTone: 21, decTone: 21, toneFlags: 0x00 }), 0);
      expect(d.hasUnresolvedTone).toBe(false);
      expect(d.channel.rxCtcssDcs).toEqual({ type: 'None' });
      // The raw bytes are still reported, so nothing is lost.
      expect(d.rxToneIndex).toBe(21);
    });

    it('decodes a real CTCSS tone from the hardware-derived table', () => {
      // 0x01 = CTCSS RX active. Index 21 is 131.8 Hz, confirmed on a real radio.
      // 0x01 = CTCSS RX active, and RX reads the DECODE byte (0x0b).
      const d = parseChannel(makeChannel({ decTone: 21, toneFlags: 0x01 }), 0);
      expect(d.channel.rxCtcssDcs).toEqual({ type: 'CTCSS', value: 131.8 });
      expect(d.hasUnresolvedTone).toBe(false);
    });

    it('maps encode to TX and decode to RX, not the other way round', () => {
      // Real TX-only channel: programmed "decode Off, encode 88.5", it read back
      // 0x0a (encode) = 9 and 0x0b (decode) = 0, with flags 0x04 = CTCSS_TX.
      // A symmetric channel cannot detect a swap here, so this asymmetric case
      // is the only thing standing between us and silently reversed tones.
      const rec = makeChannel({ toneFlags: 0x04 });
      rec[0x0a] = 9;  // encode -> TX -> 88.5 Hz
      rec[0x0b] = 0;  // decode -> RX -> would be 62.5 Hz, but RX is disabled
      const d = parseChannel(rec, 0);
      expect(d.channel.txCtcssDcs).toEqual({ type: 'CTCSS', value: 88.5 });
      expect(d.channel.rxCtcssDcs).toEqual({ type: 'None' });
      expect(d.txToneIndex).toBe(9);
      expect(d.rxToneIndex).toBe(0);
    });

    it('decodes DCS, including polarity', () => {
      // Hardware: D023N stored 19, D023I stored 531 (19 | 0x200), D754N stored 492.
      const normal = makeChannel({ toneFlags: 0x02 });
      normal.set([19, 0], 0x0e); // decode -> RX
      expect(parseChannel(normal, 0).channel.rxCtcssDcs).toEqual({
        type: 'DCS', value: 23, polarity: 'N',
      });

      const inverted = makeChannel({ toneFlags: 0x02 });
      inverted.set([531 & 0xff, 531 >> 8], 0x0e);
      expect(parseChannel(inverted, 0).channel.rxCtcssDcs).toEqual({
        type: 'DCS', value: 23, polarity: 'P',
      });

      const high = makeChannel({ toneFlags: 0x02 });
      high.set([492 & 0xff, 492 >> 8], 0x0e);
      expect(parseChannel(high, 0).channel.rxCtcssDcs).toEqual({
        type: 'DCS', value: 754, polarity: 'N',
      });
    });

    it('no longer treats DCS as unresolvable — the encoding is known', () => {
      const rec = makeChannel({ toneFlags: 0x02 });
      rec.set([19, 0], 0x0e);
      expect(parseChannel(rec, 0).hasUnresolvedTone).toBe(false);
    });

    it('still flags an out-of-range CTCSS index', () => {
      // The table has 51 entries (0-50); anything above that is not nameable.
      const d = parseChannel(makeChannel({ decTone: 60, toneFlags: 0x01 }), 0);
      expect(d.hasUnresolvedTone).toBe(true);
    });
  });

  it('detects a vacant slot by zero RX frequency', () => {
    expect(isVacantChannel(new Uint8Array(0x80))).toBe(true);
    expect(isVacantChannel(makeChannel())).toBe(false);
  });
});

describe('channel read planning', () => {
  it('merges consecutive channels into one span', () => {
    const spans = planChannelReads([0, 1, 2, 3]);
    expect(spans).toHaveLength(1);
    expect(spans[0]).toMatchObject({
      address: 0x1000000,
      startIndex: 0,
      recordCount: 4,
      length: 4 * 0x80,
    });
  });

  it('splits on a gap rather than reading vacant records', () => {
    const spans = planChannelReads([0, 1, 5, 6]);
    expect(spans.map((s) => [s.startIndex, s.recordCount])).toEqual([
      [0, 2],
      [5, 2],
    ]);
  });

  it('never spans a block boundary', () => {
    // Channels 127 and 128 are adjacent by index but 0x7c000 apart in memory:
    // blocks are 0x80000 apart while holding only 0x4000 of records.
    const spans = planChannelReads([127, 128]);
    expect(spans).toHaveLength(2);
    expect(spans[0].address).toBe(0x1000000 + 127 * 0x80);
    expect(spans[1].address).toBe(0x1080000);
  });

  it('handles unsorted and empty input', () => {
    expect(planChannelReads([])).toEqual([]);
    expect(planChannelReads([3, 1, 2]).map((s) => [s.startIndex, s.recordCount])).toEqual([
      [1, 3],
    ]);
  });

  it('covers a full block in a single 0x4000 span', () => {
    const full = Array.from({ length: 128 }, (_, i) => i);
    const spans = planChannelReads(full);
    expect(spans).toHaveLength(1);
    expect(spans[0].length).toBe(0x4000);
  });

  it('cuts round trips substantially versus reading each channel', () => {
    // The point of the exercise. Old path: two 0x40 frames per channel.
    // New path: bytes chunked at the negotiated read size (240 max).
    const all = Array.from({ length: 4000 }, (_, i) => i);
    const spans = planChannelReads(all);
    const newFrames = spans.reduce((n, s) => n + Math.ceil(s.length / 0xf0), 0);
    const oldFrames = 4000 * 2;
    // One span per block: 4000 / 128 = 31.25, so 32 blocks with the last
    // holding only 32 channels.
    expect(spans).toHaveLength(Math.ceil(4000 / 128));
    expect(spans[spans.length - 1].recordCount).toBe(4000 - 31 * 128);
    expect(newFrames).toBeLessThan(oldFrames / 3);
  });

  it('reads only what is occupied on a sparsely programmed radio', () => {
    // A naive block-wide read would fetch 0x4000 for two channels.
    const spans = planChannelReads([0, 100]);
    const bytes = spans.reduce((n, s) => n + s.length, 0);
    expect(bytes).toBe(2 * 0x80);
  });
});

describe('record parsing', () => {
  function wideInto(target: Uint8Array, offset: number, s: string): void {
    for (let i = 0; i < s.length; i++) target[offset + i * 2] = s.charCodeAt(i);
  }

  it('parses a zone and converts members to 1-based channel numbers', () => {
    const name = new Uint8Array(0x20);
    wideInto(name, 0, 'LOCAL');
    const members = new Uint8Array(0x200).fill(0xff);
    members.set([0x00, 0x00], 0); // wire index 0 -> channel 1
    members.set([0x04, 0x00], 2); // wire index 4 -> channel 5
    const zone = parseZone(name, members, 0);
    expect(zone.name).toBe('LOCAL');
    expect(zone.channels).toEqual([1, 5]);
    expect(zone.id).toBeTruthy();
  });

  it('falls back to a positional name for an unnamed zone', () => {
    const zone = parseZone(new Uint8Array(0x20), new Uint8Array(0x200).fill(0xff), 3);
    expect(zone.name).toBe('Zone 4');
    expect(zone.channels).toEqual([]);
  });

  it('parses a talkgroup record', () => {
    const rec = new Uint8Array(0xc8);
    rec[0x00] = 1; // Group call
    rec.set([0x00, 0x02, 0x35, 0x59], 0x02); // 23559
    wideInto(rec, 0x06, 'UK CALLING');
    const tg = parseTalkgroup(rec, 0);
    expect(tg).toMatchObject({ id: 1, name: 'UK CALLING', dmrId: 23559, remark: 'Group' });
  });

  it('parses a scan list including its timers and members', () => {
    const rec = new Uint8Array(0x200);
    rec[0x01] = 3; // priority: both
    rec.set([0xff, 0xff], 0x02); // priority 1 off
    rec.set([0x00, 0x00], 0x04); // priority 2 = current
    rec.set([0x14, 0x00], 0x06); // look back A = 2.0s
    rec.set([0x32, 0x00], 0x0c); // dwell = 5.0s
    wideInto(rec, 0x0e, 'ALL');
    rec.fill(0xff, 0x30, 0x94);
    rec.set([0x00, 0x00], 0x30); // member -> channel 1
    rec.set([0x02, 0x00], 0x32); // member -> channel 3
    rec[0x94] = 2; // revert channel — immediately after the 50-slot member array
    rec[0x97] = 5; // analog hold

    const sl = parseScanList(rec, 0);
    expect(sl.name).toBe('ALL');
    expect(sl.channels).toEqual([1, 3]);
    expect(sl.prioritySelect).toBe(3);
    expect(decodePriorityChannel(sl.priorityChannel1Raw)).toBeUndefined();
    expect(decodePriorityChannel(sl.priorityChannel2Raw)).toBeNull();
    expect(sl.lookBackTimeA).toBe(20); // deciseconds
    expect(sl.dwellTime).toBe(50);
    expect(sl.revertChannel).toBe(2);
    expect(sl.analogHold).toBe(5);
  });
});

describe('talkgroup banking', () => {
  it('matches flat addressing inside the first bank', () => {
    for (const i of [0, 1, 200, 1249]) {
      expect(talkgroupAddress(i)).toBe(D890_ADDR.TALKGROUP_DATA + i * D890_ADDR.TALKGROUP_STRIDE);
    }
  });

  it('starts a new bank rather than running past the bank stride', () => {
    // Flat addressing would put index 1250 at 0x3a3d090, inside bank 0. The
    // vendor CPS puts it at the base of bank 1.
    expect(talkgroupAddress(D890_TALKGROUPS_PER_BANK)).toBe(
      D890_ADDR.TALKGROUP_DATA + D890_ADDR.TALKGROUP_BANK_STRIDE,
    );
    expect(talkgroupAddress(D890_TALKGROUPS_PER_BANK)).not.toBe(
      D890_ADDR.TALKGROUP_DATA + D890_TALKGROUPS_PER_BANK * D890_ADDR.TALKGROUP_STRIDE,
    );
  });

  it('never places a record across a bank boundary', () => {
    for (let i = 0; i < 10000; i += 1) {
      const off = talkgroupAddress(i) - D890_ADDR.TALKGROUP_DATA;
      const within = off % D890_ADDR.TALKGROUP_BANK_STRIDE;
      expect(within + D890_ADDR.TALKGROUP_STRIDE).toBeLessThanOrEqual(
        D890_ADDR.TALKGROUP_BANK_STRIDE,
      );
    }
  });
});

describe('wide-string termination', () => {
  const w = (...codes: number[]) => {
    const b = new Uint8Array(codes.length * 2);
    codes.forEach((c, i) => { b[i * 2] = c & 0xff; b[i * 2 + 1] = c >> 8; });
    return b;
  };

  it('stops at the radio 0xFFFF terminator, not just NUL', () => {
    // The radio pads names with 0xFF. Stopping only on NUL appends U+FFFF
    // characters that render as replacement glyphs.
    expect(decodeWideCharString(w(0x41, 0x42, 0xffff, 0xffff, 0xffff))).toBe('AB');
  });

  it('still stops at NUL', () => {
    expect(decodeWideCharString(w(0x41, 0x42, 0x0000, 0x43))).toBe('AB');
  });

  it('returns the whole field when it is full with no terminator', () => {
    const full = Array.from({ length: 16 }, (_, i) => 0x41 + i);
    expect(decodeWideCharString(w(...full), 16)).toHaveLength(16);
  });
});
