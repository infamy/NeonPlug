import { useCallback, useState } from 'react';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import type { LimitCheck } from '../services/csv/importLimits';
import { formatPlural } from '../utils/formatPlural';
import { unreadableRowsNote } from '../services/csv/importProblems';

export type CsvImportMode = 'add' | 'replace';

export interface CsvImportRequest<T> {
  /** What one entry is called, e.g. 'channel'. */
  noun: string;
  /** The plural, when adding an s is wrong. */
  plural?: string;
  existing: readonly T[];
  imported: readonly T[];
  /** Rows the file had that couldn't be read. The import goes ahead without them, and says so. */
  problems?: readonly string[];
  /** The list after Add. */
  add: () => T[];
  /** The list after Replace. The file's own list unless given. */
  replace?: () => T[];
  /** What Replace would change besides the list, shown with the choice. */
  replaceNote?: string;
  /** Radio limits, for the list that would result. */
  check: (list: T[]) => LimitCheck<T>;
  /** Puts the list in place. */
  apply: (list: T[], mode: CsvImportMode) => void;
}

interface Choice {
  title: string;
  message: string;
  choose: (mode: CsvImportMode) => void;
}

/**
 * The Add or Replace choice every CSV import makes, then the radio limit check.
 *
 * Add is the default: it keeps the list and appends what the file adds. The
 * limit check runs on the list that would result, because Add can go over a
 * limit that neither the list nor the file breaks alone. Over a limit, the
 * import stops to ask: trim and continue, or abort.
 */
export function useCsvImport() {
  const [choice, setChoice] = useState<Choice | null>(null);
  const [overLimit, setOverLimit] = useState<{ message: string; trim: () => void } | null>(null);

  const startImport = useCallback(<T,>(request: CsvImportRequest<T>) => {
    const plural = request.plural ?? `${request.noun}s`;
    const count = (n: number) => `${n} ${formatPlural(n, request.noun, plural)}`;
    const added = request.add();
    const have = request.existing.length;
    const fresh = added.length - have;
    const lines = [
      `The file has ${count(request.imported.length)}.`,
      have === 0
        ? `There are no ${plural} here yet, so Add and Replace do the same.`
        : `Add keeps your ${count(have)} and puts in the ${fresh} from the file that ${formatPlural(fresh, "isn't", "aren't")} here yet. ` +
          `Replace swaps your ${count(have)} for the file's.`,
    ];
    const unreadable = unreadableRowsNote(request.problems);
    if (unreadable) lines.splice(1, 0, unreadable);
    if (request.replaceNote) lines.push(`If you replace: ${request.replaceNote}`);

    setChoice({
      title: `Import ${plural} from CSV`,
      message: lines.join('\n\n'),
      choose: (mode) => {
        const list = mode === 'add' ? added : request.replace ? request.replace() : [...request.imported];
        const { issues, trimmed } = request.check(list);
        if (issues.length === 0) {
          request.apply(list, mode);
          return;
        }
        setOverLimit({ message: issues.join('\n\n'), trim: () => request.apply(trimmed, mode) });
      },
    });
  }, []);

  const csvImportDialog = (
    <>
      <ConfirmModal
        isOpen={choice !== null}
        onClose={() => setChoice(null)}
        onConfirm={() => choice?.choose('add')}
        extraAction={{ label: 'Replace', onClick: () => choice?.choose('replace'), variant: 'danger' }}
        title={choice?.title ?? ''}
        message={choice?.message}
        confirmLabel="Add"
        variant="default"
      />
      <ConfirmModal
        isOpen={overLimit !== null}
        onClose={() => setOverLimit(null)}
        onConfirm={() => overLimit?.trim()}
        title="Over the radio's limit"
        message={overLimit?.message}
        confirmLabel="Trim and continue"
        cancelLabel="Abort"
        variant="danger"
      />
    </>
  );

  return { startImport, csvImportDialog };
}
