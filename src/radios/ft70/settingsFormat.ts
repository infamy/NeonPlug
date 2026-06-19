/**
 * Parse/encode the FT-70D settings blocks. Layout from CHIRP chirp/drivers/ft70.py.
 * Byte offsets are absolute (within the full 65227-byte image).
 */
import type { Ft70Settings } from '../../types/ft70Settings';
import {
  FT70_ADDR_OPENING_MESSAGE, FT70_ADDR_SQUELCH, FT70_ADDR_FIRST_SETTINGS,
  FT70_ADDR_BEEP_SETTINGS, FT70_ADDR_SCAN_SETTINGS, FT70_ADDR_SCAN_SETTINGS_2,
  FT70_ADDR_MYCALL, FT70_ADDR_DIGITAL_SETTINGS_MORE, FT70_ADDR_DIGITAL_SETTINGS,
  FT70_MEM_SIZE,
} from './constants';

// Relative offsets within scan_settings (base FT70_ADDR_SCAN_SETTINGS).
const SS = {
  LCD_DIMMER: 0, DTMF_DELAY: 1, LAMP: 6, LOCK: 7, MIC_GAIN: 9, DW_INTERVAL: 11,
  PTT_DELAY: 12, RX_SAVE: 13, SCAN_RESTART: 14, TOT: 22,
  BYTE_A: 26, // vfo_mode:1 unknown:1 scan_lamp:1 unknown:1 ars:1 dtmf_speed:1 unknown:1 dtmf_mode:1
  BYTE_B: 27, // busy_led:1 unknown:1 unknown:1 bclo:1 beep_edge:1 unknown:1 unknown:1 unknown:1
  BYTE_C: 28, // unknown x5 password:1 home_rev:1 moni:1
  BYTE_D: 29, // gm_interval:4 unknown:4
  BYTE_E: 31, // unknown x4 home_vfo:1 unknown:1 unknown:1 dw_rt:1
} as const;

// Relative offsets within first_settings (base FT70_ADDR_FIRST_SETTINGS).
const FS = { SCAN_RESUME: 0, DW_RESUME_INTERVAL: 1, APO: 3, GM_RING: 4 } as const;

function clamp(v: number, max: number): number {
  return Math.min(Math.max(0, v), max);
}

function decodeAscii(s: Uint8Array, off: number, len: number): string {
  let out = '';
  for (let i = 0; i < len; i++) {
    const b = s[off + i];
    if (b === 0xff || b === 0x00) break;
    out += String.fromCharCode(b);
  }
  return out.trimEnd();
}

function encodeAscii(s: Uint8Array, off: number, len: number, value: string): void {
  s.fill(0xff, off, off + len);
  const capped = value.slice(0, len);
  for (let i = 0; i < capped.length; i++) s[off + i] = capped.charCodeAt(i) & 0xff;
}

