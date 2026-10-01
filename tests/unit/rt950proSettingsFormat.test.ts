import { describe, it, expect } from 'vitest';
import {
  RT950PRO_FUNCTION_OFFSET,
  RT950PRO_SETTING_FIELDS,
  parseRt950ProSettings,
  writeRt950ProSettings,
} from '../../src/radios/rt950pro/settingsFormat';
import { RT950PRO_IMAGE_SIZE } from '../../src/radios/rt950pro/constants';
import { RT950PRO_SETTINGS_PROFILE } from '../../src/radios/rt950pro/settingsProfile';
import { RT950PRO_RADIO_DEFAULT, type Rt950ProSettings } from '../../src/types/rt950proSettings';

/** An image whose function block holds `fill` in every byte. */
function image(fill: number): Uint8Array {
  const out = new Uint8Array(RT950PRO_IMAGE_SIZE);
  out.fill(fill, RT950PRO_FUNCTION_OFFSET, RT950PRO_FUNCTION_OFFSET + 0x100);
  return out;
}

const byteOf = (img: Uint8Array, key: keyof Rt950ProSettings) =>
  img[RT950PRO_FUNCTION_OFFSET + RT950PRO_SETTING_FIELDS.find((f) => f.key === key)!.offset];

describe('RT-950 Pro settings', () => {
  it('reads a factory-default byte as the radio default, not as zero', () => {
    const settings = parseRt950ProSettings(image(0xff))!;
    for (const field of RT950PRO_SETTING_FIELDS) expect(settings[field.key]).toBe(RT950PRO_RADIO_DEFAULT);
  });

  it('reads each setting from the low nibble of its own byte', () => {
    const img = image(0x00);
    img[RT950PRO_FUNCTION_OFFSET + 0x00] = 0x35; // squelch 5, a high nibble that isn't ours
    img[RT950PRO_FUNCTION_OFFSET + 0x28] = 0x01; // VOX on
    const settings = parseRt950ProSettings(img)!;
    expect(settings.squelch).toBe(5);
    expect(settings.voxEnabled).toBe(1);
    expect(settings.keyBeep).toBe(0);
  });

  it('writes back every setting it reads', () => {
    for (const field of RT950PRO_SETTING_FIELDS) {
      const img = image(0x00);
      const value = field.kind === 'bool' ? 1 : 2;
      writeRt950ProSettings(img, { [field.key]: value } as Partial<Rt950ProSettings>);
      expect(parseRt950ProSettings(img)![field.key]).toBe(value);
    }
  });

  it('changes nothing for a setting left alone, or set to what the radio already has', () => {
    const img = image(0xff);
    img[RT950PRO_FUNCTION_OFFSET + 0x00] = 0x33; // squelch 3
    const before = img.slice();
    writeRt950ProSettings(img, { ...parseRt950ProSettings(img)!, squelch: 3 });
    expect(img).toEqual(before);
  });

  it("keeps the high nibble, and writes a plain value over a factory default", () => {
    const img = image(0xff);
    img[RT950PRO_FUNCTION_OFFSET + 0x00] = 0x33;
    writeRt950ProSettings(img, { squelch: 7, rogerBeep: 1 });
    expect(byteOf(img, 'squelch')).toBe(0x37);
    expect(byteOf(img, 'rogerBeep')).toBe(0x01);
    expect(byteOf(img, 'keyBeep')).toBe(0xff); // untouched
  });

  it('puts 0xFF back when a setting goes back to the radio default', () => {
    const img = image(0x00);
    writeRt950ProSettings(img, { squelch: RT950PRO_RADIO_DEFAULT });
    expect(byteOf(img, 'squelch')).toBe(0xff);
  });

  it('offers a Settings-tab field for every setting it reads, and nothing else, each able to show the radio default', () => {
    const fields = RT950PRO_SETTINGS_PROFILE.sections.flatMap((s) => s.fields);
    expect(fields.map((f) => f.key).sort()).toEqual(RT950PRO_SETTING_FIELDS.map((f) => `radioSpecific.${f.key}`).sort());
    for (const field of fields) {
      expect(field.type).toBe('select');
      expect(field.type === 'select' && field.options?.[0]).toEqual({ value: RT950PRO_RADIO_DEFAULT, label: 'Radio default' });
    }
  });
});
