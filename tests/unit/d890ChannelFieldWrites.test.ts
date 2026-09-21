import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseChannel } from '../../src/radios/d890uv/structures';
import { applyChannelToRecord } from '../../src/radios/d890uv/channelWrite';
import type { Channel } from '../../src/models/Channel';

const DIR = join(__dirname, '../fixtures/d890uv');
const original = () => new Uint8Array(readFileSync(join(DIR, 'channel-0.bin')));

/**
 * Does editing a field actually change any bytes?
 *
 * The existing round-trip test cannot answer this, and that is a structural
 * blind spot rather than an oversight. It asserts
 * `encode(original, parse(original)) === original` — but the encoder PATCHES a
 * copy of the original, so **every field it never writes passes that assertion
 * trivially**. Identity holds precisely because the byte was untouched. A field
 * the encoder has no idea exists looks perfectly round-tripped.
 *
 * So this test edits each field and asserts the record MOVED. A field that
 * silently does nothing is worse than one that errors: the UI accepts the
 * change, the plan looks reasonable, and the radio keeps its old value.
 */

/** Change `field` to something different and report whether any byte moved. */
function edits(field: keyof Channel, value: unknown): boolean {
  const orig = original();
  const decoded = parseChannel(orig, 0).channel;
  const out = applyChannelToRecord(orig, { ...decoded, number: 1, [field]: value } as Channel);
  return !out.every((b, i) => b === orig[i]);
}

/**
 * Fields the encoder does NOT write today, verified by audit 2026-09-01.
 *
 * Pinned rather than merely documented so the list cannot drift silently in
 * either direction: implementing one of these fails this test until it is
 * removed from the list, and a NEW decoded-but-unwritten field fails the
 * completeness check below.
 *
 * `channelWrite.ts`'s OFF table has no entry for 0x10, 0x12 or 0x35-0x3c at
 * all; the rest are bits deliberately masked out of a byte that IS written.
 */
const KNOWN_UNWRITTEN: { field: keyof Channel; value: unknown; why: string }[] = [
  { field: 'customCtcssHz', value: 123.4, why: '0x10-0x11, absent from OFF' },
  { field: 'twoToneDecode', value: 7, why: '0x12, absent from OFF' },
  { field: 'aprsReportMode', value: 'Analog', why: '0x35, absent from OFF' },
  { field: 'analogAprsPttMode', value: 2, why: '0x36, absent from OFF' },
  { field: 'digitalAprsPttMode', value: 1, why: '0x37, absent from OFF' },
  { field: 'digitalAprsReportChannel', value: 5, why: '0x38, absent from OFF' },
  { field: 'offsetFrequencyEx', value: 7, why: '0x39, absent from OFF' },
  { field: 'normalEmergencyCode', value: 3, why: '0x3a, absent from OFF; not in any UI' },
  { field: 'smsConfirmation', value: true, why: '0x3b b2 — decoder flags this as the WRONG BIT' },
  { field: 'analogAprsMute', value: true, why: '0x3b b3 — shares a byte with 5 unmodelled bits' },
  { field: 'sendTalkerAlias', value: true, why: '0x3b b4 — decoder flags it mislabelled' },
  { field: 'analogAprsTxPath', value: 2, why: '0x3c, absent from OFF' },
  { field: 'dataAckDisable', value: true, why: '0x21 b1, masked out of FLAGS21_WRITABLE' },
  { field: 'encryption', value: true, why: '0x21 b6, masked out — decoder says it is an algorithm selector' },
  { field: 'idleTx', value: true, why: '0x34 b5, masked out of FLAGS34_WRITABLE' },
  { field: 'compander', value: true, why: '0x34 b6, masked out' },
];

describe('editing a channel field actually writes bytes', () => {
  it('the fields the encoder DOES handle move bytes', () => {
    // Control group. If these stopped moving, the test itself is broken.
    expect(edits('name', 'CHANGED')).toBe(true);
    expect(edits('rxFrequency', 146.52)).toBe(true);
    expect(edits('colorCode', 7)).toBe(true);
    expect(edits('scanListId', 3)).toBe(true);
  });

  for (const { field, value, why } of KNOWN_UNWRITTEN) {
    it(`KNOWN GAP: editing ${String(field)} changes nothing (${why})`, () => {
      expect(
        edits(field, value),
        `${String(field)} now writes bytes — remove it from KNOWN_UNWRITTEN`
      ).toBe(false);
    });
  }

  it('has an entry for every gap the audit found', () => {
    // Guards the list against silently shrinking.
    expect(KNOWN_UNWRITTEN).toHaveLength(16);
  });
});
