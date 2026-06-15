import { describe, it, expect } from 'vitest';
import {
  parseUv5rMiniSettings,
  writeUv5rMiniSettings,
  UV5RMINI_SETTINGS_OFFSET,
} from '../../src/radios/uv5rmini/settingsFormat';

const OFF = UV5RMINI_SETTINGS_OFFSET; // 0x8040

function makeImage(): Uint8Array {
  return new Uint8Array(OFF + 64);
}

// ── parseUv5rMiniSettings ─────────────────────────────────────────────────

describe('parseUv5rMiniSettings', () => {
  it('returns null when image is too small', () => {
    expect(parseUv5rMiniSettings(new Uint8Array(0))).toBeNull();
    expect(parseUv5rMiniSettings(new Uint8Array(OFF + 10))).toBeNull();
  });

  it('parses all-zero block to safe defaults', () => {
    const s = parseUv5rMiniSettings(makeImage())!;
    expect(s.squelch).toBe(0);
    expect(s.tot).toBe(0);
    expect(s.beep).toBe(0);
    expect(s.voicesw).toBe(false);
    expect(s.roger).toBe(false);
    expect(s.aOrB).toBe(0);
    expect(s.chaworkmode).toBe(0);
    expect(s.chbworkmode).toBe(0);
  });

  it('parses byte-mapped scalar fields at correct offsets', () => {
    const img = makeImage();
    img[OFF + 0]  = 4;  // squelch
    img[OFF + 1]  = 1;  // savemode
    img[OFF + 2]  = 5;  // vox
    img[OFF + 3]  = 2;  // backlight
    img[OFF + 4]  = 1;  // dualstandby
    img[OFF + 5]  = 8;  // tot
    img[OFF + 6]  = 1;  // beep
    img[OFF + 8]  = 1;  // voice
    img[OFF + 9]  = 2;  // sidetone
    img[OFF + 10] = 1;  // scanmode
    img[OFF + 11] = 3;  // pttid
    img[OFF + 12] = 5;  // pttdly
    img[OFF + 13] = 2;  // chadistype
    img[OFF + 14] = 1;  // chbdistype
    img[OFF + 17] = 2;  // alarmmode
    img[OFF + 21] = 3;  // rpttailclear
    img[OFF + 22] = 4;  // rpttaildet
    img[OFF + 28] = 1;  // powerondistype
    img[OFF + 32] = 7;  // voxdlytime
    img[OFF + 33] = 5;  // menuquittime
    img[OFF + 40] = 6;  // totalarm
    img[OFF + 43] = 2;  // ctsdcsscantype
    img[OFF + 57] = 3;  // hangup
    const s = parseUv5rMiniSettings(img)!;
    expect(s.squelch).toBe(4);
    expect(s.savemode).toBe(1);
    expect(s.vox).toBe(5);
    expect(s.backlight).toBe(2);
    expect(s.dualstandby).toBe(1);
    expect(s.tot).toBe(8);
    expect(s.beep).toBe(1);
    expect(s.voice).toBe(1);
    expect(s.sidetone).toBe(2);
    expect(s.scanmode).toBe(1);
    expect(s.pttid).toBe(3);
    expect(s.pttdly).toBe(5);
    expect(s.chadistype).toBe(2);
    expect(s.chbdistype).toBe(1);
    expect(s.alarmmode).toBe(2);
    expect(s.rpttailclear).toBe(3);
    expect(s.rpttaildet).toBe(4);
    expect(s.powerondistype).toBe(1);
    expect(s.voxdlytime).toBe(7);
    expect(s.menuquittime).toBe(5);
    expect(s.totalarm).toBe(6);
    expect(s.ctsdcsscantype).toBe(2);
    expect(s.hangup).toBe(3);
  });

  it('parses boolean flags', () => {
    const img = makeImage();
    img[OFF + 7]  = 1;  // voicesw
    img[OFF + 15] = 1;  // bcl
    img[OFF + 16] = 1;  // autolock
    img[OFF + 18] = 1;  // alarmtone
    img[OFF + 20] = 1;  // tailclear
    img[OFF + 23] = 1;  // roger
    img[OFF + 25] = 1;  // fmenable
    img[OFF + 27] = 1;  // keylock
    img[OFF + 36] = 1;  // dispani
    img[OFF + 58] = 1;  // voxsw
    img[OFF + 61] = 1;  // inputdtmf
    const s = parseUv5rMiniSettings(img)!;
    expect(s.voicesw).toBe(true);
    expect(s.bcl).toBe(true);
    expect(s.autolock).toBe(true);
    expect(s.alarmtone).toBe(true);
    expect(s.tailclear).toBe(true);
    expect(s.roger).toBe(true);
    expect(s.fmenable).toBe(true);
    expect(s.keylock).toBe(true);
    expect(s.dispani).toBe(true);
    expect(s.voxsw).toBe(true);
    expect(s.inputdtmf).toBe(true);
  });

  it('decodes chaworkmode / chbworkmode from packed nibbles', () => {
    const img = makeImage();
    img[OFF + 26] = (1 << 4) | 0;   // chaworkmode=Channel(1), chbworkmode=Frequency(0)
    const s = parseUv5rMiniSettings(img)!;
    expect(s.chaworkmode).toBe(1);
    expect(s.chbworkmode).toBe(0);

    const img2 = makeImage();
    img2[OFF + 26] = (0 << 4) | 1;  // chaworkmode=Frequency(0), chbworkmode=Channel(1)
    const s2 = parseUv5rMiniSettings(img2)!;
    expect(s2.chaworkmode).toBe(0);
    expect(s2.chbworkmode).toBe(1);
  });

  it('parses aOrB as 0 or 1', () => {
    const img = makeImage();
    img[OFF + 24] = 0;
    expect(parseUv5rMiniSettings(img)!.aOrB).toBe(0);
    img[OFF + 24] = 5;  // any non-zero → 1
    expect(parseUv5rMiniSettings(img)!.aOrB).toBe(1);
  });

  it('clamps out-of-range values', () => {
    const img = makeImage();
    img[OFF + 0] = 255;   // squelch max 5
    img[OFF + 5] = 255;   // tot max 12
    img[OFF + 11] = 255;  // pttid max 3
    const s = parseUv5rMiniSettings(img)!;
    expect(s.squelch).toBe(5);
    expect(s.tot).toBe(12);
    expect(s.pttid).toBe(3);
  });
});

