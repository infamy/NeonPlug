/**
 * UV5R-Mini settings format (from CHIRP baofeng_uv17Pro / uv5minitest).
 * Layout: 0x8000 VFO A, 0x8020 VFO B, 0x8040 settings (64 bytes), 0x8080 ANI, 0x80A0 PTT ID, 0x81E0 upcode, 0x8210 downcode.
 */

/** Settings object offset in image (64 bytes). */
export const UV5RMINI_SETTINGS_OFFSET = 0x8040;

/** Option lists for settings (from uv5minitest BASIC_SETTINGS_SCHEMA). */
const LIST_PTTID = ['Off', 'BOT', 'EOT', 'Both'];
const LIST_TIMEOUT = ['Off', ...Array.from({ length: 12 }, (_, i) => `${15 + i * 15} sec`)];
const LIST_DUAL_WATCH = ['Off', 'On'];
const LIST_POWERON_DISPLAY = ['LOGO', 'BATT voltage'];
const LIST_VOICE = ['English', 'Chinese'];
const LIST_BACKLIGHT = ['Always On', ...Array.from({ length: 4 }, (_, i) => `${5 + i * 5} sec`)];
const LIST_BEEP_MINI = ['Off', 'On'];
const LIST_MODE = ['Name', 'Frequency', 'Channel Number'];
const LIST_ID_DELAY = Array.from({ length: 30 }, (_, i) => `${100 + i * 100} ms`);
const LIST_QT_SAVEMODE = ['Both', 'RX', 'TX'];
const LIST_SCANMODE = ['Time', 'Carrier', 'Search'];
const LIST_ALARMMODE = ['Local', 'Send Tone', 'Send Code'];
const LIST_SIDE_TONE = ['Off', 'KB Side Tone', 'ANI Side Tone', 'KB + ANI Side Tone'];
const LIST_RPT_TAIL = Array.from({ length: 11 }, (_, i) => `${i * 100} ms`);
const LIST_VOX_DELAY = Array.from({ length: 16 }, (_, i) => `${500 + i * 100} ms`);
const LIST_VOX_LEVEL = ['Off', ...Array.from({ length: 9 }, (_, i) => String(i + 1))];
const LIST_PW_SAVEMODE = ['Off', 'On'];
const LIST_TIMEOUT_ALARM = ['Off', ...Array.from({ length: 10 }, (_, i) => `${i + 1} sec`)];
const LIST_MENU_QUIT = Array.from({ length: 11 }, (_, i) => (i < 10 ? `${5 + i * 5} sec` : '60 sec'));
const LIST_WORKMODE = ['Frequency', 'Channel'];
const LIST_HANGUPTIME = [3, 4, 5, 6, 7, 8, 9, 10].map((x) => `${x} s`);
const SQUELCH_LIST = ['Off', '1', '2', '3', '4', '5'];

function clampIndex(maxLen: number, value: number | undefined): number {
  if (value == null || value < 0) return 0;
  return Math.min(value, maxLen - 1);
}

import type { Uv5rMiniSettings } from '../../types/uv5rMiniSettings';

export type { Uv5rMiniSettings };

/** Parse UV5R-Mini settings from image at offset 0x8040 (64 bytes). */
export function parseUv5rMiniSettings(image: Uint8Array): Uv5rMiniSettings | null {
  const offset = UV5RMINI_SETTINGS_OFFSET;
  if (offset + 64 > image.length) return null;

  const s = image.subarray(offset, offset + 64);
  const chbworkmode = s[26] & 0x0f;
  const chaworkmode = (s[26] >> 4) & 0x0f;

  return {
    squelch: Math.min(s[0], SQUELCH_LIST.length - 1),
    savemode: Math.min(s[1], LIST_PW_SAVEMODE.length - 1),
    vox: Math.min(s[2], LIST_VOX_LEVEL.length - 1),
    backlight: Math.min(s[3], LIST_BACKLIGHT.length - 1),
    dualstandby: Math.min(s[4], LIST_DUAL_WATCH.length - 1),
    tot: Math.min(s[5], LIST_TIMEOUT.length - 1),
    beep: Math.min(s[6], LIST_BEEP_MINI.length - 1),
    voicesw: !!s[7],
    voice: Math.min(s[8], LIST_VOICE.length - 1),
    sidetone: Math.min(s[9], LIST_SIDE_TONE.length - 1),
    scanmode: Math.min(s[10], LIST_SCANMODE.length - 1),
    pttid: Math.min(s[11], LIST_PTTID.length - 1),
    pttdly: Math.min(s[12], LIST_ID_DELAY.length - 1),
    chadistype: Math.min(s[13], LIST_MODE.length - 1),
    chbdistype: Math.min(s[14], LIST_MODE.length - 1),
    bcl: !!s[15],
    autolock: !!s[16],
    alarmmode: Math.min(s[17], LIST_ALARMMODE.length - 1),
    alarmtone: !!s[18],
    tailclear: !!s[20],
    rpttailclear: Math.min(s[21], LIST_RPT_TAIL.length - 1),
    rpttaildet: Math.min(s[22], LIST_RPT_TAIL.length - 1),
    roger: !!s[23],
    aOrB: (s[24] === 0 ? 0 : 1) as 0 | 1,
    fmenable: !!s[25],
    chaworkmode: Math.min(chaworkmode, LIST_WORKMODE.length - 1),
    chbworkmode: Math.min(chbworkmode, LIST_WORKMODE.length - 1),
    keylock: !!s[27],
    powerondistype: Math.min(s[28], LIST_POWERON_DISPLAY.length - 1),
    voxdlytime: Math.min(s[32], LIST_VOX_DELAY.length - 1),
    menuquittime: Math.min(s[33], LIST_MENU_QUIT.length - 1),
    dispani: !!s[36],
    totalarm: Math.min(s[40], LIST_TIMEOUT_ALARM.length - 1),
    ctsdcsscantype: Math.min(s[43], LIST_QT_SAVEMODE.length - 1),
    hangup: Math.min(s[57], LIST_HANGUPTIME.length - 1),
    voxsw: !!s[58],
    inputdtmf: !!s[61],
  };
}

