import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { D890_SETTINGS_FIELDS } from '../../src/radios/d890uv/settingsMap';

/**
 * Option lists that are verbatim CPS vocabulary, locked against drift.
 *
 * The vendor CPS keeps every dropdown string in `language/english.ini`, in
 * per-dialog blocks, with each control's options as a consecutive run. Checking
 * our lists against it found three that contained strings the CPS has never
 * displayed anywhere — `Current Slot`, `2.5K`, `Channel A Fixed Time Slot1` —
 * all paraphrased or borrowed from a sibling model.
 *
 * `simpRepeaterSlot` was the worst: all THREE labels were wrong, so choosing
 * "Slot 1" wrote 0, which is Channel Slot.
 *
 * The vendor file is not committed; the fixture records only which field matched
 * which ini key and the strings we therefore claim. That is enough to fail if
 * somebody replaces a verified label with a plausible-sounding paraphrase.
 */
const fixture = JSON.parse(
  readFileSync(new URL('../fixtures/d890uv/ini-confirmed-options.json', import.meta.url), 'utf8')
) as { confirmed: Record<string, { iniKey: number; options: string[] }> };

describe('DA-7X2 option lists that came from the CPS language file', () => {
  const entries = Object.entries(fixture.confirmed);

  it('pins a meaningful number of lists', () => {
    expect(entries.length).toBeGreaterThanOrEqual(11);
  });

  it.each(entries)('%s still matches the CPS strings verbatim', (key, rec) => {
    const field = D890_SETTINGS_FIELDS.find((f) => f.key === key);
    expect(field, `${key} disappeared from the settings map`).toBeDefined();
    expect(field!.options, `${key} lost its option list`).toBeDefined();
    // Exact, including spacing and case: these are the CPS's own words, and
    // "Slot 1" vs "Slot1" is precisely the difference that flagged a bad list.
    expect(field!.options).toEqual(rec.options);
  });

  /**
   * ⚠️ There is deliberately NO "these strings are fake" assertion here.
   *
   * One was written on 2026-09-08 banning `Current Slot`, `2.5K` and
   * `Channel A Fixed Time Slot1`, on the reasoning that a string absent from
   * english.ini could not be real. That reasoning is wrong: the CPS was observed
   * the same day displaying `Slot 1` and `2.5K`, neither of which is in the file.
   * Some option strings are generated rather than stored.
   *
   * So only POSITIVE evidence counts — an exact consecutive run — and this file
   * asserts nothing about lists that lack one.
   */
});