// ── writeUv5rMiniSettings ─────────────────────────────────────────────────

describe('writeUv5rMiniSettings', () => {
  it('no-ops silently on an undersized image', () => {
    expect(() => writeUv5rMiniSettings(new Uint8Array(0), { squelch: 3 })).not.toThrow();
  });

  it('writes scalar fields to correct byte offsets', () => {
    const img = makeImage();
    writeUv5rMiniSettings(img, { squelch: 4, tot: 6, beep: 1, sidetone: 2 });
    expect(img[OFF + 0]).toBe(4);
    expect(img[OFF + 5]).toBe(6);
    expect(img[OFF + 6]).toBe(1);
    expect(img[OFF + 9]).toBe(2);
  });

  it('writes boolean fields as 0/1', () => {
    const img = makeImage();
    writeUv5rMiniSettings(img, { voicesw: true, roger: false, keylock: true, voxsw: false });
    expect(img[OFF + 7]).toBe(1);
    expect(img[OFF + 23]).toBe(0);
    expect(img[OFF + 27]).toBe(1);
    expect(img[OFF + 58]).toBe(0);
  });

  it('packs chaworkmode / chbworkmode into nibbles of byte 26', () => {
    const img = makeImage();
    writeUv5rMiniSettings(img, { chaworkmode: 1, chbworkmode: 0 });
    expect(img[OFF + 26]).toBe((1 << 4) | 0);
  });

  it('preserves the other nibble when only one workmode is set', () => {
    const img = makeImage();
    img[OFF + 26] = (1 << 4) | 1; // both Channel
    writeUv5rMiniSettings(img, { chaworkmode: 0 }); // change only A
    expect(img[OFF + 26]).toBe((0 << 4) | 1); // B stays Channel
  });

  it('does not modify bytes for unspecified fields', () => {
    const img = makeImage();
    img[OFF + 10] = 0x55;  // scanmode
    img[OFF + 17] = 0x77;  // alarmmode
    writeUv5rMiniSettings(img, { squelch: 2 });
    expect(img[OFF + 10]).toBe(0x55);
    expect(img[OFF + 17]).toBe(0x77);
  });
});

// ── round-trip ────────────────────────────────────────────────────────────

describe('round-trip', () => {
  it('parse → write → parse yields identical result', () => {
    const img = makeImage();
    img[OFF + 0]  = 3;  // squelch
    img[OFF + 5]  = 8;  // tot
    img[OFF + 6]  = 1;  // beep
    img[OFF + 7]  = 1;  // voicesw
    img[OFF + 9]  = 2;  // sidetone
    img[OFF + 23] = 1;  // roger
    img[OFF + 24] = 0;  // aOrB = A
    img[OFF + 26] = (1 << 4) | 1; // both workmode=Channel
    img[OFF + 27] = 1;  // keylock
    img[OFF + 57] = 4;  // hangup

    const parsed1 = parseUv5rMiniSettings(img)!;
    const img2 = makeImage();
    writeUv5rMiniSettings(img2, parsed1);
    const parsed2 = parseUv5rMiniSettings(img2)!;
    expect(parsed2).toEqual(parsed1);
  });
});