export function parseFt70Settings(image: Uint8Array): Ft70Settings | null {
  if (image.length < FT70_MEM_SIZE) return null;

  const openingMsg = image;
  const squelch = image[FT70_ADDR_SQUELCH] & 0x0f;
  const first = image;
  const beep = image;
  const scan = image;
  const scan2 = image;
  const digMore = image;
  const dig = image;

  const byteA = scan[FT70_ADDR_SCAN_SETTINGS + SS.BYTE_A];
  const byteB = scan[FT70_ADDR_SCAN_SETTINGS + SS.BYTE_B];
  const byteC = scan[FT70_ADDR_SCAN_SETTINGS + SS.BYTE_C];
  const byteD = scan[FT70_ADDR_SCAN_SETTINGS + SS.BYTE_D];
  const byteE = scan[FT70_ADDR_SCAN_SETTINGS + SS.BYTE_E];

  const rawDigitalPopup = digMore[FT70_ADDR_DIGITAL_SETTINGS_MORE + 7];

  return {
    openingMessageMode: clamp(openingMsg[FT70_ADDR_OPENING_MESSAGE + 1], 2),
    openingMessageText: decodeAscii(openingMsg, FT70_ADDR_OPENING_MESSAGE + 4, 6),
    lcdDimmer: clamp(scan[FT70_ADDR_SCAN_SETTINGS + SS.LCD_DIMMER], 5),

    squelch,
    volume: scan2[FT70_ADDR_SCAN_SETTINGS_2] & 0x1f,

    apo: clamp(first[FT70_ADDR_FIRST_SETTINGS + FS.APO] & 0x1f, 24),
    rxSave: clamp(scan[FT70_ADDR_SCAN_SETTINGS + SS.RX_SAVE], 36),

    scanResume: clamp(first[FT70_ADDR_FIRST_SETTINGS + FS.SCAN_RESUME] & 0x1f, 18),
    scanRestart: clamp(scan[FT70_ADDR_SCAN_SETTINGS + SS.SCAN_RESTART], 27),
    scanLamp: ((byteA >> 5) & 1) !== 0,
    ars: ((byteA >> 3) & 1) !== 0,

    dwResumeInterval: clamp(first[FT70_ADDR_FIRST_SETTINGS + FS.DW_RESUME_INTERVAL] & 0x1f, 18),
    dwInterval: clamp(scan[FT70_ADDR_SCAN_SETTINGS + SS.DW_INTERVAL], 27),
    dwRt: (byteE & 1) !== 0,
    homeVfo: ((byteE >> 3) & 1) !== 0,

    beepLevel: clamp(beep[FT70_ADDR_BEEP_SETTINGS] & 0x07, 6),
    beepSelect: clamp(beep[FT70_ADDR_BEEP_SETTINGS + 1] & 0x03, 2),
    beepEdge: ((byteB >> 3) & 1) !== 0,

    lock: clamp(scan[FT70_ADDR_SCAN_SETTINGS + SS.LOCK], 6),
    lamp: clamp(scan[FT70_ADDR_SCAN_SETTINGS + SS.LAMP], 10),
    homeRev: ((byteC >> 1) & 1) !== 0,
    moni: (byteC & 1) !== 0,

    bclo: ((byteB >> 4) & 1) !== 0,
    busyLed: ((byteB >> 7) & 1) !== 0,
    micGain: clamp(scan[FT70_ADDR_SCAN_SETTINGS + SS.MIC_GAIN], 8),
    pttDelay: clamp(scan[FT70_ADDR_SCAN_SETTINGS + SS.PTT_DELAY], 4),
    tot: clamp(scan[FT70_ADDR_SCAN_SETTINGS + SS.TOT], 20),
    vfoMode: ((byteA >> 7) & 1) !== 0,

    dtmfMode: (byteA & 1) !== 0,
    dtmfDelay: clamp(scan[FT70_ADDR_SCAN_SETTINGS + SS.DTMF_DELAY], 4),
    dtmfSpeed: ((byteA >> 2) & 1) !== 0,

    gmRing: clamp(first[FT70_ADDR_FIRST_SETTINGS + FS.GM_RING] & 0x03, 2),
    gmInterval: clamp((byteD >> 4) & 0x0f, 2),

    myCall: decodeAscii(image, FT70_ADDR_MYCALL, 10),
    amsTxMode: clamp(dig[FT70_ADDR_DIGITAL_SETTINGS] & 0x03, 2),
    standbyBeep: (dig[FT70_ADDR_DIGITAL_SETTINGS + 2] & 1) !== 0,
    rxDgId: clamp(dig[FT70_ADDR_DIGITAL_SETTINGS + 6], 99),
    txDgId: clamp(dig[FT70_ADDR_DIGITAL_SETTINGS + 7], 99),
    vwMode: (dig[FT70_ADDR_DIGITAL_SETTINGS + 8] & 1) !== 0,
    digitalPopup: rawDigitalPopup === 0 ? 0 : clamp(rawDigitalPopup - 9, 9),
  };
}

