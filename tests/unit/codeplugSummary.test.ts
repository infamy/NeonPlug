/**
 * The import and restore summary lists what a codeplug holds, and only that.
 */

import { describe, it, expect } from 'vitest';
import { summarizeCodeplug } from '../../src/components/layout/codeplugSummary';
import type { CodeplugData } from '../../src/services/codeplugExport';

const empty = (): CodeplugData => ({
  channels: [], zones: [], scanLists: [], contacts: [], digitalEmergencies: [],
  digitalEmergencyConfig: null, analogEmergencies: [], radioSettings: null, radioInfo: null,
  messages: [], radioIds: [], quickContacts: [], rxGroups: [], encryptionKeys: [],
  exportDate: '', version: '1.1.0',
});

const many = (n: number) => Array.from({ length: n }, () => ({})) as never[];

describe('summarizeCodeplug', () => {
  it('leaves out everything the codeplug does not hold', () => {
    const s = summarizeCodeplug({ ...empty(), channels: many(1), quickContacts: many(994) });
    expect(s.rows).toEqual([
      { label: 'Channels', count: 1 },
      { label: 'Talk groups', count: 994 },
    ]);
    expect(s.radioSettings).toBe(false);
  });

  it('counts the radio-specific tables that carried something', () => {
    const s = summarizeCodeplug({
      ...empty(),
      tables: { amChannels: many(3), fmChannels: [], dtmf: null } as never,
    });
    expect(s.rows).toEqual([{ label: 'Radio-specific tables', count: 1 }]);
  });

  it('says whether radio settings came with it', () => {
    expect(summarizeCodeplug({ ...empty(), radioSettings: {} as never }).radioSettings).toBe(true);
  });

  it('copes with a file from an older build that lacks a list', () => {
    const old = { ...empty(), rxGroups: undefined } as unknown as CodeplugData;
    expect(summarizeCodeplug(old).rows).toEqual([]);
  });
});
