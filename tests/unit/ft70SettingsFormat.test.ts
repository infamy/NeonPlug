import { describe, it, expect } from 'vitest';
import { parseFt70Settings, writeFt70Settings } from '../../src/radios/ft70/settingsFormat';
import {
  FT70_MEM_SIZE, FT70_ADDR_SQUELCH, FT70_ADDR_FIRST_SETTINGS, FT70_ADDR_BEEP_SETTINGS,
  FT70_ADDR_SCAN_SETTINGS, FT70_ADDR_SCAN_SETTINGS_2, FT70_ADDR_MYCALL,
  FT70_ADDR_DIGITAL_SETTINGS, FT70_ADDR_DIGITAL_SETTINGS_MORE, FT70_ADDR_OPENING_MESSAGE,
} from '../../src/radios/ft70/constants';

function makeImage(): Uint8Array {
  return new Uint8Array(FT70_MEM_SIZE);
}

describe('parseFt70Settings', () => {
  it('returns null when image is too small', () => {
    expect(parseFt70Settings(new Uint8Array(0))).toBeNull();
    expect(parseFt70Settings(new Uint8Array(100))).toBeNull();
  });

  it('parses all-zero block to safe defaults', () => {
    const s = parseFt70Settings(makeImage())!;
    expect(s.squelch).toBe(0);
    expect(s.volume).toBe(0);
    expect(s.apo).toBe(0);
    expect(s.bclo).toBe(false);
    expect(s.myCall).toBe('');
    expect(s.digitalPopup).toBe(0);
  });

  it('parses squelch from low nibble without disturbing high nibble', () => {
    const img = makeImage();
    img[FT70_ADDR_SQUELCH] = 0xf0 | 7;
    expect(parseFt70Settings(img)!.squelch).toBe(7);
  });

  it('parses volume from scan_settings_2 low 5 bits', () => {
    const img = makeImage();
    img[FT70_ADDR_SCAN_SETTINGS_2] = 0xe0 | 17;
    expect(parseFt70Settings(img)!.volume).toBe(17);
  });

  it('parses apo from first_settings low 5 bits', () => {
    const img = makeImage();
    img[FT70_ADDR_FIRST_SETTINGS + 3] = 0xe0 | 12;
    expect(parseFt70Settings(img)!.apo).toBe(12);
  });

  it('parses beep_level / beep_select', () => {
    const img = makeImage();
    img[FT70_ADDR_BEEP_SETTINGS] = 5; // beep_level
    img[FT70_ADDR_BEEP_SETTINGS + 1] = 2; // beep_select
    const s = parseFt70Settings(img)!;
    expect(s.beepLevel).toBe(5);
    expect(s.beepSelect).toBe(2);
  });

  it('parses scan_settings byte-A bitfield (vfo_mode..dtmf_mode)', () => {
    const img = makeImage();
    // vfo_mode(bit7)=1, scan_lamp(bit5)=1, ars(bit3)=1, dtmf_speed(bit2)=1, dtmf_mode(bit0)=1
    img[FT70_ADDR_SCAN_SETTINGS + 26] = 0b1010_1101;
    const s = parseFt70Settings(img)!;
    expect(s.vfoMode).toBe(true);
    expect(s.scanLamp).toBe(true);
    expect(s.ars).toBe(true);
    expect(s.dtmfSpeed).toBe(true);
    expect(s.dtmfMode).toBe(true);
  });

  it('parses scan_settings byte-B bitfield (busy_led, bclo, beep_edge)', () => {
    const img = makeImage();
    img[FT70_ADDR_SCAN_SETTINGS + 27] = 0b1001_1000; // busy_led=1, bclo=1, beep_edge=1
    const s = parseFt70Settings(img)!;
    expect(s.busyLed).toBe(true);
    expect(s.bclo).toBe(true);
    expect(s.beepEdge).toBe(true);
  });

  it('parses MYCALL stopping at 0xFF padding', () => {
    const img = makeImage();
    const cs = 'KK7DS';
    for (let i = 0; i < cs.length; i++) img[FT70_ADDR_MYCALL + i] = cs.charCodeAt(i);
    expect(parseFt70Settings(img)!.myCall).toBe('KK7DS');
  });

  it('parses digital popup special mapping (0 = Off, else raw-9)', () => {
    const img = makeImage();
    expect(parseFt70Settings(img)!.digitalPopup).toBe(0);
    img[FT70_ADDR_DIGITAL_SETTINGS_MORE + 7] = 0x12; // 18 -> index 9 ("Continuous")
    expect(parseFt70Settings(img)!.digitalPopup).toBe(9);
  });

  it('parses digital_settings ams_tx_mode / standby_beep / dg_id / vw_mode', () => {
    const img = makeImage();
    img[FT70_ADDR_DIGITAL_SETTINGS] = 2; // ams_tx_mode
    img[FT70_ADDR_DIGITAL_SETTINGS + 2] = 1; // standby_beep
    img[FT70_ADDR_DIGITAL_SETTINGS + 6] = 42; // rx_dg_id
    img[FT70_ADDR_DIGITAL_SETTINGS + 7] = 24; // tx_dg_id
    img[FT70_ADDR_DIGITAL_SETTINGS + 8] = 1; // vw_mode
    const s = parseFt70Settings(img)!;
    expect(s.amsTxMode).toBe(2);
    expect(s.standbyBeep).toBe(true);
    expect(s.rxDgId).toBe(42);
    expect(s.txDgId).toBe(24);
    expect(s.vwMode).toBe(true);
  });

  it('clamps out-of-range values to valid maximums', () => {
    const img = makeImage();
    img[FT70_ADDR_SCAN_SETTINGS + 13] = 255; // rxSave max 36
    img[FT70_ADDR_FIRST_SETTINGS + 3] = 255 & 0x1f; // apo masked to 5 bits anyway (max 31 -> clamp 24)
    const s = parseFt70Settings(img)!;
    expect(s.rxSave).toBe(36);
    expect(s.apo).toBe(24);
  });
});