export function writeFt70Settings(image: Uint8Array, settings: Partial<Ft70Settings>): void {
  if (image.length < FT70_MEM_SIZE) return;

  const setBit = (addr: number, bit: number, value: boolean) => {
    if (value) image[addr] |= (1 << bit);
    else image[addr] &= ~(1 << bit);
  };

  if (settings.openingMessageMode != null) image[FT70_ADDR_OPENING_MESSAGE + 1] = clamp(settings.openingMessageMode, 2);
  if (settings.openingMessageText != null) encodeAscii(image, FT70_ADDR_OPENING_MESSAGE + 4, 6, settings.openingMessageText);
  if (settings.lcdDimmer != null) image[FT70_ADDR_SCAN_SETTINGS + SS.LCD_DIMMER] = clamp(settings.lcdDimmer, 5);

  if (settings.squelch != null) {
    image[FT70_ADDR_SQUELCH] = (image[FT70_ADDR_SQUELCH] & 0xf0) | clamp(settings.squelch, 15);
  }
  if (settings.volume != null) {
    const addr = FT70_ADDR_SCAN_SETTINGS_2;
    image[addr] = (image[addr] & 0xe0) | clamp(settings.volume, 31);
  }

  if (settings.apo != null) {
    const addr = FT70_ADDR_FIRST_SETTINGS + FS.APO;
    image[addr] = (image[addr] & 0xe0) | clamp(settings.apo, 24);
  }
  if (settings.rxSave != null) image[FT70_ADDR_SCAN_SETTINGS + SS.RX_SAVE] = clamp(settings.rxSave, 36);

  if (settings.scanResume != null) {
    const addr = FT70_ADDR_FIRST_SETTINGS + FS.SCAN_RESUME;
    image[addr] = (image[addr] & 0xe0) | clamp(settings.scanResume, 18);
  }
  if (settings.scanRestart != null) image[FT70_ADDR_SCAN_SETTINGS + SS.SCAN_RESTART] = clamp(settings.scanRestart, 27);
  if (settings.scanLamp != null) setBit(FT70_ADDR_SCAN_SETTINGS + SS.BYTE_A, 5, settings.scanLamp);
  if (settings.ars != null) setBit(FT70_ADDR_SCAN_SETTINGS + SS.BYTE_A, 3, settings.ars);

  if (settings.dwResumeInterval != null) {
    const addr = FT70_ADDR_FIRST_SETTINGS + FS.DW_RESUME_INTERVAL;
    image[addr] = (image[addr] & 0xe0) | clamp(settings.dwResumeInterval, 18);
  }
  if (settings.dwInterval != null) image[FT70_ADDR_SCAN_SETTINGS + SS.DW_INTERVAL] = clamp(settings.dwInterval, 27);
  if (settings.dwRt != null) setBit(FT70_ADDR_SCAN_SETTINGS + SS.BYTE_E, 0, settings.dwRt);
  if (settings.homeVfo != null) setBit(FT70_ADDR_SCAN_SETTINGS + SS.BYTE_E, 3, settings.homeVfo);

  if (settings.beepLevel != null) {
    const addr = FT70_ADDR_BEEP_SETTINGS;
    image[addr] = (image[addr] & 0xf8) | clamp(settings.beepLevel, 6);
  }
  if (settings.beepSelect != null) {
    const addr = FT70_ADDR_BEEP_SETTINGS + 1;
    image[addr] = (image[addr] & 0xfc) | clamp(settings.beepSelect, 2);
  }
  if (settings.beepEdge != null) setBit(FT70_ADDR_SCAN_SETTINGS + SS.BYTE_B, 3, settings.beepEdge);

  if (settings.lock != null) image[FT70_ADDR_SCAN_SETTINGS + SS.LOCK] = clamp(settings.lock, 6);
  if (settings.lamp != null) image[FT70_ADDR_SCAN_SETTINGS + SS.LAMP] = clamp(settings.lamp, 10);
  if (settings.homeRev != null) setBit(FT70_ADDR_SCAN_SETTINGS + SS.BYTE_C, 1, settings.homeRev);
  if (settings.moni != null) setBit(FT70_ADDR_SCAN_SETTINGS + SS.BYTE_C, 0, settings.moni);

  if (settings.bclo != null) setBit(FT70_ADDR_SCAN_SETTINGS + SS.BYTE_B, 4, settings.bclo);
  if (settings.busyLed != null) setBit(FT70_ADDR_SCAN_SETTINGS + SS.BYTE_B, 7, settings.busyLed);
  if (settings.micGain != null) image[FT70_ADDR_SCAN_SETTINGS + SS.MIC_GAIN] = clamp(settings.micGain, 8);
  if (settings.pttDelay != null) image[FT70_ADDR_SCAN_SETTINGS + SS.PTT_DELAY] = clamp(settings.pttDelay, 4);
  if (settings.tot != null) image[FT70_ADDR_SCAN_SETTINGS + SS.TOT] = clamp(settings.tot, 20);
  if (settings.vfoMode != null) setBit(FT70_ADDR_SCAN_SETTINGS + SS.BYTE_A, 7, settings.vfoMode);

  if (settings.dtmfMode != null) setBit(FT70_ADDR_SCAN_SETTINGS + SS.BYTE_A, 0, settings.dtmfMode);
  if (settings.dtmfDelay != null) image[FT70_ADDR_SCAN_SETTINGS + SS.DTMF_DELAY] = clamp(settings.dtmfDelay, 4);
  if (settings.dtmfSpeed != null) setBit(FT70_ADDR_SCAN_SETTINGS + SS.BYTE_A, 2, settings.dtmfSpeed);

  if (settings.gmRing != null) {
    const addr = FT70_ADDR_FIRST_SETTINGS + FS.GM_RING;
    image[addr] = (image[addr] & 0xfc) | clamp(settings.gmRing, 2);
  }
  if (settings.gmInterval != null) {
    const addr = FT70_ADDR_SCAN_SETTINGS + SS.BYTE_D;
    image[addr] = (image[addr] & 0x0f) | (clamp(settings.gmInterval, 2) << 4);
  }

  if (settings.myCall != null) encodeAscii(image, FT70_ADDR_MYCALL, 10, settings.myCall.toUpperCase());
  if (settings.amsTxMode != null) {
    const addr = FT70_ADDR_DIGITAL_SETTINGS;
    image[addr] = (image[addr] & 0xfc) | clamp(settings.amsTxMode, 2);
  }
  if (settings.standbyBeep != null) setBit(FT70_ADDR_DIGITAL_SETTINGS + 2, 0, settings.standbyBeep);
  if (settings.rxDgId != null) image[FT70_ADDR_DIGITAL_SETTINGS + 6] = clamp(settings.rxDgId, 99);
  if (settings.txDgId != null) image[FT70_ADDR_DIGITAL_SETTINGS + 7] = clamp(settings.txDgId, 99);
  if (settings.vwMode != null) setBit(FT70_ADDR_DIGITAL_SETTINGS + 8, 0, settings.vwMode);
  if (settings.digitalPopup != null) {
    const idx = clamp(settings.digitalPopup, 9);
    image[FT70_ADDR_DIGITAL_SETTINGS_MORE + 7] = idx === 0 ? 0 : idx + 9;
  }
}
