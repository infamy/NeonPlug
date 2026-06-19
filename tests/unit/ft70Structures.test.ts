import { describe, it, expect } from 'vitest';
import {
  decodeBCDkHz, encodeBCDkHz, computeChecksum, applyChecksum,
  parseChannel, encodeChannel, parseAllChannels, clearChannelRegions,
} from '../../src/radios/ft70/structures';
import { FT70_MEM_SIZE, FT70_ADDR_CHECKSUM, FT70_ADDR_FLAGS, FT70_ADDR_CHANNELS } from '../../src/radios/ft70/constants';
import { createDefaultChannel } from '../../src/utils/channelHelpers';

function makeImage(): Uint8Array {
  return new Uint8Array(FT70_MEM_SIZE);
}

describe('BCD kHz codec', () => {
  it('round-trips a typical VHF frequency', () => {
    const buf = new Uint8Array(3);
    encodeBCDkHz(146520, buf);
    expect(decodeBCDkHz(buf)).toBe(146520);
    expect([...buf]).toEqual([0x14, 0x65, 0x20]);
  });

  it('round-trips a UHF frequency', () => {
    const buf = new Uint8Array(3);
    encodeBCDkHz(438650, buf);
    expect(decodeBCDkHz(buf)).toBe(438650);
  });

  it('round-trips zero', () => {
    const buf = new Uint8Array(3);
    encodeBCDkHz(0, buf);
    expect(decodeBCDkHz(buf)).toBe(0);
  });
});

describe('checksum', () => {
  it('computes sum of bytes [0, 0xFEC9] mod 256', () => {
    const img = makeImage();
    img[0] = 0x10;
    img[1] = 0x20;
    img[0xfec9] = 0x05;
    img[0xfeca] = 0xff; // outside sum range, must not affect checksum
    expect(computeChecksum(img)).toBe(0x35);
  });

  it('applyChecksum writes the computed value at 0xFECA', () => {
    const img = makeImage();
    img[5] = 7;
    applyChecksum(img);
    expect(img[FT70_ADDR_CHECKSUM]).toBe(computeChecksum(img));
  });
});

describe('parseChannel', () => {
  it('returns null for an unprogrammed (invalid) slot', () => {
    const img = makeImage();
    expect(parseChannel(img, 0)).toBeNull();
  });

  it('returns null when used bit is clear even if valid', () => {
    const img = makeImage();
    img[FT70_ADDR_FLAGS] = 0x01; // valid=1, used=0
    expect(parseChannel(img, 0)).toBeNull();
  });
});

describe('encodeChannel / parseChannel round trip', () => {
  it('round-trips a simplex channel', () => {
    const img = makeImage();
    const ch = createDefaultChannel({
      number: 1,
      name: 'SIMPLEX',
      rxFrequency: 146.52,
      txFrequency: 146.52,
      bandwidth: '25kHz',
      power: 'High',
    });
    encodeChannel(img, ch);
    const parsed = parseChannel(img, 0)!;
    expect(parsed).not.toBeNull();
    expect(parsed.name).toBe('SIMPLE'); // 6-char label
    expect(parsed.rxFrequency).toBeCloseTo(146.52, 3);
    expect(parsed.txFrequency).toBeCloseTo(146.52, 3);
    expect(parsed.power).toBe('High');
    expect(parsed.bandwidth).toBe('25kHz');
  });

  it('round-trips a positive-shift repeater channel', () => {
    const img = makeImage();
    const ch = createDefaultChannel({
      number: 5,
      name: 'RPTR',
      rxFrequency: 146.94,
      txFrequency: 146.34,
      bandwidth: '12.5kHz',
      power: 'Low',
    });
    encodeChannel(img, ch);
    const parsed = parseChannel(img, 4)!;
    expect(parsed.rxFrequency).toBeCloseTo(146.94, 3);
    expect(parsed.txFrequency).toBeCloseTo(146.34, 3);
    expect(parsed.power).toBe('Low');
    expect(parsed.bandwidth).toBe('12.5kHz');
  });

  it('round-trips CTCSS TSQL tone (same tx/rx)', () => {
    const img = makeImage();
    const ch = createDefaultChannel({
      number: 1,
      rxFrequency: 146.52,
      txFrequency: 146.52,
      rxCtcssDcs: { type: 'CTCSS', value: 100.0 },
      txCtcssDcs: { type: 'CTCSS', value: 100.0 },
    });
    encodeChannel(img, ch);
    const parsed = parseChannel(img, 0)!;
    expect(parsed.txCtcssDcs).toEqual({ type: 'CTCSS', value: 100.0 });
    expect(parsed.rxCtcssDcs).toEqual({ type: 'CTCSS', value: 100.0 });
  });

  it('round-trips TX-only CTCSS tone', () => {
    const img = makeImage();
    const ch = createDefaultChannel({
      number: 1,
      rxFrequency: 146.52,
      txFrequency: 146.52,
      rxCtcssDcs: { type: 'None' },
      txCtcssDcs: { type: 'CTCSS', value: 88.5 },
    });
    encodeChannel(img, ch);
    const parsed = parseChannel(img, 0)!;
    expect(parsed.txCtcssDcs).toEqual({ type: 'CTCSS', value: 88.5 });
    expect(parsed.rxCtcssDcs).toEqual({ type: 'None' });
  });

  it('round-trips DCS code (shared tx/rx)', () => {
    const img = makeImage();
    const ch = createDefaultChannel({
      number: 1,
      rxFrequency: 146.52,
      txFrequency: 146.52,
      rxCtcssDcs: { type: 'DCS', value: 23, polarity: 'N' },
      txCtcssDcs: { type: 'DCS', value: 23, polarity: 'N' },
    });
    encodeChannel(img, ch);
    const parsed = parseChannel(img, 0)!;
    expect(parsed.txCtcssDcs).toEqual({ type: 'DCS', value: 23, polarity: 'N' });
    expect(parsed.rxCtcssDcs).toEqual({ type: 'DCS', value: 23, polarity: 'N' });
  });

  it('marks scan-skipped channels via scanAdd', () => {
    const img = makeImage();
    const ch = createDefaultChannel({ number: 1, rxFrequency: 146.52, txFrequency: 146.52, scanAdd: false });
    encodeChannel(img, ch);
    expect(parseChannel(img, 0)!.scanAdd).toBe(false);
  });
});

describe('parseAllChannels / clearChannelRegions', () => {
  it('parses multiple programmed channels and skips empty slots', () => {
    const img = makeImage();
    encodeChannel(img, createDefaultChannel({ number: 1, rxFrequency: 146.52, txFrequency: 146.52 }));
    encodeChannel(img, createDefaultChannel({ number: 3, rxFrequency: 446.0, txFrequency: 446.0 }));
    const channels = parseAllChannels(img);
    expect(channels.map((c) => c.number)).toEqual([1, 3]);
  });

  it('clearChannelRegions wipes flags and channel data', () => {
    const img = makeImage();
    encodeChannel(img, createDefaultChannel({ number: 1, rxFrequency: 146.52, txFrequency: 146.52 }));
    expect(parseAllChannels(img)).toHaveLength(1);
    clearChannelRegions(img);
    expect(parseAllChannels(img)).toHaveLength(0);
    expect(img[FT70_ADDR_FLAGS]).toBe(0);
    expect(img[FT70_ADDR_CHANNELS]).toBe(0);
  });
});
