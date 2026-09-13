/**
 * Parses the bundled CHANGELOG.md so the About tab can show release notes
 * offline. Deliberately tiny — this is not a markdown renderer, it only
 * understands the shape release.yml writes:
 *
 *   ## [2026.9.0] — 2026-09-13
 *   - Anything that was written under [Unreleased]
 *   ### What's Changed
 *   * Some PR title by @someone in https://github.com/...
 *   ### New Contributors
 *   * @someone made their first contribution in https://github.com/...
 *
 *   **Full Changelog**: https://github.com/...
 */

export interface ChangelogEntry {
  /** Version without the leading 'v', e.g. "2026.9.0". */
  version: string;
  /** Release date as written in the heading, or '' if absent. */
  date: string;
  /** Bullet lines, cleaned of trailing "by @user in <url>" noise. */
  items: string[];
  /**
   * The items written by hand above GitHub's list, which release.yml moves there
   * from [Unreleased]. Empty when a release has none, or has no list to sit above.
   */
  summary: string[];
}

// "## [2026.9.0] — 2026-09-13", "## [2026.9.0] - 2026-09-13", or "## [Unreleased]".
// Accepts both em dash and hyphen because the two are easy to mix up by hand.
const HEADING = /^##\s+\[([^\]]+)\]\s*(?:[—-]\s*(.+))?$/;
const BULLET = /^[*-]\s+(.+)$/;

/** Strip GitHub's "by @user in <pr url>" tail — the URL is dead weight offline. */
function cleanItem(text: string): string {
  return text
    .replace(/\s+by\s+@[\w-]+\s+in\s+https?:\/\/\S+$/i, '')
    .replace(/\s+in\s+https?:\/\/\S+$/i, '')
    .trim();
}

/**
 * Returns released entries newest-first. `## [Unreleased]` is skipped — it is a
 * staging area for the next release, not something to show users as shipped.
 */
export function parseChangelog(markdown: string): ChangelogEntry[] {
  const entries: ChangelogEntry[] = [];
  let current: ChangelogEntry | null = null;
  // Whether the current entry has reached its first sub-heading. The items
  // before it are the hand-written summary.
  let pastSummary = false;
  // Inside GitHub's "New Contributors" list, which thanks people for a first PR.
  // Those lines are not changes, so they never become items.
  let inNewContributors = false;

  for (const rawLine of markdown.split('\n')) {
    const line = rawLine.trim();

    const heading = HEADING.exec(line);
    if (heading) {
      const version = heading[1].trim();
      // Push the previous entry before switching, including when the next
      // heading is Unreleased.
      if (current) entries.push(current);
      current =
        version.toLowerCase() === 'unreleased'
          ? null
          : { version: version.replace(/^v/i, ''), date: (heading[2] || '').trim(), items: [], summary: [] };
      pastSummary = false;
      inNewContributors = false;
      continue;
    }

    if (!current) continue;

    // Any other '## ' heading ends the changelog body we care about.
    if (line.startsWith('## ')) {
      entries.push(current);
      current = null;
      continue;
    }

    // A sub-heading, such as GitHub's "### What's Changed".
    if (line.startsWith('#')) {
      if (!pastSummary) {
        current.summary = [...current.items];
        pastSummary = true;
      }
      inNewContributors = /^#+\s+New Contributors$/i.test(line);
      continue;
    }
    if (inNewContributors) continue;

    const bullet = BULLET.exec(line);
    if (bullet) {
      const item = cleanItem(bullet[1]);
      if (item) current.items.push(item);
      continue;
    }

    // Wrapped continuation of the previous bullet. Hand-written entries under
    // `## [Unreleased]` get carried into a release verbatim, and those wrap at
    // ~90 columns — without this the bullet silently truncates at the newline.
    // A blank line ends the bullet; `**Full Changelog**:` and other markdown
    // furniture are not continuations.
    if (line && current.items.length > 0 && !line.startsWith('**') && !line.startsWith('#')) {
      const last = current.items.length - 1;
      current.items[last] = cleanItem(`${current.items[last]} ${line}`);
    }
  }

  if (current) entries.push(current);
  return entries;
}

/** The most recent released entry, or null if the changelog has none yet. */
export function latestEntry(markdown: string): ChangelogEntry | null {
  return parseChangelog(markdown)[0] ?? null;
}

/**
 * What the About tab lists for a release: its hand-written summary when it has
 * one, otherwise every item. A first release's GitHub list runs to every PR ever
 * merged, oldest first, which is not what anyone opening What's New wants.
 */
export function whatsNewItems(entry: ChangelogEntry): string[] {
  return entry.summary.length > 0 ? entry.summary : entry.items;
}
