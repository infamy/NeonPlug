import type { Channel } from '../models';

export function getNextChannelNumber(channels: Channel[]): number {
  const existing = new Set(channels.map(ch => ch.number));
  let next = 1;
  while (existing.has(next)) next++;
  return next;
}
