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
