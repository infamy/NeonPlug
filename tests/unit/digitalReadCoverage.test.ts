import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RADIO_DESCRIPTORS } from '../../src/radios';
import { BaseDigitalProtocol } from '../../src/radios/shared/BaseProtocols';
import { CODEPLUG_READS } from '../../src/radios/codeplugReads';
import type { CodeplugReadSinks } from '../../src/radios/codeplugReads';

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
    // `readDMRRadioIDs` is still called explicitly in the hook, through the
    // digital base class rather than the DM-32 branch.
    const dm32Branch = HOOK.slice(HOOK.indexOf('if (dm32) {'));
    expect(HOOK).toContain('digital.readDMRRadioIDs');
    // And the DM-32 keeps its own path, because it also captures raw blocks.
    expect(dm32Branch).toContain('dm32.readQuickContacts');
  });

  it('does not read big on-demand tables with the codeplug', async () => {
    // The link is byte-limited at ~10 KB/s, so a table nobody is looking at is
    // dead weight on every read. Satellites is 12,800 bytes (~1.3 s) and the
    // pictures are 40 KB each. The vendor CPS draws the same line — satellites
    // are behind its Tools menu, which is why they never appear in a CPS
    // codeplug capture. Both are read on demand from their Settings area.
    const labels = CODEPLUG_READS.map((r) => r.label);
    expect(labels).not.toContain('Satellites');
    expect(labels).not.toContain('Pictures');

    // And prove it by planning: a protocol that CAN read them is still not
    // asked to during a codeplug read.
    const proto = {
      readSatellites: async () => [],
      readImages: async () => ({ boot: null, bk1: null, bk2: null }),
    } as unknown as Parameters<(typeof CODEPLUG_READS)[number]['plan']>[0];
    for (const spec of CODEPLUG_READS) {
      expect(spec.plan(proto), `${spec.label} should not plan for this protocol`).toBeNull();
    }
  });

  it('reads RX groups and talkgroups for any radio that implements them', async () => {
    // This used to be a grep of the hook's source, because the alternative was
    // standing up a fake radio. The registry makes the real thing cheap: run it
    // against a protocol that implements only these two reads and check they
    // actually reached the sinks. No DM-32 involved anywhere.
    const groups = [{ index: 0, name: 'RX1', talkGroupIndices: [] }];
    const talkGroups = [{ index: 1, name: 'TG1' }];
    const proto = {
      readRXGroups: async () => groups,
      readQuickContacts: async () => talkGroups,
    } as unknown as Parameters<(typeof CODEPLUG_READS)[number]['plan']>[0];

    const got: Record<string, unknown> = {};
    const sinks = {
      setTable: (id: string, v: unknown) => { got[id] = v; },
      setEncryptionKeys: (v: unknown) => { got.encryptionKeys = v; },
      setMessages: (v: unknown) => { got.messages = v; },
      setMessagesLoaded: () => {},
      setRXGroups: (v: unknown) => { got.rxGroups = v; },
      setQuickContacts: (v: unknown) => { got.quickContacts = v; },
    } as unknown as CodeplugReadSinks;

    for (const spec of CODEPLUG_READS) {
      const run = spec.plan(proto);
      if (run) await run(sinks);
    }

    expect(got.rxGroups, 'RX groups were never read').toBe(groups);
    expect(got.quickContacts, 'talkgroups were never read').toBe(talkGroups);
  });

  it('silently skips reads a radio does not implement', async () => {
    // A radio missing a method is normal, not a failure — the plan must return
    // null rather than throwing, or one absent table would abort a codeplug read.
    const bare = {} as Parameters<(typeof CODEPLUG_READS)[number]['plan']>[0];
    for (const spec of CODEPLUG_READS) {
      expect(spec.plan(bare), `${spec.label} does not skip cleanly`).toBeNull();
    }
  });

  it('asks the radio in the order that has been seen working', () => {
    // Read order cannot be verified without hardware, so the sequence that has
    // been watched working against a real DA-7X2 is pinned here. Reordering
    // this array is a hardware-affecting change, and should fail a test rather
    // than pass quietly. Zone A/B is genuinely last — it indexes into the zones.
    expect(CODEPLUG_READS.map((r) => r.label)).toEqual([
      'RX Groups',
      'Talk Groups',
      'Encryption keys',
      'Roaming',
      'Pre-defined SMS',
      'Emergency',
      'AM/FM broadcast',
      'Power-on display',
      '2-Tone / 5-Tone',
      'AM zones',
      'GPS roaming',
      'Zone A/B channels',
    ]);
  });

});
