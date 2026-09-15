/**
 * What a click does to the channel selection. Kept apart from the table so the
 * rules can be tested without rendering it.
 */

export interface SelectionClick {
  /** Shift: every shown channel from the last click to this one. */
  shift: boolean;
  /** Cmd, Ctrl or Alt, or the row's checkbox: add or remove this one channel. */
  toggle: boolean;
}

export function selectByClick(
  selected: ReadonlySet<number>,
  clicked: number,
  click: SelectionClick,
  shown: readonly number[],
  anchor: number | null
): { selected: Set<number>; anchor: number | null } {
  if (click.shift) {
    const from = anchor !== null && shown.includes(anchor) ? anchor : clicked;
    const a = shown.indexOf(from);
    const b = shown.indexOf(clicked);
    if (a === -1 || b === -1) return { selected: new Set([clicked]), anchor: clicked };
    const [lo, hi] = a <= b ? [a, b] : [b, a];
    return { selected: new Set(shown.slice(lo, hi + 1)), anchor };
  }
  if (click.toggle) {
    const next = new Set(selected);
    if (next.has(clicked)) next.delete(clicked);
    else next.add(clicked);
    return { selected: next, anchor: clicked };
  }
  return { selected: new Set([clicked]), anchor: clicked };
}
