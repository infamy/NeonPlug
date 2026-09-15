/**
 * What a channel delete does to the rest of the list, said in its confirmation.
 *
 * Deleting renumbers every channel after the first one deleted, and zones and
 * scan lists follow (channelsStore.deleteChannels), so the old channel 13 is
 * channel 12 on the radio. The confirmation used to say only "Delete channel
 * 5?". A bulk delete also takes selected rows that the search is hiding.
 */

import { formatPlural } from '../utils/formatPlural';

export function describeChannelDelete(
  channels: readonly { number: number }[],
  deleting: readonly number[],
  hiddenBySearch = 0
): string {
  if (deleting.length === 0) return '';
  const doomed = new Set(deleting);
  const first = Math.min(...deleting);
  const moving = channels
    .map((ch) => ch.number)
    .filter((n) => n > first && !doomed.has(n))
    .sort((a, b) => a - b);

  const sentences: string[] = [];
  if (moving.length > 0) {
    const who =
      moving.length === 1
        ? `Channel ${moving[0]} moves`
        : `Channels ${moving[0]}–${moving[moving.length - 1]} move`;
    sentences.push(`${who} up${deleting.length === 1 ? ' one' : ''}, and zones and scan lists follow.`);
  }
  if (hiddenBySearch > 0) {
    sentences.push(`${hiddenBySearch} of them ${formatPlural(hiddenBySearch, 'is', 'are')} hidden by the search.`);
  }
  return sentences.join(' ');
}
