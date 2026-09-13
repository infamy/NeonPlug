/**
 * The contact read and write status line.
 *
 * It said "Read 3,711 of 13,250 KB · 131 KB/s": right, and read as a contact
 * count, because nothing on the line said contacts and 13,250 looks like one.
 * These pin it to leading with the contacts and giving megabytes.
 */

import { describe, it, expect } from 'vitest';
import { contactTransferMessage } from '../../src/radios/d890uv/contactProgress';

const n = (value: number) => value.toLocaleString();

describe('contactTransferMessage', () => {
  it('reads the reported read as it should have: 133,699 contacts, 19 of 68 banks in', () => {
    // The real read: 13,568,170 bytes; 3,800,000 is nineteen 200,000-byte banks.
    expect(
      contactTransferMessage({
        verb: 'Reading', count: 133699, done: 3_800_000, total: 13_568_170, seconds: 3_800_000 / 1024 / 131,
      })
    ).toBe(`Reading ${n(133699)} contacts · 3.6 of 12.9 MB · 131 KB/s`);
  });

  it('says "contacts" without a number when there was no header to count from', () => {
    expect(contactTransferMessage({ verb: 'Reading', count: null, done: 0, total: 13_568_170, seconds: 0 }))
      .toBe('Reading contacts · 0.0 of 12.9 MB · 0 KB/s');
  });

  it('is singular for one contact', () => {
    expect(contactTransferMessage({ verb: 'Reading', count: 1, done: 60, total: 120, seconds: 1 }))
      .toMatch(/^Reading 1 contact · /);
  });

  it('gives a write its time left, and a read none', () => {
    const at = { count: 2, done: 102_400, total: 1_048_576, seconds: 10 };
    expect(contactTransferMessage({ verb: 'Writing', ...at, withRemaining: true }))
      .toBe('Writing 2 contacts · 0.1 of 1.0 MB · 10 KB/s · 93s left');
    expect(contactTransferMessage({ verb: 'Reading', ...at })).not.toContain('left');
  });
});
