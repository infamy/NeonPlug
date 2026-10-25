import { describe, it, expect } from 'vitest';
import { shouldWriteSettings } from '../../src/utils/settingsWritePlan';
import { getCapabilitiesForModel } from '../../src/radios/capabilities';
import { buildWriteConfirmation } from '../../src/components/layout/writeConfirmation';
import { UV5RMiniProtocol } from '../../src/radios/uv5rmini/protocol';
import {
  UV5RMINI_SETTINGS_OFFSET,
  parseUv5rMiniSettings,
  writeUv5rMiniSettings,
  type Uv5rMiniSettings,
} from '../../src/radios/uv5rmini/settingsFormat';
import type { RadioSettings } from '../../src/models/RadioSettings';

/**
 * #206: a codeplug read from one UV5R-Mini and written unchanged to another
 * copied the channels and none of the settings, because settings went out only
 * once one had been edited. The vendor CPS writes them every time.
 *
 * The two settings objects below are the reporter's own, from the exports
 * attached to the issue: the configured radio, and the second radio out of the
 * box. They differ in seven fields.
 */
const CONFIGURED = {
  squelch: 3, savemode: 1, vox: 4, backlight: 4, dualstandby: 1, tot: 8, beep: 0, voicesw: false,
  voice: 0, sidetone: 0, scanmode: 1, pttid: 0, pttdly: 5, chadistype: 0, chbdistype: 0, bcl: false,
  autolock: false, alarmmode: 0, alarmtone: true, tailclear: true, rpttailclear: 5, rpttaildet: 5,
  roger: false, aOrB: 0, fmenable: false, chaworkmode: 1, chbworkmode: 0, keylock: false,
  powerondistype: 1, voxdlytime: 6, menuquittime: 0, dispani: false, totalarm: 0, ctsdcsscantype: 0,
  hangup: 1, voxsw: false, inputdtmf: false,
} as unknown as Uv5rMiniSettings;

const OUT_OF_BOX = {
  ...CONFIGURED, backlight: 1, dualstandby: 0, beep: 1, voicesw: true, chbworkmode: 1,
  powerondistype: 0, menuquittime: 1,
} as unknown as Uv5rMiniSettings;

describe('which writes send the settings', () => {
  it('sends them on every write for a radio that opts in, edited or not', () => {
    expect(shouldWriteSettings(true, 0, true, undefined)).toBe(true);
    expect(shouldWriteSettings(true, 3, true, undefined)).toBe(true);
  });

  it('keeps the old rule for radios that have not opted in, and for buffered writers', () => {
    expect(shouldWriteSettings(true, 0, undefined, undefined)).toBe(false);
    expect(shouldWriteSettings(true, 2, undefined, undefined)).toBe(true);
    expect(shouldWriteSettings(true, 0, true, true)).toBe(false);
    expect(shouldWriteSettings(true, 1, undefined, true)).toBe(true);
  });

  it('sends nothing with no settings loaded', () => {
    expect(shouldWriteSettings(false, 0, true, undefined)).toBe(false);
  });

  it('is turned on for the UV5R-Mini and the DM-3x radios only', () => {
    expect(getCapabilitiesForModel('UV5R-Mini')?.writesSettingsOnEveryWrite).toBe(true);
    expect(getCapabilitiesForModel('DM-32UV')?.writesSettingsOnEveryWrite).toBe(true);
    // Same driver and settings write as the DM-32.
    expect(getCapabilitiesForModel('DM-36')?.writesSettingsOnEveryWrite).toBe(true);
    for (const model of ['FT-65', 'DA-7X2', 'RT-950 Pro']) {
      expect(getCapabilitiesForModel(model)?.writesSettingsOnEveryWrite).toBeFalsy();
    }
  });
});

describe('cloning a UV5R-Mini (#206)', () => {
  it("puts the first radio's settings onto the second, keeping the bytes it does not map", async () => {
    // The second radio's own settings block, with a byte no field maps.
    const radioB = new Uint8Array(UV5RMINI_SETTINGS_OFFSET + 64).fill(0xff);
    writeUv5rMiniSettings(radioB, OUT_OF_BOX);
    const unmapped = radioB.subarray(UV5RMINI_SETTINGS_OFFSET).findIndex((b, i) => {
      const probe = radioB.slice();
      probe[UV5RMINI_SETTINGS_OFFSET + i] = b ^ 0x01;
      return JSON.stringify(parseUv5rMiniSettings(probe)) === JSON.stringify(parseUv5rMiniSettings(radioB));
    });
    expect(unmapped).toBeGreaterThanOrEqual(0);
    radioB[UV5RMINI_SETTINGS_OFFSET + unmapped] = 0x5a;

    let written: Uint8Array | null = null;
    const proto = new UV5RMiniProtocol();
    (proto as unknown as { connection: object }).connection = {
      readBlock: async () => radioB.slice(UV5RMINI_SETTINGS_OFFSET, UV5RMINI_SETTINGS_OFFSET + 64),
      writeBlock: async (_addr: number, data: Uint8Array) => {
        written = data.slice();
      },
    };

    await proto.writeRadioSettings({ radioSpecific: CONFIGURED } as unknown as RadioSettings, { changedFields: [] });

    expect(written).not.toBeNull();
    const after = radioB.slice();
    after.set(written!, UV5RMINI_SETTINGS_OFFSET);
    expect(parseUv5rMiniSettings(after)).toEqual(parseUv5rMiniSettings((() => {
      const img = new Uint8Array(UV5RMINI_SETTINGS_OFFSET + 64).fill(0xff);
      writeUv5rMiniSettings(img, CONFIGURED);
      return img;
    })()));
    expect(after[UV5RMINI_SETTINGS_OFFSET + unmapped]).toBe(0x5a);
  });
});

describe('the write confirmation says the settings go out', () => {
  const base = {
    model: 'UV5R-Mini', channels: 148, zones: 0, scanLists: 0,
    droppedChannels: [], droppedZones: [], droppedScanLists: [],
  };

  it('with none edited', () => {
    const c = buildWriteConfirmation({ preview: null, integrity: [], warnings: [], summary: { ...base, settings: { labels: [], all: false, everyWrite: true } } });
    expect(c.settingsLine).toBe('Writes the settings as loaded, none changed.');
  });

  it('with some edited', () => {
    const c = buildWriteConfirmation({ preview: null, integrity: [], warnings: [], summary: { ...base, settings: { labels: ['Beep'], all: false, everyWrite: true } } });
    expect(c.settingsLine).toBe('Writes the settings, changing 1 setting: Beep.');
  });

  it('as before on a radio that only sends edits', () => {
    expect(buildWriteConfirmation({ preview: null, integrity: [], warnings: [], summary: { ...base, settings: { labels: [], all: false } } }).settingsLine).toBeNull();
    expect(
      buildWriteConfirmation({ preview: null, integrity: [], warnings: [], summary: { ...base, settings: { labels: ['Beep'], all: false } } }).settingsLine
    ).toBe('Changes 1 setting: Beep.');
  });
});
