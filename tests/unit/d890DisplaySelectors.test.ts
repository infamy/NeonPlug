import { describe, it, expect } from 'vitest';
import {
  imageDisplayState,
  POWER_ON_INTERFACE,
  STANDBY_BK_PICTURE,
} from '../../src/radios/d890uv/displaySelectors';
import { D890_SETTINGS_FIELDS } from '../../src/radios/d890uv/settingsMap';
import {
  parseDigitalContactHeader,
  encodeDigitalContactHeader,
} from '../../src/radios/d890uv/digitalContacts';

describe('DA-7X2 picture display selectors', () => {
  /**
   * The constants and the settings map have to agree. They are written in two
   * places because one is a byte map and the other is meaning, and a renamed
   * or reordered option list would otherwise leave the badges confidently wrong.
   */
  it('matches the option lists in the settings map', () => {
    const iface = D890_SETTINGS_FIELDS.find((f) => f.key === 'powerOnInterface');
    expect(iface?.options?.[POWER_ON_INTERFACE.CUSTOM_PICTURE]).toBe('Custom Picture');
    expect(iface?.options?.[POWER_ON_INTERFACE.CUSTOM_CHAR]).toBe('Custom Char');

    const bk = D890_SETTINGS_FIELDS.find((f) => f.key === 'standbyBkPicture');
    expect(bk?.options?.[STANDBY_BK_PICTURE.DEFAULT]).toBe('Default');
    expect(bk?.options?.[STANDBY_BK_PICTURE.CUSTOM_1]).toBe('Custom1');
    expect(bk?.options?.[STANDBY_BK_PICTURE.CUSTOM_2]).toBe('Custom2');
    // Sweep-verified: rdt 0x011a6 wrote 00 -> 02 for Default -> Custom2.
    expect(bk?.offset).toBe(0x0c1);
  });

  /**
   * The distinction that matters most. Before a read there are no settings, and
   * rendering that as "Not shown" tells someone their picture is disabled when
   * in truth nothing has been read yet.
   */
  it('reports unknown rather than not-shown when settings are missing', () => {
    expect(imageDisplayState('boot', undefined)).toBeNull();
    expect(imageDisplayState('boot', {})).toBeNull();
    expect(imageDisplayState('bk1', {})).toBeNull();
    // Present but not a number is still unknown, not false.
    expect(imageDisplayState('boot', { powerOnInterface: 'Custom Picture' })).toBeNull();
  });

  it('shows the boot picture only when Power-on Interface selects it', () => {
    const at = (v: number) => imageDisplayState('boot', { powerOnInterface: v });
    expect(at(POWER_ON_INTERFACE.CUSTOM_PICTURE)?.shown).toBe(true);
    expect(at(POWER_ON_INTERFACE.CUSTOM_PICTURE)?.reason).toBeNull();
    expect(at(POWER_ON_INTERFACE.CUSTOM_CHAR)?.shown).toBe(false);
    expect(at(POWER_ON_INTERFACE.CUSTOM_CHAR)?.reason).toMatch(/text is shown instead/);
    expect(at(POWER_ON_INTERFACE.DEFAULT)?.shown).toBe(false);
  });

  it('maps Custom1 to bk1 and Custom2 to bk2, never both at once', () => {
    for (const value of [
      STANDBY_BK_PICTURE.DEFAULT,
      STANDBY_BK_PICTURE.CUSTOM_1,
      STANDBY_BK_PICTURE.CUSTOM_2,
    ]) {
      const shown = (['bk1', 'bk2'] as const).filter(
        (k) => imageDisplayState(k, { standbyBkPicture: value })?.shown
      );
      expect(shown.length).toBeLessThanOrEqual(1);
    }
    expect(imageDisplayState('bk1', { standbyBkPicture: STANDBY_BK_PICTURE.CUSTOM_1 })?.shown)
      .toBe(true);
    expect(imageDisplayState('bk2', { standbyBkPicture: STANDBY_BK_PICTURE.CUSTOM_2 })?.shown)
      .toBe(true);
    expect(imageDisplayState('bk2', { standbyBkPicture: STANDBY_BK_PICTURE.CUSTOM_1 })?.shown)
      .toBe(false);
  });

  it('points at the setting that decides, not a generic one', () => {
    expect(imageDisplayState('boot', { powerOnInterface: 0 })?.setting).toBe('Power-on Interface');
    expect(imageDisplayState('bk1', { standbyBkPicture: 0 })?.setting).toBe('Standby BK Picture');
  });
});

describe('DA-7X2 digital contact header', () => {
  /** The exact 16 bytes the vendor CPS read at 0x07000000 before walking the banks. */
  const REAL = Uint8Array.from([
    0x8b, 0x7e, 0x02, 0x00, 0x1c, 0x1e, 0x20, 0x0a,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  ]);

  it('reads the captured count and end pointer', () => {
    const h = parseDigitalContactHeader(REAL);
    expect(h?.count).toBe(163467);
    expect(h?.endAddress).toBe(0x0a201e1c);
  });

  /**
   * The end pointer is what let this be identified at all: it predicts the
   * CPS's final read length exactly, so a regression that swapped endianness
   * or treated it as a LENGTH would break this arithmetic.
   */
  it('predicts the tail read the CPS actually performed', () => {
    const h = parseDigitalContactHeader(REAL)!;
    const offsetInTail = h.endAddress - 0xa200000;
    expect(offsetInTail).toBe(7708);
    expect(Math.ceil(offsetInTail / 16) * 16).toBe(7712);
  });

  it('refuses erased flash rather than reporting four billion contacts', () => {
    expect(parseDigitalContactHeader(new Uint8Array(16).fill(0xff))).toBeNull();
    // An end pointer below the first bank cannot be one.
    const bogus = Uint8Array.from(REAL);
    bogus.set([0x00, 0x00, 0x00, 0x00], 4);
    bogus.set([0x10, 0x00, 0x00, 0x00], 4);
    expect(parseDigitalContactHeader(bogus)).toBeNull();
  });

  it('round-trips, and leaves the bytes past the two fields alone', () => {
    const original = Uint8Array.from(REAL);
    original[12] = 0xa5;
    const out = encodeDigitalContactHeader(original, { count: 42, endAddress: 0x7900100 });
    expect(parseDigitalContactHeader(out)).toEqual({ count: 42, endAddress: 0x7900100 });
    expect(out[12]).toBe(0xa5);
    expect(encodeDigitalContactHeader(REAL, parseDigitalContactHeader(REAL)!)).toEqual(REAL);
  });
});
