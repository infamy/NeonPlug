import { describe, it, expect } from 'vitest';
import {
  isValidMMDVMFrequency,
  generateMMDVMChannels,
  MMDVM_FREQ_MIN_MHZ,
  MMDVM_FREQ_MAX_MHZ,
  type MMDVMChannelEntry,
} from '../../src/services/mmdvmChannels';

const entries: MMDVMChannelEntry[] = [
  { channelName: 'Local', talkGroupName: 'Local', talkGroupId: 9 },
  { channelName: 'Canada', talkGroupName: 'Canada', talkGroupId: 302 },
];

const baseOptions = {
  frequencyMhz: 433.0,
  entries,
  firstChannelNumber: 1,
  firstContactId: 1,
  dmrRadioIdIndex: undefined,
};

describe('isValidMMDVMFrequency', () => {
  it('accepts frequencies within range', () => {
    expect(isValidMMDVMFrequency(MMDVM_FREQ_MIN_MHZ)).toBe(true);
    expect(isValidMMDVMFrequency(MMDVM_FREQ_MAX_MHZ)).toBe(true);
    expect(isValidMMDVMFrequency(433.0)).toBe(true);
  });

  it('rejects frequencies outside range', () => {
    expect(isValidMMDVMFrequency(MMDVM_FREQ_MIN_MHZ - 1)).toBe(false);
    expect(isValidMMDVMFrequency(MMDVM_FREQ_MAX_MHZ + 1)).toBe(false);
  });

  it('rejects NaN', () => {
    expect(isValidMMDVMFrequency(NaN)).toBe(false);
  });
});

describe('generateMMDVMChannels', () => {
  it('creates one channel and one contact per entry', () => {
    const result = generateMMDVMChannels(baseOptions);
    expect(result.channels).toHaveLength(entries.length);
    expect(result.contacts).toHaveLength(entries.length);
  });

  it('assigns sequential channel numbers starting from firstChannelNumber', () => {
    const result = generateMMDVMChannels({ ...baseOptions, firstChannelNumber: 50 });
    expect(result.channels[0].number).toBe(50);
    expect(result.channels[1].number).toBe(51);
  });

  it('assigns sequential contact IDs starting from firstContactId', () => {
    const result = generateMMDVMChannels({ ...baseOptions, firstContactId: 100 });
    expect(result.contacts[0].id).toBe(100);
    expect(result.contacts[1].id).toBe(101);
  });

  it('links each channel to its contact', () => {
    const result = generateMMDVMChannels(baseOptions);
    result.channels.forEach((ch, i) => {
      expect(ch.contactId).toBe(result.contacts[i].id);
    });
  });

  it('creates a single zone containing all channel numbers', () => {
    const result = generateMMDVMChannels(baseOptions);
    expect(result.zone).toBeDefined();
    expect(result.zone.channels).toHaveLength(entries.length);
    result.channels.forEach(ch => {
      expect(result.zone.channels).toContain(ch.number);
    });
  });

  it('uses provided zone name', () => {
    const result = generateMMDVMChannels({ ...baseOptions, zoneName: 'MyHotspot' });
    expect(result.zone.name).toBe('MyHotspot');
  });

  it('defaults zone name to MMDVM when not provided', () => {
    const result = generateMMDVMChannels(baseOptions);
    expect(result.zone.name).toBe('MMDVM');
  });

  it('truncates zone name to 16 characters', () => {
    const result = generateMMDVMChannels({ ...baseOptions, zoneName: 'A'.repeat(30) });
    expect(result.zone.name.length).toBeLessThanOrEqual(16);
  });

  it('truncates channel names to 16 characters', () => {
    const longEntries: MMDVMChannelEntry[] = [
      { channelName: 'A'.repeat(30), talkGroupName: 'TG', talkGroupId: 1 },
    ];
    const result = generateMMDVMChannels({ ...baseOptions, entries: longEntries });
    expect(result.channels[0].name.length).toBeLessThanOrEqual(16);
  });

  it('uses rx=tx (simplex) frequency', () => {
    const result = generateMMDVMChannels({ ...baseOptions, frequencyMhz: 433.5 });
    result.channels.forEach(ch => {
      expect(ch.rxFrequency).toBe(433.5);
      expect(ch.txFrequency).toBe(433.5);
    });
  });

  it('throws on invalid frequency', () => {
    expect(() => generateMMDVMChannels({ ...baseOptions, frequencyMhz: 100 })).toThrow();
  });

  it('throws when entries is empty', () => {
    expect(() => generateMMDVMChannels({ ...baseOptions, entries: [] })).toThrow();
  });

  it('stores dmrRadioIdIndex on each channel when provided', () => {
    const result = generateMMDVMChannels({ ...baseOptions, dmrRadioIdIndex: 2 });
    result.channels.forEach(ch => {
      expect(ch.dmrRadioIdIndex).toBe(2);
    });
  });
});
