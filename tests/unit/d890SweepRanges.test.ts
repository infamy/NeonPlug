import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { D890_SETTINGS_FIELDS } from '../../src/radios/d890uv/settingsMap';

/**
 * Declared ranges against values the vendor CPS is KNOWN to write.
 *
 * `d890SettingsVocabulary.test.ts` checks fields against one real radio dump.
 * That misses an entire class: a field whose byte happens never to vary across
 * every capture we own always looks in-range, however wrong its declared range
 * is. `groupCallHoldTime` was exactly that — the radio holds 5, well inside a
 * 32-entry list, while the CPS demonstrably writes 32 for "Infinite", which the
 * list could not represent at all.
 *
 * The sweep closes the gap: one control changed at a time in the vendor CPS,
 * the saved .rdt diffed, and the resulting byte recorded. Those are values the
 * CPS produces, not values we happened to observe.
 *
 * MATCHING IS BEST-EFFORT AND DELIBERATELY SO. Sweep labels come from OCR and
 * several are clipped ("ddress Book Is Sent With Its") or abbreviated relative
 * to `cpsLabel`. A missed match costs a check; a WRONG match would fail the
 * build over a comparison between two unrelated fields, so the matcher is
 * conservative and unmatched rows are reported rather than forced.
 */
const sweep = JSON.parse(
  readFileSync(new URL('../fixtures/d890uv/sweep-verified-bytes.json', import.meta.url), 'utf8')
) as { rows: { label: string; tab: string; before: number; after: number }[] };

/** Normalise for comparison: OCR drops characters and abbreviates freely. */
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

describe('DA-7X2 declared ranges vs sweep-verified CPS values', () => {
  it('pins a meaningful number of sweep rows', () => {
    expect(sweep.rows.length).toBeGreaterThan(100);
  });

  it('declares no field too narrow for a value the CPS is known to write', () => {
    const tooNarrow: string[] = [];
    let matched = 0;

    for (const f of D890_SETTINGS_FIELDS) {
      const label = norm(f.cpsLabel ?? f.label);
      if (label.length < 6) continue;                 // too short to match safely
      if (!f.group) continue;
      const row = sweep.rows.find((r) => {
        if (norm(r.tab) !== norm(f.group)) return false;   // same CPS tab, or no match
        const l = norm(r.label);
        if (l.length < 6) return false;
        // OCR loses LEADING characters ("ddress Book Is Sent With Its"), so a
        // sweep label may be a suffix of the field label — never longer than it.
        // Allowing the reverse matched 'Display Mode' against 'Call Display
        // Mode', two different controls on two different tabs, and reported a
        // range bug that did not exist.
        return l === label || (label.endsWith(l) && label.length - l.length <= 3);
      });
      if (!row) continue;
      matched += 1;

      const ceiling = f.options
        ? f.options.length - 1
        : f.listLength !== undefined
          ? f.listLength - 1
          : f.max;
      const seen = Math.max(row.before, row.after);
      if (seen > ceiling) {
        tooNarrow.push(
          `${f.key} @0x${f.offset.toString(16)}: CPS writes ${seen} ` +
            `("${row.label}" -> ${row.after}) but the field declares max ${ceiling}`
        );
      }
    }

    // Guard the guard: if the matcher silently stops matching, this test would
    // pass while checking nothing.
    expect(matched).toBeGreaterThan(40);
    expect(tooNarrow).toEqual([]);
  });

  /**
   * The specific regression. Selecting "Infinite" writes 0x20, which only a
   * 1-based reading of a 32-entry list can express — and the same reading is
   * what makes byte 5 read as "5s" rather than "6s".
   */
  it('can express Infinite for both call hold times', () => {
    for (const key of ['groupCallHoldTime', 'privateCallHoldTime']) {
      const f = D890_SETTINGS_FIELDS.find((x) => x.key === key);
      expect(f, key).toBeDefined();
      expect(f!.options?.[32]).toBe('Infinite');
      expect(f!.options?.[31]).toBe('30min');
      expect(f!.options?.[5]).toBe('5s');
    }
  });
});
