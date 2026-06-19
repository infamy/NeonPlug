import { describe, it, expect } from 'vitest';
import { parseFt65Settings, writeFt65Settings } from '../../src/radios/ft65/settingsFormat';
import { FT65_ADDR_SETTINGS } from '../../src/radios/ft65/constants';

const OFF = FT65_ADDR_SETTINGS; // 0x2000

function makeImage(): Uint8Array {
  return new Uint8Array(OFF + 64);
}

// ── parseFt65Settings ──────────────────────────────────────────────────────

describe('parseFt65Settings', () => {
  it('returns null when image is too small', () => {
    expect(parseFt65Settings(new Uint8Array(0))).toBeNull();
    expect(parseFt65Settings(new Uint8Array(OFF + 10))).toBeNull();
  });

  it('parses all-zero block to safe defaults', () => {
    const s = parseFt65Settings(makeImage())!;
    expect(s.apo).toBe(0);
    expect(s.beep).toBe(0);
    expect(s.bclo).toBe(false);
    expect(s.txLed).toBe(false);
    expect(s.cwId).toBe('');
    expect(s.passwd).toBe('0000');
    expect(s.tot).toBe(0);
    expect(s.usePasswd).toBe(false);
  });

  it('parses scalar settings at correct byte offsets', () => {
    const img = makeImage();
    img[OFF + 0x00] = 12;  // apo
    img[OFF + 0x03] = 3;   // battSave
    img[OFF + 0x05] = 2;   // beep
    img[OFF + 0x06] = 4;   // bell
    img[OFF + 0x14] = 1;   // keyLock
    img[OFF + 0x15] = 3;   // lamp
    img[OFF + 0x18] = 2;   // moniTcall
    img[OFF + 0x1A] = 1;   // scanResume
    img[OFF + 0x1B] = 5;   // rfSquelch
    img[OFF + 0x27] = 20;  // tot
    const s = parseFt65Settings(img)!;
    expect(s.apo).toBe(12);
    expect(s.battSave).toBe(3);
    expect(s.beep).toBe(2);
    expect(s.bell).toBe(4);
    expect(s.keyLock).toBe(1);
    expect(s.lamp).toBe(3);
    expect(s.moniTcall).toBe(2);
    expect(s.scanResume).toBe(1);
    expect(s.rfSquelch).toBe(5);
    expect(s.tot).toBe(20);
  });

  it('parses boolean flags correctly', () => {
    const img = makeImage();
    img[OFF + 0x04] = 1;   // bclo
    img[OFF + 0x13] = 1;   // edgBeep
    img[OFF + 0x16] = 1;   // txLed
    img[OFF + 0x17] = 1;   // bsyLed
    img[OFF + 0x19] = 1;   // priRvt
    img[OFF + 0x1C] = 1;   // scanLamp
    img[OFF + 0x1E] = 1;   // useCwid
    img[OFF + 0x1F] = 1;   // compander
    img[OFF + 0x21] = 1;   // txSave
    img[OFF + 0x22] = 1;   // vfoSpl
    img[OFF + 0x23] = 1;   // vox
    img[OFF + 0x24] = 1;   // wfmRcv
    img[OFF + 0x26] = 1;   // wxAlert
    img[OFF + 0x30] = 1;   // usePasswd
    const s = parseFt65Settings(img)!;
    expect(s.bclo).toBe(true);
    expect(s.edgBeep).toBe(true);
    expect(s.txLed).toBe(true);
    expect(s.bsyLed).toBe(true);
    expect(s.priRvt).toBe(true);
    expect(s.scanLamp).toBe(true);
    expect(s.useCwid).toBe(true);
    expect(s.compander).toBe(true);
    expect(s.txSave).toBe(true);
    expect(s.vfoSpl).toBe(true);
    expect(s.vox).toBe(true);
    expect(s.wfmRcv).toBe(true);
    expect(s.wxAlert).toBe(true);
    expect(s.usePasswd).toBe(true);
  });

  it('parses CW ID (6-byte ASCII, space-padded)', () => {
    const img = makeImage();
    // 'VE2XY ' — trailing space should be trimmed
    img[OFF + 0x07] = 0x56; // 'V'
    img[OFF + 0x08] = 0x45; // 'E'
    img[OFF + 0x09] = 0x32; // '2'
    img[OFF + 0x0A] = 0x58; // 'X'
    img[OFF + 0x0B] = 0x59; // 'Y'
    img[OFF + 0x0C] = 0x20; // ' ' (padding)
    expect(parseFt65Settings(img)!.cwId).toBe('VE2XY');
  });

  it('stops CW ID parsing at null byte', () => {
    const img = makeImage();
    img[OFF + 0x07] = 0x41; // 'A'
    img[OFF + 0x08] = 0x00; // null — terminates here
    img[OFF + 0x09] = 0x42; // 'B' — should not appear
    expect(parseFt65Settings(img)!.cwId).toBe('A');
  });

  it('parses password digits', () => {
    const img = makeImage();
    img[OFF + 0x31] = 0x39; // '9'
    img[OFF + 0x32] = 0x38; // '8'
    img[OFF + 0x33] = 0x37; // '7'
    img[OFF + 0x34] = 0x36; // '6'
    expect(parseFt65Settings(img)!.passwd).toBe('9876');
  });

  it('replaces non-digit password bytes with 0', () => {
    const img = makeImage();
    img[OFF + 0x31] = 0x41; // 'A' → '0'
    img[OFF + 0x32] = 0x35; // '5' → ok
    img[OFF + 0x33] = 0xFF; // invalid → '0'
    img[OFF + 0x34] = 0x31; // '1' → ok
    expect(parseFt65Settings(img)!.passwd).toBe('0501');
  });

  it('clamps out-of-range values to valid maximums', () => {
    const img = makeImage();
    img[OFF + 0x00] = 255;  // apo max 24
    img[OFF + 0x27] = 255;  // tot max 30
    img[OFF + 0x01] = 255;  // artsBeep max 2
    img[OFF + 0x1B] = 255;  // rfSquelch max 8
    const s = parseFt65Settings(img)!;
    expect(s.apo).toBe(24);
    expect(s.tot).toBe(30);
    expect(s.artsBeep).toBe(2);
    expect(s.rfSquelch).toBe(8);
  });
});

