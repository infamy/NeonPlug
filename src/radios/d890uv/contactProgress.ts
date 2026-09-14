/**
 * The status line under the Contacts tab's read and write bars.
 *
 * The read said "Read 3,711 of 13,250 KB · 131 KB/s". Every number was right
 * (the read's own log: 133,699 records, 13,568,170 bytes), but nothing on the
 * line said contacts and 13,250 reads like a count of them. The line leads with
 * the contacts now, whose count the database header gives before a byte of the
 * records has moved, and gives sizes in megabytes. Read and write share it, so
 * the two lines cannot drift apart again.
 */

import { formatByteProgress } from '../../utils/formatHelpers';
import { formatPlural } from '../../utils/formatPlural';

export interface ContactTransferProgress {
  verb: 'Reading' | 'Writing';
  /** From the database header. Null when a read had to probe for the extent. */
  count: number | null;
  /** Bytes moved so far, and in all. */
  done: number;
  total: number;
  seconds: number;
  /** A write runs for minutes, so it says how long is left. */
  withRemaining?: boolean;
}

export function contactTransferMessage(p: ContactTransferProgress): string {
  const kbPerSecond = p.seconds > 0 ? p.done / 1024 / p.seconds : 0;
  const what =
    p.count === null ? 'contacts' : `${p.count.toLocaleString()} ${formatPlural(p.count, 'contact')}`;
  let line = `${p.verb} ${what} · ${formatByteProgress(p.done, p.total)} · ${Math.round(kbPerSecond)} KB/s`;
  if (p.withRemaining && kbPerSecond > 0) {
    const left = (p.total - p.done) / 1024 / kbPerSecond;
    if (left > 1) line += ` · ${Math.ceil(left)}s left`;
  }
  return line;
}
