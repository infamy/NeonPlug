import { describe, it, expect } from 'vitest';
import { parseChangelog, latestEntry } from '../../src/utils/changelog';
import changelogSource from '../../CHANGELOG.md?raw';

// Mirrors exactly what .github/workflows/release.yml writes: an "## [x.y.z] — date"
// heading, GitHub's auto-notes demoted to "### ", and a Full Changelog footer.
const SAMPLE = `# Changelog

Preamble that must not be parsed as an entry.

## [Unreleased]

## [0.3.0] — 2026-09-01

### What's Changed
* Add FT-70D support by @infamy in https://github.com/infamy/NeonPlug/pull/160
* Fix zone write truncation by @someone-else in https://github.com/infamy/NeonPlug/pull/161

**Full Changelog**: https://github.com/infamy/NeonPlug/compare/v0.2.0...v0.3.0

## [0.2.0] - 2026-08-10

* Earlier thing
`;

describe('parseChangelog', () => {
  it('returns released entries newest-first and skips Unreleased', () => {
    const entries = parseChangelog(SAMPLE);
    expect(entries.map((e) => e.version)).toEqual(['0.3.0', '0.2.0']);
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
    expect(latestEntry(SAMPLE)?.version).toBe('0.3.0');
    expect(latestEntry('# Changelog\n\n## [Unreleased]\n')).toBeNull();
  });
});

describe('the real CHANGELOG.md', () => {
  // The About tab renders this file directly; if the shape drifts, the "What's
  // New" panel silently goes blank rather than erroring.
  it('parses to at least one entry the About tab can render', () => {
    const entry = latestEntry(changelogSource);
    expect(entry).not.toBeNull();
    expect(entry!.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(entry!.items.length).toBeGreaterThan(0);
  });

  it('still contains the Unreleased marker release.yml inserts after', () => {
    expect(changelogSource).toMatch(/^## \[Unreleased\]$/m);
  });
});
