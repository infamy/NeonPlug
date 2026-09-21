/**
 * What a channel delete does to the rest of the list, said in its confirmation.
 *
 * Deleting renumbers what is left 1..n in order (channelsStore.deleteChannels),
 * gaps included, and zones and scan lists follow, so channels get new numbers on
 * the radio. The confirmation used to say only "Delete channel 5?". A bulk
 * delete also takes selected rows that the search is hiding.
 */

import { formatPlural } from '../utils/formatPlural';
import { isVFOChannel } from '../utils/vfoChannels';

export function describeChannelDelete(
  channels: readonly { number: number }[],
  deleting: readonly number[],
  hiddenBySearch = 0,
  /** `keepNumbers`: caps.channelDeleteKeepsNumbers. `lists`: the radio has zones or scan lists. */
  options: { keepNumbers?: boolean; lists?: boolean } = {}
): string {
  if (deleting.length === 0) return '';
  if (options.keepNumbers) {
    const lists = options.lists
      ? ` ${deleting.length === 1 ? 'It is' : 'They are'} taken out of zones and scan lists.`
      : '';
    const hidden =
      hiddenBySearch > 0
        ? ` ${hiddenBySearch} of them ${formatPlural(hiddenBySearch, 'is', 'are')} hidden by the search.`
        : '';
    return `Every other channel keeps its number.${lists}${hidden}`;
  }
  const doomed = new Set(deleting);
  // The same renumbering deleteChannels does, keeping only the channels it moves.
  const renumbered = channels
    .map((ch) => ch.number)
    .filter((n) => !doomed.has(n))
    .sort((a, b) => a - b)
    .map((from, i) => ({ from, to: i + 1 }))
    .filter(({ from, to }) => from !== to && !isVFOChannel(from));

  const sentences: string[] = [];
  if (renumbered.length > 0) {
    const first = renumbered[0];
    const last = renumbered[renumbered.length - 1];
    const shift = first.from - first.to;
    const oneRun = renumbered.every(
      (r, i) => r.from - r.to === shift && (i === 0 || r.from === renumbered[i - 1].from + 1)
    );
    const follow = 'and zones and scan lists follow.';
    if (oneRun && shift === 1) {
      const who = renumbered.length === 1 ? `Channel ${first.from} moves` : `Channels ${first.from}–${last.from} move`;
      sentences.push(`${who} up one, ${follow}`);
    } else if (oneRun) {
      sentences.push(
        renumbered.length === 1
          ? `Channel ${first.from} becomes ${first.to}, ${follow}`
          : `Channels ${first.from}–${last.from} become ${first.to}–${last.to}, ${follow}`
      );
    } else {
      sentences.push(
        `${renumbered.length} channels get new numbers, from ${first.from} becoming ${first.to} ` +
          `to ${last.from} becoming ${last.to}, ${follow}`
      );
    }
  }
  if (hiddenBySearch > 0) {
    sentences.push(`${hiddenBySearch} of them ${formatPlural(hiddenBySearch, 'is', 'are')} hidden by the search.`);
  }
  return sentences.join(' ');
}
