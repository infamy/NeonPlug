/**
 * Radtel RT-950 Pro settings: the function block at radio address 0x9000.
 *
 * Offsets from the RT-950 Pro CHIRP driver's notes (see constants.ts). Each
 * setting is the low nibble of its own byte, and 0xFF means the radio still
 * has its factory default. Only settings both of that driver's sources agree
 * on are here; the ones they label differently (voice prompt, language, DTMF
 * mode, alarm, power-on message, key assignments) are left out rather than
 * guessed. ⚠️ None of it has been checked against a radio yet.
 *
 * A write patches: a setting is written only when it differs from what the
 * image already holds, and only its low nibble changes. A byte still at 0xFF
 * stays 0xFF unless that setting was changed; choosing "Radio default" again
 * puts 0xFF back, the radio's own mark for it.
 */

import { RT950PRO_RADIO_DEFAULT, type Rt950ProSettings } from '../../types/rt950proSettings';
import { RT950PRO_SEGMENT_OFFSETS } from './constants';

/** Where the function block starts in the image (the third region). */
export const RT950PRO_FUNCTION_OFFSET = RT950PRO_SEGMENT_OFFSETS[2];

type Key = keyof Rt950ProSettings;

interface FieldSpec {
  key: Key;
  /** Byte within the function block. */
  offset: number;
  /** 'bool' is 0 or 1; the others run from 0 to the radio's maximum. */
  kind: 'number' | 'bool';
}

/** Every setting this app reads and writes, by byte. The one list both directions use. */
export const RT950PRO_SETTING_FIELDS: readonly FieldSpec[] = [
  { key: 'squelch', offset: 0x00, kind: 'number' },
  { key: 'batterySave', offset: 0x01, kind: 'number' },
  { key: 'voxGain', offset: 0x02, kind: 'number' },
  { key: 'backlight', offset: 0x03, kind: 'number' },
  { key: 'dualWatch', offset: 0x04, kind: 'bool' },
  { key: 'tot', offset: 0x05, kind: 'number' },
  { key: 'keyBeep', offset: 0x06, kind: 'bool' },
  { key: 'scanMode', offset: 0x0a, kind: 'number' },
  { key: 'pttId', offset: 0x0b, kind: 'number' },
  { key: 'sendIdDelay', offset: 0x0c, kind: 'number' },
  { key: 'displayModeA', offset: 0x0d, kind: 'number' },
  { key: 'displayModeB', offset: 0x0e, kind: 'number' },
  { key: 'displayModeC', offset: 0x0f, kind: 'number' },
  { key: 'autoKeyLock', offset: 0x10, kind: 'bool' },
  { key: 'tailNoiseClear', offset: 0x14, kind: 'bool' },
  { key: 'repeaterNoiseClear', offset: 0x15, kind: 'bool' },
  { key: 'repeaterNoiseDetect', offset: 0x16, kind: 'bool' },
  { key: 'rogerBeep', offset: 0x17, kind: 'bool' },
  { key: 'fmRadio', offset: 0x19, kind: 'bool' },
  { key: 'keypadLock', offset: 0x1b, kind: 'bool' },
  { key: 'bluetooth', offset: 0x1d, kind: 'bool' },
  { key: 'voxDelay', offset: 0x20, kind: 'number' },
  { key: 'voxEnabled', offset: 0x28, kind: 'bool' },
];

function readField(byte: number, kind: FieldSpec['kind']): number {
  if (byte === 0xff) return RT950PRO_RADIO_DEFAULT;
  const value = byte & 0x0f;
  return kind === 'bool' ? (value ? 1 : 0) : value;
}

export function parseRt950ProSettings(image: Uint8Array): Rt950ProSettings | null {
  if (image.length < RT950PRO_FUNCTION_OFFSET + 0x60) return null;
  const block = image.subarray(RT950PRO_FUNCTION_OFFSET, RT950PRO_FUNCTION_OFFSET + 0x60);
  return Object.fromEntries(
    RT950PRO_SETTING_FIELDS.map((field) => [field.key, readField(block[field.offset], field.kind)])
  ) as unknown as Rt950ProSettings;
}

/** Write the settings that differ from the image's own into the image. */
export function writeRt950ProSettings(image: Uint8Array, settings: Partial<Rt950ProSettings>): void {
  const current = parseRt950ProSettings(image);
  if (!current) return;
  for (const field of RT950PRO_SETTING_FIELDS) {
    const wanted = settings[field.key];
    if (wanted === undefined || wanted === current[field.key]) continue;
    const at = RT950PRO_FUNCTION_OFFSET + field.offset;
    if (wanted === RT950PRO_RADIO_DEFAULT) {
      image[at] = 0xff;
      continue;
    }
    const value = field.kind === 'bool' ? (wanted ? 1 : 0) : Math.max(0, Math.min(0x0f, Math.round(wanted)));
    image[at] = image[at] === 0xff ? value : (image[at] & 0xf0) | value;
  }
}
