import { describe, it, expect } from 'vitest';
import { getCapabilitiesForModel } from '../../src/radios/capabilities';

/**
 * Per-radio limits must come from capabilities, never hardcoded in a store or
 * component. Several were hardcoded to the DM-32's values and silently truncated
 * the D890UV: scan lists at 15 channels (it holds 50) and zones at 64 (it holds
 * 160). A user hit the scan-list one — the editor showed "15 channels maximum"
 * for a radio that supports 50.
 */
const CASES = [
  { model: 'DM-32UV', maxZoneChannels: 64,  maxScanListChannels: 15, maxScanLists: 32,  maxRxGroupMembers: 32 },
  { model: 'DA-7X2',  maxZoneChannels: 160, maxScanListChannels: 50, maxScanLists: 100, maxRxGroupMembers: 64 },
];

describe('per-radio limits are exposed as capabilities', () => {
  for (const c of CASES) {
    describe(c.model, () => {
      const caps = getCapabilitiesForModel(c.model);
      it('resolves capabilities at all', () => expect(caps).toBeTruthy());
      it(`caps zone channels at ${c.maxZoneChannels}`, () =>
        expect(caps?.maxZoneChannels).toBe(c.maxZoneChannels));
      it(`caps scan-list channels at ${c.maxScanListChannels}`, () =>
        expect(caps?.maxScanListChannels).toBe(c.maxScanListChannels));
      it(`caps scan-list count at ${c.maxScanLists}`, () =>
        expect(caps?.maxScanLists).toBe(c.maxScanLists));
      it(`caps RX-group members at ${c.maxRxGroupMembers}`, () =>
        expect(caps?.maxRxGroupMembers).toBe(c.maxRxGroupMembers));
    });
  }

  it('the two radios genuinely differ, so a hardcoded value cannot serve both', () => {
    const dm32 = getCapabilitiesForModel('DM-32UV');
    const d890 = getCapabilitiesForModel('DA-7X2');
    expect(dm32?.maxZoneChannels).not.toBe(d890?.maxZoneChannels);
    expect(dm32?.maxScanListChannels).not.toBe(d890?.maxScanListChannels);
  });
});

describe('firmware warning is per-radio, not hardcoded', () => {
  // The status bar hardcoded the DM-32's 'DM32.01.L01.048' and warned on any
  // radio reporting anything else — so the D890UV, which reports 'V100',
  // showed a permanent "wrong firmware" warning for not being a DM-32.
  it('the DM-32 declares its known-good firmware', () => {
    expect(getCapabilitiesForModel('DM-32UV')?.expectedFirmware).toBe('DM32.01.L01.048');
  });

  it('the D890UV declares none, so it must never warn', () => {
    expect(getCapabilitiesForModel('DA-7X2')?.expectedFirmware).toBeUndefined();
  });

  it('no radio borrows another radio\'s expected firmware', () => {
    for (const m of ['UV5R-Mini', 'FT-65', 'FT-4', 'FT-25R']) {
      expect(getCapabilitiesForModel(m)?.expectedFirmware, m).toBeUndefined();
    }
  });
});
