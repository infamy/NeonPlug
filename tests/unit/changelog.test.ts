import { describe, it, expect } from 'vitest';
import { parseChangelog, latestEntry, whatsNewItems } from '../../src/utils/changelog';
import changelogSource from '../../CHANGELOG.md?raw';

// Mirrors exactly what .github/workflows/release.yml writes: an
// "## [YEAR.MONTH.N] — date" heading, GitHub's auto-notes demoted to "### ", and
// a Full Changelog footer.
const SAMPLE = `# Changelog

Preamble that must not be parsed as an entry.

## [Unreleased]

## [2026.9.0] — 2026-09-01

### What's Changed
* Add FT-70D support by @infamy in https://github.com/infamy/NeonPlug/pull/160
* Fix zone write truncation by @someone-else in https://github.com/infamy/NeonPlug/pull/161

**Full Changelog**: https://github.com/infamy/NeonPlug/compare/v2026.8.0...v2026.9.0

## [2026.8.0] - 2026-08-10

* Earlier thing
`;

describe('parseChangelog', () => {
  it('returns released entries newest-first and skips Unreleased', () => {
    const entries = parseChangelog(SAMPLE);
    expect(entries.map((e) => e.version)).toEqual(['2026.9.0', '2026.8.0']);
  });

  it('captures the date from either dash style', () => {
    const [newest, older] = parseChangelog(SAMPLE);
    expect(newest.date).toBe('2026-09-01');
    expect(older.date).toBe('2026-08-10');
  });

  it('strips the "by @user in <url>" tail that is useless offline', () => {
    const [newest] = parseChangelog(SAMPLE);
    expect(newest.items).toEqual([
      'Add FT-70D support',
      'Fix zone write truncation',
    ]);
  });

  it('does not leak bullets across entries', () => {
    const [, older] = parseChangelog(SAMPLE);
    expect(older.items).toEqual(['Earlier thing']);
  });

  it('joins wrapped continuation lines into one bullet', () => {
    // Hand-written Unreleased entries wrap; the release workflow carries them
    // through verbatim, so a truncated bullet would ship to users.
    const [entry] = parseChangelog(
      '## [1.0.0] — 2026-01-01\n\n' +
        '* Radio support: DM-32UV, UV5R-Mini,\n' +
        '  FT-65, FT-4, and FT-25R.\n' +
        '* Second item\n'
    );
    expect(entry.items).toEqual([
      'Radio support: DM-32UV, UV5R-Mini, FT-65, FT-4, and FT-25R.',
      'Second item',
    ]);
  });

  it('does not swallow the Full Changelog footer into the last bullet', () => {
    const [entry] = parseChangelog(SAMPLE);
    expect(entry.items.join(' ')).not.toMatch(/Full Changelog/);
  });

  it('ignores prose outside any entry', () => {
    const entries = parseChangelog('# Changelog\n\nJust prose.\n');
    expect(entries).toEqual([]);
  });

  it('handles an Unreleased-only changelog', () => {
    expect(parseChangelog('# Changelog\n\n## [Unreleased]\n\n* pending\n')).toEqual([]);
  });

  it('latestEntry returns the newest release, or null when there is none', () => {
    expect(latestEntry(SAMPLE)?.version).toBe('2026.9.0');
    expect(latestEntry('# Changelog\n\n## [Unreleased]\n')).toBeNull();
  });

  it('reads hand-written lines above GitHub\'s list, and leaves out New Contributors', () => {
    // The shape release.yml writes when something was under [Unreleased] and a PR
    // came from a first-time contributor.
    const [entry] = parseChangelog(
      '## [2026.9.0] — 2026-09-13\n\n' +
        '- First tagged release.\n\n' +
        "### What's Changed\n" +
        '* Fix zone write truncation by @someone-else in https://github.com/infamy/NeonPlug/pull/161\n\n' +
        '### New Contributors\n' +
        '* @someone-else made their first contribution in https://github.com/infamy/NeonPlug/pull/161\n\n' +
        '**Full Changelog**: https://github.com/infamy/NeonPlug/commits/v2026.9.0\n'
    );
    expect(entry.items).toEqual(['First tagged release.', 'Fix zone write truncation']);
    expect(entry.summary).toEqual(['First tagged release.']);
    // The About tab lists the summary alone, not GitHub's list under it.
    expect(whatsNewItems(entry)).toEqual(['First tagged release.']);
  });

  it('lists every item when a release has no hand-written summary', () => {
    const [newest, older] = parseChangelog(SAMPLE);
    expect(newest.summary).toEqual([]);
    expect(whatsNewItems(newest)).toEqual(['Add FT-70D support', 'Fix zone write truncation']);
    // With no GitHub list at all, there is nothing for a summary to sit above.
    expect(older.summary).toEqual([]);
    expect(whatsNewItems(older)).toEqual(['Earlier thing']);
  });
});

describe('the real CHANGELOG.md', () => {
  // The About tab renders this file directly; if the shape drifts, the "What's
  // New" panel silently goes blank rather than erroring. Before the first release
  // there is no released entry at all, so every version heading is checked
  // instead of requiring one.
  it('parses every released entry into items the About tab can render', () => {
    const headings = changelogSource.match(/^## \[\d+\.\d+\.\d+\]/gm) ?? [];
    const entries = parseChangelog(changelogSource);
    expect(entries).toHaveLength(headings.length);
    for (const entry of entries) {
      expect(entry.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(entry.items.length).toBeGreaterThan(0);
    }
  });

  it('still contains the Unreleased marker release.yml inserts after', () => {
    expect(changelogSource).toMatch(/^## \[Unreleased\]$/m);
  });
});
