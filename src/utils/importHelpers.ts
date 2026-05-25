import type { Channel } from '../models';

export function getNextChannelNumber(channels: Channel[]): number {
  const existing = new Set(channels.map(ch => ch.number));
  let next = 1;
  while (existing.has(next)) next++;
  return next;
}

export function selectionCardClass(isSelected: boolean): string {
  return `border rounded p-3 cursor-pointer transition-colors ${
    isSelected
      ? 'border-neon-cyan bg-neon-cyan bg-opacity-10'
      : 'border-neon-cyan border-opacity-30 hover:border-neon-cyan border-opacity-50'
  }`;
}
