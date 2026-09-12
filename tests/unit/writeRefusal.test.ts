/**
 * Reading a planner refusal into a lead, lists and paragraphs.
 *
 * The strings below are built exactly the way the planner builds them
 * (writePlan.ts, d890WriteInput.ts), including their inconsistencies: two
 * spellings of "and N more", one blank line or none before a list.
 */

import { describe, it, expect } from 'vitest';
import { parseRefusal, REFUSAL_LIST_LIMIT } from '../../src/components/layout/writeRefusal';

const lines = (n: number, make: (i: number) => string) => Array.from({ length: n }, (_, i) => make(i + 1));

describe('parseRefusal', () => {
  it('drops the repeated "Refusing to write:" and capitalises the lead', () => {
    const r = parseRefusal('Refusing to write: quick message 3 is empty.\n\nAn empty message reads back as an empty slot.');
    expect(r.lead).toBe('Quick message 3 is empty.');
    expect(r.blocks).toEqual([{ kind: 'text', text: 'An empty message reads back as an empty slot.' }]);
  });

  it('reads a transmit-band refusal: list, "... and N more", then a note with no blank line', () => {
    const text =
      "Refusing to write: 8 channel(s) transmit outside this radio's bands (136-174, 400-480 MHz).\n" +
      lines(6, (i) => `  channel ${i} "CH${i}": TX 520 MHz`).join('\n') +
      '\n  ... and 2 more' +
      '\nReceive-only frequencies outside these bands are fine — this check is TX only.';
    const r = parseRefusal(text);
    expect(r.lead).toBe("8 channel(s) transmit outside this radio's bands (136-174, 400-480 MHz).");
    expect(r.blocks).toEqual([
      { kind: 'list', items: lines(6, (i) => `channel ${i} "CH${i}": TX 520 MHz`), more: 2 },
      { kind: 'text', text: 'Receive-only frequencies outside these bands are fine — this check is TX only.' },
    ]);
  });

  it('reads a receive-group refusal: blank line before the list, "…and N more", closing paragraph', () => {
    const text =
      'Refusing to write: 10 receive group member(s) name a talk group that was DELETED.\n\n' +
      lines(8, (i) => `  receive group "G${i}" -> talk group slot ${i}`).join('\n') +
      '\n  …and 2 more\n\n' +
      'Dropping them would change which traffic those groups receive, which is ' +
      'your decision rather than ours.';
    const r = parseRefusal(text);
    expect(r.lead).toBe('10 receive group member(s) name a talk group that was DELETED.');
    expect(r.blocks[0]).toEqual({ kind: 'list', items: lines(8, (i) => `receive group "G${i}" -> talk group slot ${i}`), more: 2 });
    expect(r.blocks[1]).toEqual({
      kind: 'text',
      text: 'Dropping them would change which traffic those groups receive, which is your decision rather than ours.',
    });
  });

  it('caps a list the planner left uncapped, and counts the rest', () => {
    const text =
      'Refusing to write: 30 table(s) reference channels this plan removes.\n' +
      lines(30, (i) => `  zone "Z${i}" references channel(s) ${i}`).join('\n') +
      '\nRemove those references first, or keep the channels.';
    const [list, note] = parseRefusal(text).blocks;
    expect(list).toMatchObject({ kind: 'list', more: 30 - REFUSAL_LIST_LIMIT });
    expect(list?.kind === 'list' && list.items).toHaveLength(REFUSAL_LIST_LIMIT);
    expect(note).toEqual({ kind: 'text', text: 'Remove those references first, or keep the channels.' });
  });

  it('keeps an arrow item and a heading that ends in a colon', () => {
    const text =
      'Refusing to write: a hot key sends a quick message that was deleted:\n' +
      '  Key 1 → "Hello"\n\nPoint it at another message, or Off, under Settings → Hot Keys.';
    const r = parseRefusal(text);
    expect(r.lead).toBe('A hot key sends a quick message that was deleted:');
    expect(r.blocks).toEqual([
      { kind: 'list', items: ['Key 1 → "Hello"'], more: 0 },
      { kind: 'text', text: 'Point it at another message, or Off, under Settings → Hot Keys.' },
    ]);
  });

  it('leaves a message that does not start with the prefix alone', () => {
    expect(parseRefusal('this plan clears nothing').lead).toBe('This plan clears nothing');
  });
});
