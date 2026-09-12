/**
 * How many contacts a radio holds, decided in one place.
 *
 * Settings showed "CSV Contacts 7183 / 0 (0%)" for a DA-7X2 that holds 500,000:
 * it read an absent `supportsContacts` as false, and the Contacts tab worked the
 * number out a different way. Both ask resolveContactCapacity now, which reads
 * the limits table and lets a read that reports its own capacity win.
 */

import { describe, it, expect } from 'vitest';
import { getCapabilitiesForModel } from '../../src/radios/capabilities';
import { resolveContactCapacity } from '../../src/utils/contactCapacity';

describe('resolveContactCapacity', () => {
  it('gives the DA-7X2 its 500,000 from the table, with nothing read', () => {
    expect(resolveContactCapacity(getCapabilitiesForModel('DA-7X2'))).toBe(500000);
    expect(resolveContactCapacity(getCapabilitiesForModel('AT-D890UV'))).toBe(500000);
  });

  it('treats an absent supportsContacts as supported, as the rest of the app does', () => {
    expect(resolveContactCapacity({ maxContacts: 500000 })).toBe(500000);
  });

  it('lets a read that reports its capacity win: a DM-32 on L01 firmware', () => {
    const caps = getCapabilitiesForModel('DM-32UV');
    expect(resolveContactCapacity(caps)).toBe(50000);
    expect(resolveContactCapacity(caps, { maxContacts: 150000 })).toBe(150000);
  });

  it('gives a radio without contacts none, whatever a read says', () => {
    expect(resolveContactCapacity(getCapabilitiesForModel('FT-65'), { maxContacts: 999 })).toBe(0);
  });

  it('falls back to the old default only for a radio it does not know', () => {
    expect(resolveContactCapacity(null)).toBe(50000);
  });
});
