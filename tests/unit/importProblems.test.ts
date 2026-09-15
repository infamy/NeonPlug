import { describe, it, expect } from 'vitest';
import {
  describeUnreadableRows,
  nothingImportedMessage,
  unreadableRowsNote,
} from '../../src/services/csv/importProblems';

describe('rows an import could not read', () => {
  it('lists the first ten and counts the rest', () => {
    const problems = Array.from({ length: 12 }, (_, i) => `Row ${i + 2}: bad`);
    const lines = describeUnreadableRows(problems).split('\n');
    expect(lines).toHaveLength(11);
    expect(lines[10]).toBe('…and 2 more');
  });

  it('says nothing was imported, and why', () => {
    expect(nothingImportedMessage(undefined)).toBe('Nothing was imported: the file has no rows to read.');
    expect(nothingImportedMessage(['Row 2: Invalid RX frequency'])).toBe(
      'Nothing was imported: no row could be read.\n\nRow 2: Invalid RX frequency'
    );
  });

  it('notes the rows left out of an import that goes ahead', () => {
    expect(unreadableRowsNote([])).toBeNull();
    expect(unreadableRowsNote(['Row 5: bad'])).toBe("1 row can't be read and is left out:\nRow 5: bad");
  });
});