// ── writeFt65Settings ──────────────────────────────────────────────────────

describe('writeFt65Settings', () => {
  it('no-ops silently on an undersized image', () => {
    expect(() => writeFt65Settings(new Uint8Array(0), { apo: 5 })).not.toThrow();
  });

  it('writes scalar fields to correct byte offsets', () => {
    const img = makeImage();
    writeFt65Settings(img, { apo: 8, tot: 15, beep: 1, rfSquelch: 3 });
    expect(img[OFF + 0x00]).toBe(8);
    expect(img[OFF + 0x27]).toBe(15);
    expect(img[OFF + 0x05]).toBe(1);
    expect(img[OFF + 0x1B]).toBe(3);
  });

  it('writes boolean fields as 0/1', () => {
    const img = makeImage();
    writeFt65Settings(img, { bclo: true, txLed: false, vox: true, scanLamp: false });
    expect(img[OFF + 0x04]).toBe(1);
    expect(img[OFF + 0x16]).toBe(0);
    expect(img[OFF + 0x23]).toBe(1);
    expect(img[OFF + 0x1C]).toBe(0);
  });

  it('writes CW ID space-padded to 6 bytes', () => {
    const img = makeImage();
    writeFt65Settings(img, { cwId: 'AB' });
    expect(img[OFF + 0x07]).toBe(0x41); // 'A'
    expect(img[OFF + 0x08]).toBe(0x42); // 'B'
    expect(img[OFF + 0x09]).toBe(0x20); // space pad
    expect(img[OFF + 0x0C]).toBe(0x20); // space pad
  });

  it('truncates CW ID beyond 6 chars', () => {
    const img = makeImage();
    writeFt65Settings(img, { cwId: 'ABCDEFGH' });
    // Only first 6 bytes written
    expect(img[OFF + 0x07]).toBe(0x41); // 'A'
    expect(img[OFF + 0x0C]).toBe(0x46); // 'F' (6th char)
  });

  it('writes password digits', () => {
    const img = makeImage();
    writeFt65Settings(img, { passwd: '5678' });
    expect(img[OFF + 0x31]).toBe(0x35); // '5'
    expect(img[OFF + 0x32]).toBe(0x36); // '6'
    expect(img[OFF + 0x33]).toBe(0x37); // '7'
    expect(img[OFF + 0x34]).toBe(0x38); // '8'
  });

  it('does not modify bytes for unspecified fields', () => {
    const img = makeImage();
    img[OFF + 0x10] = 0x42; // dtmfMode byte
    img[OFF + 0x15] = 0x77; // lamp byte
    writeFt65Settings(img, { apo: 3 });
    expect(img[OFF + 0x10]).toBe(0x42);
    expect(img[OFF + 0x15]).toBe(0x77);
  });

  it('clamps written values to valid ranges', () => {
    const img = makeImage();
    writeFt65Settings(img, { apo: 99, tot: 99, rfSquelch: 99 });
    expect(img[OFF + 0x00]).toBe(24);
    expect(img[OFF + 0x27]).toBe(30);
    expect(img[OFF + 0x1B]).toBe(8);
  });
});

// ── round-trip ────────────────────────────────────────────────────────────

describe('round-trip', () => {
  it('parse → write → parse yields identical result', () => {
    const img = makeImage();
    img[OFF + 0x00] = 7;    // apo
    img[OFF + 0x05] = 1;    // beep
    img[OFF + 0x04] = 1;    // bclo
    img[OFF + 0x07] = 0x56; img[OFF + 0x08] = 0x45; img[OFF + 0x09] = 0x32; // cwId 'VE2'
    img[OFF + 0x14] = 2;    // keyLock
    img[OFF + 0x16] = 1;    // txLed
    img[OFF + 0x23] = 1;    // vox
    img[OFF + 0x27] = 15;   // tot
    img[OFF + 0x30] = 1;    // usePasswd
    img[OFF + 0x31] = 0x39; img[OFF + 0x32] = 0x38; img[OFF + 0x33] = 0x37; img[OFF + 0x34] = 0x36;

    const parsed1 = parseFt65Settings(img)!;
    const img2 = makeImage();
    writeFt65Settings(img2, parsed1);
    const parsed2 = parseFt65Settings(img2)!;
    expect(parsed2).toEqual(parsed1);
  });
});
