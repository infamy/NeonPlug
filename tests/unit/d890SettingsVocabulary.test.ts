import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { D890_SETTINGS_FIELDS } from '../../src/radios/d890uv/settingsMap';

/**
 * Every declared field must be able to REPRESENT what a real radio holds.
 *
 * Two shipped bugs of exactly this shape were found on 2026-09-07, both by
 * hand: `btPttHold` at 0x0f0 declared ['Off','On'] over a byte holding 0xFF,
 * and `btOnOff` at 0x0b1 declared ['Off','On'] over a byte holding 0x02. Both
 * rendered as CHECKBOXES, because the Settings profile turns max <= 1 into one
 * — so saving any unrelated setting wrote 0 or 1 over a value the user never
 * touched, silently.
 *
 * The cause is structural rather than careless: only one of the vendor CPS's
 * thirteen dialogs was ever swept, so many option lists are asserted from a
 * marshaller name rather than measured. This test makes the radio itself
 * arbitrate — a real dump cannot be argued with.
 *
 * A failure here does NOT mean the offset is wrong. It means the vocabulary is
 * too narrow for the byte, and the fix is usually to drop the invented
 * `options`/`listLength` rather than to move the field.
 */
const settings = new Uint8Array(
  readFileSync(new URL('../fixtures/d890uv/settings.bin', import.meta.url))
);

describe('DA-7X2 settings vocabulary vs a real radio', () => {
  it('has a fixture covering the whole settings block', () => {
    expect(settings.length).toBeGreaterThanOrEqual(0x15a);
  });

  it('declares no field too narrow for the byte the radio actually holds', () => {
    const tooNarrow: string[] = [];
    for (const f of D890_SETTINGS_FIELDS) {
      const value = settings[f.offset];
      if (value === undefined) continue;
      // 0xFF is also erased flash, so it is reported rather than excused: a
      // field sitting on a byte that reads erased is itself worth knowing about.
      const ceiling = f.options
        ? f.options.length - 1
        : f.listLength !== undefined
          ? f.listLength - 1
          : f.max;
      if (value > ceiling) {
        tooNarrow.push(
          `${f.key} @0x${f.offset.toString(16)} holds 0x${value.toString(16)} ` +
            `but declares max ${ceiling}` +
            (ceiling <= 1 ? ' (renders as a CHECKBOX — writes 0/1 over it)' : '')
        );
      }
    }
    expect(tooNarrow).toEqual([]);
  });

  /**
   * The narrower, sharper version: a checkbox is the dangerous case, because it
   * cannot even express the value it is shown, so round-tripping it corrupts.
   */
  it('renders nothing as a checkbox whose byte is not 0 or 1', () => {
    const bad = D890_SETTINGS_FIELDS.filter((f) => {
      const v = settings[f.offset];
      return f.max <= 1 && v !== undefined && v > 1;
    }).map((f) => `${f.key} @0x${f.offset.toString(16)} = 0x${settings[f.offset]!.toString(16)}`);
    expect(bad).toEqual([]);
  });
});
