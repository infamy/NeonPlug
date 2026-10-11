import { describe, it, expect } from 'vitest';
import { parseHardwareFeatures, FACTORY_INFO_FEATURE_OFFSET } from '../../src/radios/dm3x/factoryInfo';
import { radioLacks, settingsFeatureUnfitted, describeHardwareFeatures } from '../../src/utils/hardwareFeatures';
import type { RadioInfo } from '../../src/types/radio';

const page = (flags: number) => {
  const p = new Uint8Array(256);
  p[FACTORY_INFO_FEATURE_OFFSET] = flags;
  return p;
};
const info = (hardwareFeatures?: RadioInfo['hardwareFeatures']): RadioInfo =>
  ({ model: 'DM-32UV', firmware: '', buildDate: '', hardwareFeatures });

describe('DM-32 factory info feature bits', () => {
  it('reads each bit as the vendor CPS Function Item list orders them', () => {
    expect(parseHardwareFeatures(page(0x04))).toEqual({
      vibrate: false, manDown: false, gps: true, bluetooth: false, sdCard: false, roaming: false, recording: false,
    });
    expect(parseHardwareFeatures(page(0x08))?.bluetooth).toBe(true);
    expect(parseHardwareFeatures(page(0x40))?.recording).toBe(true);
    expect(parseHardwareFeatures(page(0x7f))).toEqual({
      vibrate: true, manDown: true, gps: true, bluetooth: true, sdCard: true, roaming: true, recording: true,
    });
  });

  it('reads 0xFF as a page nobody programmed, not every feature', () => {
    expect(parseHardwareFeatures(page(0xff))).toBeUndefined();
  });

  it('reports nothing from a short page', () => {
    expect(parseHardwareFeatures(new Uint8Array(0x80))).toBeUndefined();
  });
});

describe('hiding settings by reported hardware', () => {
  it('hides only on an explicit false', () => {
    expect(radioLacks(info({ gps: false }), 'gps')).toBe(true);
    expect(radioLacks(info({ gps: true }), 'gps')).toBe(false);
    expect(radioLacks(info(), 'gps')).toBe(false);
    expect(radioLacks(null, 'gps')).toBe(false);
  });

  it('ties GPS & APRS to GPS hardware and leaves other areas alone', () => {
    expect(settingsFeatureUnfitted('gpsAprs', info({ gps: false }))).toBe(true);
    expect(settingsFeatureUnfitted('gpsAprs', info({ gps: true }))).toBe(false);
    expect(settingsFeatureUnfitted('gpsAprs', info())).toBe(false);
    expect(settingsFeatureUnfitted('bootImage', info({ gps: false }))).toBe(false);
  });

  it('describes what the radio reported', () => {
    expect(describeHardwareFeatures(info())).toBeNull();
    expect(describeHardwareFeatures(info({ gps: true, bluetooth: true, sdCard: false }))).toBe('GPS, Bluetooth');
    expect(describeHardwareFeatures(info({ gps: false }))).toBe('None');
  });
});
