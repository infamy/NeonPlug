import { describe, it, expect } from 'vitest';
import {
  getFRSChannels,
  getGMRSChannels,
  getMURSChannels,
  getHamCallingFrequencies,
  getChannelsForSet,
  getAvailableFixedChannelSets,
} from '../../src/services/fixedChannels';

describe('getFRSChannels', () => {
  it('returns 22 FRS channels', () => {
    expect(getFRSChannels()).toHaveLength(22);
  });

  it('respects custom start number', () => {
    const channels = getFRSChannels(10);
    expect(channels[0].number).toBe(10);
    expect(channels[21].number).toBe(31);
  });

  it('all channels have valid frequencies above 460 MHz', () => {
    getFRSChannels().forEach(ch => {
      expect(ch.rxFrequency).toBeGreaterThan(460);
    });
  });

  it('all channel names are 16 chars or fewer', () => {
    getFRSChannels().forEach(ch => {
      expect(ch.name.length).toBeLessThanOrEqual(16);
    });
  });
});

describe('getMURSChannels', () => {
  it('returns 5 MURS channels', () => {
    expect(getMURSChannels()).toHaveLength(5);
  });

  it('respects custom start number', () => {
    const channels = getMURSChannels(20);
    expect(channels[0].number).toBe(20);
  });
});

describe('getGMRSChannels', () => {
  it('returns channels', () => {
    expect(getGMRSChannels().length).toBeGreaterThan(0);
  });

  it('respects custom start number', () => {
    const channels = getGMRSChannels(5);
    expect(channels[0].number).toBe(5);
  });
});

describe('getHamCallingFrequencies', () => {
  it('returns channels', () => {
    expect(getHamCallingFrequencies().length).toBeGreaterThan(0);
  });

  it('respects custom start number', () => {
    const channels = getHamCallingFrequencies(100);
    expect(channels[0].number).toBe(100);
  });
});

describe('getChannelsForSet', () => {
  it('returns channels for FRS set', () => {
    expect(getChannelsForSet('FRS')).toHaveLength(22);
  });

  it('returns empty array for unknown set', () => {
    expect(getChannelsForSet('NONEXISTENT')).toHaveLength(0);
  });

  it('respects start channel number', () => {
    const channels = getChannelsForSet('MURS', 50);
    expect(channels[0].number).toBe(50);
  });
});

describe('getAvailableFixedChannelSets', () => {
  it('returns at least FRS, GMRS, and MURS', () => {
    const sets = getAvailableFixedChannelSets();
    const names = sets.map(s => s.name);
    expect(names).toContain('FRS');
    expect(names).toContain('GMRS');
    expect(names).toContain('MURS');
  });

  it('every set has a non-empty description', () => {
    getAvailableFixedChannelSets().forEach(s => {
      expect(s.description.length).toBeGreaterThan(0);
    });
  });
});

describe('Marine (Australia)', () => {
  // From ACMA's "VHF maritime mobile band – Channel allocations" (read
  // 2026-10-29), which the issue's CHIRP file (#209) was checked against.
  const au = () => getChannelsForSet('Marine AU');
  const byName = (prefix: string) => au().find((c) => c.name === prefix || c.name.startsWith(`${prefix} `));

  it('has the 47 voice channels of the ACMA plan', () => {
    expect(au()).toHaveLength(47);
  });

  it('puts the repeaters on the ship side: listen on the coast frequency, transmit 4.6 MHz below', () => {
    for (const [ch, ship, coast] of [
      ['M80', 157.025, 161.625],
      ['M21', 157.05, 161.65],
      ['M81', 157.075, 161.675],
      ['M22', 157.1, 161.7],
      ['M82', 157.125, 161.725],
    ] as const) {
      const c = byName(ch);
      expect(c, ch).toBeDefined();
      expect(c!.rxFrequency).toBeCloseTo(coast, 4);
      expect(c!.txFrequency).toBeCloseTo(ship, 4);
    }
  });

  it('keeps 16 and the simplex split channels simplex', () => {
    for (const [ch, f] of [['M16', 156.8], ['M1019', 156.95], ['M1027', 157.35], ['M1028', 157.4], ['M87', 157.375], ['M88', 157.425]] as const) {
      const c = byName(ch);
      expect(c, ch).toBeDefined();
      expect(c!.rxFrequency).toBeCloseTo(f, 4);
      expect(c!.txFrequency).toBeCloseTo(f, 4);
    }
  });

  it('leaves out DSC, AIS, ASM and VDES, which carry data, not voice', () => {
    const data = [156.525, 161.975, 162.025, 161.95, 162.0, 157.2, 157.225, 157.25, 157.275, 157.3, 157.325];
    for (const c of au()) {
      for (const f of data) {
        expect(Math.abs(c.txFrequency - f), `${c.name} transmits on ${f}`).toBeGreaterThan(1e-6);
      }
    }
  });

  it('keeps every duplex pair 4.6 MHz apart and every name 16 characters or fewer', () => {
    for (const c of au()) {
      const split = Math.round((c.rxFrequency - c.txFrequency) * 1000) / 1000;
      expect([0, 4.6], c.name).toContain(split);
      expect(c.name.length).toBeLessThanOrEqual(16);
    }
  });

  it('tells the two marine presets apart in the picker', () => {
    const sets = getAvailableFixedChannelSets();
    expect(sets.find((s) => s.name === 'Marine')?.displayName).toBe('Marine (US/Canada)');
    expect(sets.find((s) => s.name === 'Marine AU')?.displayName).toBe('Marine (Australia)');
  });
});
