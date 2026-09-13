import { describe, it, expect } from 'vitest';
import {
  DEFAULT_POWER_LEVELS,
  powerLevelsFor,
  powerAbbrev,
  nextPowerLevel,
  clampPowerLevel,
} from '../../src/utils/powerLevels';
import type { RadioCapabilities } from '../../src/types/radioCapabilities';

const FOUR = { powerLevels: ['Low', 'Medium', 'High', 'Turbo'] } as unknown as RadioCapabilities;
const THREE = {} as RadioCapabilities;

describe('powerLevelsFor', () => {
  it('falls back to three levels when a radio declares none', () => {
    expect(powerLevelsFor(THREE)).toEqual(DEFAULT_POWER_LEVELS);
    expect(powerLevelsFor(null)).toEqual(DEFAULT_POWER_LEVELS);
    expect(powerLevelsFor(undefined)).toEqual(DEFAULT_POWER_LEVELS);
  });

  it('uses the declared levels when present', () => {
    expect(powerLevelsFor(FOUR)).toEqual(['Low', 'Medium', 'High', 'Turbo']);
  });
});

describe('powerAbbrev', () => {
  it('gives every level a distinct letter', () => {
    const letters = ['Low', 'Medium', 'High', 'Turbo'].map(powerAbbrev);
    expect(letters).toEqual(['L', 'M', 'H', 'T']);
    expect(new Set(letters).size).toBe(4);
  });
});

describe('nextPowerLevel', () => {
  it('cycles through every declared level', () => {
    const l = powerLevelsFor(FOUR);
    expect(nextPowerLevel('Low', l)).toBe('Medium');
    expect(nextPowerLevel('High', l)).toBe('Turbo');
    expect(nextPowerLevel('Turbo', l)).toBe('Low');
  });

  it('does not skip Turbo on a four-level radio', () => {
    // The original bug: a hardcoded three-entry list made indexOf('Turbo') -1,
    // so one click on a Turbo channel wrapped straight to Low.
    const l = powerLevelsFor(FOUR);
    const seen = new Set<string>();
    let p = 'Low';
    for (let i = 0; i < 4; i += 1) { seen.add(p); p = nextPowerLevel(p, l); }
    expect(seen).toEqual(new Set(['Low', 'Medium', 'High', 'Turbo']));
    expect(p).toBe('Low');
  });
});

describe('clampPowerLevel', () => {
  it('leaves a supported level alone', () => {
    expect(clampPowerLevel('High', powerLevelsFor(THREE))).toBeNull();
    expect(clampPowerLevel('Turbo', powerLevelsFor(FOUR))).toBeNull();
  });

  it('steps Turbo down to High on a three-level radio', () => {
    expect(clampPowerLevel('Turbo', powerLevelsFor(THREE))).toBe('High');
  });

  it('never upgrades a channel', () => {
    // A radio missing a middle level must not promote Low to something stronger.
    const oddball = ['Low', 'Turbo'] as const;
    expect(clampPowerLevel('Medium', oddball)).toBe('Low');
    expect(clampPowerLevel('High', oddball)).toBe('Low');
  });

  it('falls back to the weakest level for an unrecognised value', () => {
    // Safer to transmit low than to guess high on a value we cannot rank.
    expect(clampPowerLevel('Nonsense', powerLevelsFor(THREE))).toBe('Low');
  });
});
