/**
 * Rows a CSV import couldn't read, said once.
 *
 * One bad row used to throw away the whole file: the importers kept the good
 * rows but reported failure, and every caller then discarded them and listed
 * each bad row, with no limit. An import now goes ahead with the rows that were
 * read and names the ones that weren't.
 */

import { formatPlural } from '../../utils/formatPlural';

/** The first few problems, one per line, with a count of the rest. */
export function describeUnreadableRows(problems: readonly string[], limit = 10): string {
  const more = problems.length - limit;
  return [...problems.slice(0, limit), ...(more > 0 ? [`…and ${more} more`] : [])].join('\n');
}

/** For an import where no row could be read. */
export function nothingImportedMessage(problems: readonly string[] | undefined): string {
  if (!problems || problems.length === 0) return 'Nothing was imported: the file has no rows to read.';
  return `Nothing was imported: no row could be read.\n\n${describeUnreadableRows(problems)}`;
}

/** For the Add or Replace choice, when some rows were read and some weren't. */
export function unreadableRowsNote(problems: readonly string[] | undefined): string | null {
  if (!problems || problems.length === 0) return null;
  const n = problems.length;
  return `${n} ${formatPlural(n, 'row')} can't be read and ${formatPlural(n, 'is', 'are')} left out:\n${describeUnreadableRows(problems)}`;
}