/** Write UV5R-Mini settings back to image. Only writes fields present in settings; preserves other bytes. */
export function writeUv5rMiniSettings(
  image: Uint8Array,
  settings: Partial<Uv5rMiniSettings>
): void {
  const offset = UV5RMINI_SETTINGS_OFFSET;
  if (offset + 64 > image.length) return;

  const s = image.subarray(offset, offset + 64);

  if (settings.squelch != null) s[0] = clampIndex(SQUELCH_LIST.length, settings.squelch);
  if (settings.savemode != null) s[1] = clampIndex(LIST_PW_SAVEMODE.length, settings.savemode);
  if (settings.vox != null) s[2] = clampIndex(LIST_VOX_LEVEL.length, settings.vox);
  if (settings.backlight != null) s[3] = clampIndex(LIST_BACKLIGHT.length, settings.backlight);
  if (settings.dualstandby != null) s[4] = clampIndex(LIST_DUAL_WATCH.length, settings.dualstandby);
  if (settings.tot != null) s[5] = clampIndex(LIST_TIMEOUT.length, settings.tot);
  if (settings.beep != null) s[6] = clampIndex(LIST_BEEP_MINI.length, settings.beep);
  if (settings.voicesw != null) s[7] = settings.voicesw ? 1 : 0;
  if (settings.voice != null) s[8] = clampIndex(LIST_VOICE.length, settings.voice);
  if (settings.sidetone != null) s[9] = clampIndex(LIST_SIDE_TONE.length, settings.sidetone);
  if (settings.scanmode != null) s[10] = clampIndex(LIST_SCANMODE.length, settings.scanmode);
  if (settings.pttid != null) s[11] = clampIndex(LIST_PTTID.length, settings.pttid);
  if (settings.pttdly != null) s[12] = clampIndex(LIST_ID_DELAY.length, settings.pttdly);
  if (settings.chadistype != null) s[13] = clampIndex(LIST_MODE.length, settings.chadistype);
  if (settings.chbdistype != null) s[14] = clampIndex(LIST_MODE.length, settings.chbdistype);
  if (settings.bcl != null) s[15] = settings.bcl ? 1 : 0;
  if (settings.autolock != null) s[16] = settings.autolock ? 1 : 0;
  if (settings.alarmmode != null) s[17] = clampIndex(LIST_ALARMMODE.length, settings.alarmmode);
  if (settings.alarmtone != null) s[18] = settings.alarmtone ? 1 : 0;
  if (settings.tailclear != null) s[20] = settings.tailclear ? 1 : 0;
  if (settings.rpttailclear != null) s[21] = clampIndex(LIST_RPT_TAIL.length, settings.rpttailclear);
  if (settings.rpttaildet != null) s[22] = clampIndex(LIST_RPT_TAIL.length, settings.rpttaildet);
  if (settings.roger != null) s[23] = settings.roger ? 1 : 0;
  if (settings.aOrB != null) s[24] = settings.aOrB;
  if (settings.fmenable != null) s[25] = settings.fmenable ? 1 : 0;
  if (settings.chaworkmode != null || settings.chbworkmode != null) {
    const high = settings.chaworkmode != null ? clampIndex(LIST_WORKMODE.length, settings.chaworkmode) : (s[26] >> 4) & 0x0f;
    const low = settings.chbworkmode != null ? clampIndex(LIST_WORKMODE.length, settings.chbworkmode) : s[26] & 0x0f;
    s[26] = (high << 4) | low;
  }
  if (settings.keylock != null) s[27] = settings.keylock ? 1 : 0;
  if (settings.powerondistype != null) s[28] = clampIndex(LIST_POWERON_DISPLAY.length, settings.powerondistype);
  if (settings.voxdlytime != null) s[32] = clampIndex(LIST_VOX_DELAY.length, settings.voxdlytime);
  if (settings.menuquittime != null) s[33] = clampIndex(LIST_MENU_QUIT.length, settings.menuquittime);
  if (settings.dispani != null) s[36] = settings.dispani ? 1 : 0;
  if (settings.totalarm != null) s[40] = clampIndex(LIST_TIMEOUT_ALARM.length, settings.totalarm);
  if (settings.ctsdcsscantype != null) s[43] = clampIndex(LIST_QT_SAVEMODE.length, settings.ctsdcsscantype);
  if (settings.hangup != null) s[57] = clampIndex(LIST_HANGUPTIME.length, settings.hangup);
  if (settings.voxsw != null) s[58] = settings.voxsw ? 1 : 0;
  if (settings.inputdtmf != null) s[61] = settings.inputdtmf ? 1 : 0;
}
