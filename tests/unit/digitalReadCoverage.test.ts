import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RADIO_DESCRIPTORS } from '../../src/radios';
import { BaseDigitalProtocol } from '../../src/radios/shared/BaseProtocols';

const HOOK = readFileSync(join(__dirname, '../../src/hooks/useRadioConnection.ts'), 'utf8');

/**
 * The Digital tab renders radio IDs, receive groups and talkgroups. All three
 * used to be read inside `if (dm32)`, so a DMR radio that was not a DM-32 read
 * its channels, zones and scan lists and then silently skipped everything that
 * tab shows — it came up empty on a radio whose driver could read all three.
 *
 * The failure had no error and no warning. Nothing threw; the reads simply never
 * happened. That is what makes it worth a test rather than a comment.
 */
describe('generic DMR content is read for every digital radio', () => {
  const digital = RADIO_DESCRIPTORS.filter(
    (d) => d.capabilities.analogOnly !== true && d.capabilities.digital,
  );

  it('has digital radios to check', () => {
    expect(digital.length).toBeGreaterThan(1);
  });

  it('gives every digital protocol the three reads the Digital tab needs', () => {
    for (const d of digital) {
      const proto = d.protocolFactory() as Record<string, unknown>;
      expect(proto, `${d.label} is not a digital protocol`).toBeInstanceOf(BaseDigitalProtocol);
      for (const method of ['readDMRRadioIDs', 'readRXGroups', 'readQuickContacts']) {
        expect(typeof proto[method], `${d.label} has no ${method}()`).toBe('function');
      }
    }
  });

  it('does not gate those reads on the DM-32', () => {
    // The specific regression: these three calls must be reachable through the
    // digital base class, not only through the DM-32 branch. Checked in the
    // source because the alternative is standing up a fake radio.
    const dm32Branch = HOOK.slice(HOOK.indexOf('if (dm32) {'));
    for (const call of ['readDMRRadioIDs', 'readRXGroups', 'readQuickContacts']) {
      expect(HOOK, `${call} is never called`).toContain(call);
      const viaDigital = new RegExp(`digital\\.${call}`).test(HOOK);
      expect(viaDigital, `${call} is only reachable via the DM-32 branch`).toBe(true);
    }
    // And the DM-32 keeps its own path, because it also captures raw blocks.
    expect(dm32Branch).toContain('dm32.readQuickContacts');
  });
});
