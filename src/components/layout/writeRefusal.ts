/**
 * A write refusal, laid out for its dialog.
 *
 * The planner refuses in plain text, because the same message is thrown, logged
 * and shown, and every builder formats its lists its own way: items indented two
 * spaces, "... and N more" or "…and N more", a heading followed by one line
 * break or two. The dialog printed it verbatim under "This write cannot be
 * planned:" — which the text then repeated as "Refusing to write:" — in a 448px
 * box. This reads that shared shape once, so the dialog shows a lead sentence,
 * real lists and paragraphs whichever builder wrote the message, without
 * changing the messages the logs depend on.
 */

export type RefusalBlock =
  | { kind: 'text'; text: string }
  | { kind: 'list'; items: string[]; more: number };

export interface WriteRefusal {
  /** The first sentence, with "Refusing to write:" dropped — the dialog's title says it. */
  lead: string;
  blocks: RefusalBlock[];
}

/** Items shown per list before the rest are counted, as in the write confirmation. */
export const REFUSAL_LIST_LIMIT = 12;

const MORE_LINE = /^\s*(?:\.\.\.|…)\s*and\s+([\d,]+)\s+more\s*$/;
const ITEM_LINE = /^\s{2,}\S/;

export function parseRefusal(text: string, limit = REFUSAL_LIST_LIMIT): WriteRefusal {
  const blocks: RefusalBlock[] = [];
  let lastLineWasText = false;

  for (const raw of text.replace(/^\s*Refusing to write:\s*/, '').split('\n')) {
    const line = raw.trimEnd();
    const last = blocks[blocks.length - 1];
    if (line.trim() === '') {
      lastLineWasText = false;
      continue;
    }
    const more = MORE_LINE.exec(line);
    if (more) {
      const count = Number((more[1] ?? '0').replace(/,/g, ''));
      if (last?.kind === 'list') last.more += count;
      else blocks.push({ kind: 'list', items: [], more: count });
      lastLineWasText = false;
    } else if (ITEM_LINE.test(line)) {
      if (last?.kind === 'list') last.items.push(line.trim());
      else blocks.push({ kind: 'list', items: [line.trim()], more: 0 });
      lastLineWasText = false;
    } else {
      if (lastLineWasText && last?.kind === 'text') last.text = `${last.text} ${line.trim()}`;
      else blocks.push({ kind: 'text', text: line.trim() });
      lastLineWasText = true;
    }
  }

  for (const block of blocks) {
    if (block.kind === 'list' && block.items.length > limit) {
      block.more += block.items.length - limit;
      block.items = block.items.slice(0, limit);
    }
  }

  let lead = '';
  const first = blocks[0];
  if (first && first.kind === 'text') {
    lead = first.text.charAt(0).toUpperCase() + first.text.slice(1);
    blocks.shift();
  }
  return { lead, blocks };
}