describe('writeFt70Settings', () => {
  it('no-ops silently on an undersized image', () => {
    expect(() => writeFt70Settings(new Uint8Array(0), { squelch: 5 })).not.toThrow();
  });

  it('writes squelch without disturbing the high nibble', () => {
    const img = makeImage();
    img[FT70_ADDR_SQUELCH] = 0xa0;
    writeFt70Settings(img, { squelch: 9 });
    expect(img[FT70_ADDR_SQUELCH]).toBe(0xa9);
  });

  it('writes volume into low 5 bits, preserving unknown bits', () => {
    const img = makeImage();
    img[FT70_ADDR_SCAN_SETTINGS_2] = 0xc0;
    writeFt70Settings(img, { volume: 31 });
    expect(img[FT70_ADDR_SCAN_SETTINGS_2]).toBe(0xc0 | 31);
  });

  it('writes boolean bitfield fields without disturbing siblings', () => {
    const img = makeImage();
    writeFt70Settings(img, { vfoMode: true, scanLamp: true });
    expect(img[FT70_ADDR_SCAN_SETTINGS + 26]).toBe(0b1010_0000);
    writeFt70Settings(img, { vfoMode: false });
    expect(img[FT70_ADDR_SCAN_SETTINGS + 26]).toBe(0b0010_0000); // scanLamp untouched
  });

  it('writes MYCALL 0xFF-padded to 10 bytes, uppercased', () => {
    const img = makeImage();
    writeFt70Settings(img, { myCall: 'kk7ds' });
    expect(parseFt70Settings(img)!.myCall).toBe('KK7DS');
    expect(img[FT70_ADDR_MYCALL + 5]).toBe(0xff);
  });

  it('writes digitalPopup using the 0/raw-9 mapping', () => {
    const img = makeImage();
    writeFt70Settings(img, { digitalPopup: 0 });
    expect(img[FT70_ADDR_DIGITAL_SETTINGS_MORE + 7]).toBe(0);
    writeFt70Settings(img, { digitalPopup: 9 });
    expect(img[FT70_ADDR_DIGITAL_SETTINGS_MORE + 7]).toBe(18);
  });

  it('writes opening message text and mode', () => {
    const img = makeImage();
    writeFt70Settings(img, { openingMessageMode: 2, openingMessageText: 'HELLO' });
    const s = parseFt70Settings(img)!;
    expect(s.openingMessageMode).toBe(2);
    expect(s.openingMessageText).toBe('HELLO');
    expect(img[FT70_ADDR_OPENING_MESSAGE + 4 + 5]).toBe(0xff); // padded
  });

  it('does not modify bytes for unspecified fields', () => {
    const img = makeImage();
    img[FT70_ADDR_SCAN_SETTINGS + 9] = 0x42; // mic_gain byte
    writeFt70Settings(img, { squelch: 3 });
    expect(img[FT70_ADDR_SCAN_SETTINGS + 9]).toBe(0x42);
  });

  it('clamps written values to valid ranges', () => {
    const img = makeImage();
    writeFt70Settings(img, { apo: 99, tot: 99, rxSave: 99 });
    expect(img[FT70_ADDR_FIRST_SETTINGS + 3] & 0x1f).toBe(24);
    expect(img[FT70_ADDR_SCAN_SETTINGS + 22]).toBe(20);
    expect(img[FT70_ADDR_SCAN_SETTINGS + 13]).toBe(36);
  });
});

describe('round-trip', () => {
  it('parse -> write -> parse yields identical result', () => {
    const img = makeImage();
    img[FT70_ADDR_SQUELCH] = 5;
    img[FT70_ADDR_SCAN_SETTINGS_2] = 12;
    img[FT70_ADDR_FIRST_SETTINGS + 3] = 8; // apo
    img[FT70_ADDR_SCAN_SETTINGS + 26] = 0b1010_1101; // byte A
    img[FT70_ADDR_SCAN_SETTINGS + 27] = 0b1001_1000; // byte B
    const cs = 'N0CALL';
    for (let i = 0; i < cs.length; i++) img[FT70_ADDR_MYCALL + i] = cs.charCodeAt(i);
    img[FT70_ADDR_DIGITAL_SETTINGS_MORE + 7] = 0x0a; // digital popup raw

    const parsed1 = parseFt70Settings(img)!;
    const img2 = makeImage();
    writeFt70Settings(img2, parsed1);
    const parsed2 = parseFt70Settings(img2)!;
    expect(parsed2).toEqual(parsed1);
  });
});
