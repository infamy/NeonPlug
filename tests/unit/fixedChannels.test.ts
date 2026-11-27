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
  // The voice-only CHIRP list from Australian testers (#209, 2026-11-25), which
  // the preset matches channel for channel.
  const au = () => getChannelsForSet('Marine AU');
  const ch = (n: string) => au().find((c) => c.name === `MVHF ${n}`);

  it('has the 46 channels of the list', () => {
    expect(au()).toHaveLength(46);
  });

  it('puts the repeaters on the ship side: listen on the coast frequency, transmit 4.6 MHz below', () => {
    for (const [n, ship, coast] of [
      ['80', 157.025, 161.625],
      ['21', 157.05, 161.65],
      ['81', 157.075, 161.675],
      ['22', 157.1, 161.7],
      ['82', 157.125, 161.725],
      ['19', 156.95, 161.55],
    ] as const) {
      const c = ch(n);
      expect(c, n).toBeDefined();
      expect(c!.rxFrequency).toBeCloseTo(coast, 4);
      expect(c!.txFrequency).toBeCloseTo(ship, 4);
    }
  });

  it('keeps 16, 69, 87 and 88 simplex', () => {
    for (const [n, f] of [['16', 156.8], ['69', 156.475], ['87', 157.375], ['88', 157.425]] as const) {
      const c = ch(n);
      expect(c, n).toBeDefined();
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
