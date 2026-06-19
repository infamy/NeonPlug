/**
 * Parse/encode the 64-byte settings block at FT65_ADDR_SETTINGS (0x2000).
 * Layout from CHIRP chirp/drivers/ft4.py `misc` struct.
 */
import type { Ft65Settings } from '../../types/ft65Settings';
import { FT65_ADDR_SETTINGS } from './constants';

const SETTINGS_SIZE = 0x40; // 64 bytes

export function parseFt65Settings(image: Uint8Array): Ft65Settings | null {
  const off = FT65_ADDR_SETTINGS;
  if (off + SETTINGS_SIZE > image.length) return null;
  const s = image.subarray(off, off + SETTINGS_SIZE);

  // cw_id: 6 ASCII bytes at 0x07–0x0C, space-padded
  let cwId = '';
  for (let i = 0; i < 6; i++) {
    const b = s[0x07 + i];
    if (b === 0x00 || b === 0xff) break;
    if (b !== 0x20) cwId += String.fromCharCode(b);
    else if (cwId.length > 0) cwId += ' ';
  }
  cwId = cwId.trimEnd();

  // passwd: 4 ASCII digit bytes at 0x31–0x34
  let passwd = '';
  for (let i = 0; i < 4; i++) {
    const b = s[0x31 + i];
    passwd += (b >= 0x30 && b <= 0x39) ? String.fromCharCode(b) : '0';
  }

  return {
    apo:        Math.min(s[0x00], 24),
    artsBeep:   Math.min(s[0x01], 2),
    artsIntv:   Math.min(s[0x02], 1),
    battSave:   Math.min(s[0x03], 5),
    bclo:       s[0x04] !== 0,
    beep:       Math.min(s[0x05], 2),
    bell:       Math.min(s[0x06], 5),
    cwId,
    useCwid:    s[0x1E] !== 0,
    compander:  s[0x1F] !== 0,
    dtmfMode:   Math.min(s[0x10], 1),
    dtmfDelay:  Math.min(s[0x11], 4),
    dtmfSpeed:  Math.min(s[0x12], 1),
    edgBeep:    s[0x13] !== 0,
    keyLock:    Math.min(s[0x14], 2),
    lamp:       Math.min(s[0x15], 4),
    txLed:      s[0x16] !== 0,
    bsyLed:     s[0x17] !== 0,
    moniTcall:  Math.min(s[0x18], 4),
    priRvt:     s[0x19] !== 0,
    scanResume: Math.min(s[0x1A], 2),
    rfSquelch:  Math.min(s[0x1B], 8),
    scanLamp:   s[0x1C] !== 0,
    txSave:     s[0x21] !== 0,
    vfoSpl:     s[0x22] !== 0,
    vox:        s[0x23] !== 0,
    wfmRcv:     s[0x24] !== 0,
    wxAlert:    s[0x26] !== 0,
    tot:        Math.min(s[0x27], 30),
    usePasswd:  s[0x30] !== 0,
    passwd,
  };
}

/** Write settings back into image. Only modifies bytes corresponding to known fields; unknown bytes are untouched. */
export function writeFt65Settings(image: Uint8Array, settings: Partial<Ft65Settings>): void {
  const off = FT65_ADDR_SETTINGS;
  if (off + SETTINGS_SIZE > image.length) return;
  const s = image.subarray(off, off + SETTINGS_SIZE);

  if (settings.apo        != null) s[0x00] = Math.min(settings.apo, 24);
  if (settings.artsBeep   != null) s[0x01] = Math.min(settings.artsBeep, 2);
  if (settings.artsIntv   != null) s[0x02] = Math.min(settings.artsIntv, 1);
  if (settings.battSave   != null) s[0x03] = Math.min(settings.battSave, 5);
  if (settings.bclo       != null) s[0x04] = settings.bclo ? 1 : 0;
  if (settings.beep       != null) s[0x05] = Math.min(settings.beep, 2);
  if (settings.bell       != null) s[0x06] = Math.min(settings.bell, 5);
  if (settings.cwId != null) {
    // space-pad the 6-byte field; uppercase only
    const clean = settings.cwId.slice(0, 6).toUpperCase();
    s.fill(0x20, 0x07, 0x0D);
    for (let i = 0; i < clean.length; i++) s[0x07 + i] = clean.charCodeAt(i) & 0xff;
  }
  if (settings.dtmfMode   != null) s[0x10] = Math.min(settings.dtmfMode, 1);
  if (settings.dtmfDelay  != null) s[0x11] = Math.min(settings.dtmfDelay, 4);
  if (settings.dtmfSpeed  != null) s[0x12] = Math.min(settings.dtmfSpeed, 1);
  if (settings.edgBeep    != null) s[0x13] = settings.edgBeep ? 1 : 0;
  if (settings.keyLock    != null) s[0x14] = Math.min(settings.keyLock, 2);
  if (settings.lamp       != null) s[0x15] = Math.min(settings.lamp, 4);
  if (settings.txLed      != null) s[0x16] = settings.txLed ? 1 : 0;
  if (settings.bsyLed     != null) s[0x17] = settings.bsyLed ? 1 : 0;
  if (settings.moniTcall  != null) s[0x18] = Math.min(settings.moniTcall, 4);
  if (settings.priRvt     != null) s[0x19] = settings.priRvt ? 1 : 0;
  if (settings.scanResume != null) s[0x1A] = Math.min(settings.scanResume, 2);
  if (settings.rfSquelch  != null) s[0x1B] = Math.min(settings.rfSquelch, 8);
  if (settings.scanLamp   != null) s[0x1C] = settings.scanLamp ? 1 : 0;
  if (settings.useCwid    != null) s[0x1E] = settings.useCwid ? 1 : 0;
  if (settings.compander  != null) s[0x1F] = settings.compander ? 1 : 0;
  if (settings.txSave     != null) s[0x21] = settings.txSave ? 1 : 0;
  if (settings.vfoSpl     != null) s[0x22] = settings.vfoSpl ? 1 : 0;
  if (settings.vox        != null) s[0x23] = settings.vox ? 1 : 0;
  if (settings.wfmRcv     != null) s[0x24] = settings.wfmRcv ? 1 : 0;
  if (settings.wxAlert    != null) s[0x26] = settings.wxAlert ? 1 : 0;
  if (settings.tot        != null) s[0x27] = Math.min(settings.tot, 30);
  if (settings.usePasswd  != null) s[0x30] = settings.usePasswd ? 1 : 0;
  if (settings.passwd != null) {
    const digits = settings.passwd.replace(/[^0-9]/g, '').padEnd(4, '0').slice(0, 4);
    for (let i = 0; i < 4; i++) s[0x31 + i] = digits.charCodeAt(i);
  }
}
