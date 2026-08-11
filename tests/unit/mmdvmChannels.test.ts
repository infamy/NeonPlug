import { describe, it, expect } from 'vitest';
import {
  isValidMMDVMFrequency,
  isValidMMDVMDuplexFrequency,
  generateMMDVMChannels,
  MMDVM_FREQ_MIN_MHZ,
  MMDVM_FREQ_MAX_MHZ,
  MMDVM_DUPLEX_VHF_MIN_MHZ,
  MMDVM_DUPLEX_VHF_MAX_MHZ,
  MMDVM_DUPLEX_UHF_MIN_MHZ,
  MMDVM_DUPLEX_UHF_MAX_MHZ,
  type MMDVMChannelEntry,
} from '../../src/services/mmdvmChannels';

const entries: MMDVMChannelEntry[] = [
  { channelName: 'Local', contactId: 1 },
  { channelName: 'Canada', contactId: 2 },
];

const baseOptions = {
  frequencyMhz: 433.0,
  entries,
  firstChannelNumber: 1,
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

describe('isValidMMDVMDuplexFrequency', () => {
  it('accepts frequencies in the 2m (VHF) range', () => {
    expect(isValidMMDVMDuplexFrequency(MMDVM_DUPLEX_VHF_MIN_MHZ)).toBe(true);
    expect(isValidMMDVMDuplexFrequency(MMDVM_DUPLEX_VHF_MAX_MHZ)).toBe(true);
    expect(isValidMMDVMDuplexFrequency(146.52)).toBe(true);
  });

  it('accepts frequencies in the 70cm (UHF) range', () => {
    expect(isValidMMDVMDuplexFrequency(MMDVM_DUPLEX_UHF_MIN_MHZ)).toBe(true);
    expect(isValidMMDVMDuplexFrequency(MMDVM_DUPLEX_UHF_MAX_MHZ)).toBe(true);
    expect(isValidMMDVMDuplexFrequency(440.0)).toBe(true);
  });

  it('rejects frequencies in the gap between VHF and UHF', () => {
    expect(isValidMMDVMDuplexFrequency(200.0)).toBe(false);
  });

  it('rejects frequencies outside both ranges', () => {
    expect(isValidMMDVMDuplexFrequency(MMDVM_DUPLEX_VHF_MIN_MHZ - 1)).toBe(false);
    expect(isValidMMDVMDuplexFrequency(MMDVM_DUPLEX_UHF_MAX_MHZ + 1)).toBe(false);
  });

  it('rejects NaN', () => {
    expect(isValidMMDVMDuplexFrequency(NaN)).toBe(false);
  });
});

describe('generateMMDVMChannels', () => {
  it('creates one channel per entry', () => {
    const result = generateMMDVMChannels(baseOptions);
    expect(result.channels).toHaveLength(entries.length);
  });

  it('assigns sequential channel numbers starting from firstChannelNumber', () => {
    const result = generateMMDVMChannels({ ...baseOptions, firstChannelNumber: 50 });
    expect(result.channels[0].number).toBe(50);
    expect(result.channels[1].number).toBe(51);
  });

  it("links each channel to its entry's contactId directly (contact resolution is the caller's job)", () => {
    const result = generateMMDVMChannels(baseOptions);
    result.channels.forEach((ch, i) => {
      expect(ch.contactId).toBe(entries[i].contactId);
    });
  });

  it('truncates channel names to 16 characters', () => {
    const longEntries: MMDVMChannelEntry[] = [
      { channelName: 'A'.repeat(30), contactId: 1 },
    ];
    const result = generateMMDVMChannels({ ...baseOptions, entries: longEntries });
    expect(result.channels[0].name.length).toBeLessThanOrEqual(16);
  });

  it('defaults an empty channel name to "MMDVM N"', () => {
    const blankEntries: MMDVMChannelEntry[] = [{ channelName: '', contactId: 1 }];
    const result = generateMMDVMChannels({ ...baseOptions, entries: blankEntries });
    expect(result.channels[0].name).toBe('MMDVM 1');
  });

  it('uses rx=tx (simplex) frequency when no TX frequency is given', () => {
    const result = generateMMDVMChannels({ ...baseOptions, frequencyMhz: 433.5 });
    result.channels.forEach(ch => {
      expect(ch.rxFrequency).toBe(433.5);
      expect(ch.txFrequency).toBe(433.5);
    });
  });

  it('treats an explicit txFrequencyMhz equal to frequencyMhz as simplex, not duplex', () => {
    // isDuplex requires txFrequencyMhz to differ from frequencyMhz — an equal value should
    // still validate against the narrow 431-435 MHz simplex range, not the wider duplex bands.
    expect(() => generateMMDVMChannels({
      ...baseOptions,
      frequencyMhz: 146.52,
      txFrequencyMhz: 146.52,
    })).toThrow();
  });

  it('throws on invalid simplex frequency', () => {
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

  it('defaults color code to 1 when not provided', () => {
    const result = generateMMDVMChannels(baseOptions);
    result.channels.forEach(ch => {
      expect(ch.colorCode).toBe(1);
    });
  });

  it('uses the provided color code', () => {
    const result = generateMMDVMChannels({ ...baseOptions, colorCode: 5 });
    result.channels.forEach(ch => {
      expect(ch.colorCode).toBe(5);
    });
  });

  describe('duplex', () => {
    it('uses separate RX and TX frequencies when txFrequencyMhz differs from frequencyMhz', () => {
      const result = generateMMDVMChannels({
        ...baseOptions,
        frequencyMhz: 146.52,
        txFrequencyMhz: 146.94,
      });
      result.channels.forEach(ch => {
        expect(ch.rxFrequency).toBe(146.52);
        expect(ch.txFrequency).toBe(146.94);
      });
    });

    it('accepts VHF duplex frequencies outside the simplex calling range', () => {
      expect(() => generateMMDVMChannels({
        ...baseOptions,
        frequencyMhz: 146.52,
        txFrequencyMhz: 146.94,
      })).not.toThrow();
    });

    it('accepts UHF duplex frequencies outside the simplex calling range', () => {
      expect(() => generateMMDVMChannels({
        ...baseOptions,
        frequencyMhz: 440.0,
        txFrequencyMhz: 445.0,
      })).not.toThrow();
    });

    it('throws when the RX frequency is outside both duplex ranges', () => {
      expect(() => generateMMDVMChannels({
        ...baseOptions,
        frequencyMhz: 200.0,
        txFrequencyMhz: 440.0,
      })).toThrow();
    });

    it('throws when the TX frequency is outside both duplex ranges', () => {
      expect(() => generateMMDVMChannels({
        ...baseOptions,
        frequencyMhz: 146.52,
        txFrequencyMhz: 200.0,
      })).toThrow();
    });
  });

  describe('timeslot', () => {
    // Storage encoding: slotOperation 0 = TS1, 1 = TS2. When no timeslot is specified
    // anywhere, the current implementation's default resolves to TS2 (1) — asserting the
    // actual behavior here, not a claim that TS2-by-default is necessarily the ideal choice.
    it('defaults slotOperation to TS2 (1) when no timeslot is given at all', () => {
      const result = generateMMDVMChannels(baseOptions);
      result.channels.forEach(ch => {
        expect(ch.slotOperation).toBe(1);
      });
    });

    it('applies the top-level timeslot as the default for entries without their own', () => {
      const result = generateMMDVMChannels({ ...baseOptions, timeslot: 1 });
      result.channels.forEach(ch => {
        expect(ch.slotOperation).toBe(0); // TS1 -> 0
      });
    });

    it('lets a per-entry timeslot override the top-level default', () => {
      const mixedEntries: MMDVMChannelEntry[] = [
        { channelName: 'TS1 entry', contactId: 1, timeslot: 1 },
        { channelName: 'TS2 entry', contactId: 2, timeslot: 2 },
      ];
      const result = generateMMDVMChannels({ ...baseOptions, entries: mixedEntries, timeslot: 2 });
      expect(result.channels[0].slotOperation).toBe(0); // per-entry TS1 overrides top-level TS2
      expect(result.channels[1].slotOperation).toBe(1); // TS2 -> 1
    });
  });
});
