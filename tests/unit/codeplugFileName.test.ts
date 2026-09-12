/**
 * An exported codeplug is named for the radio it belongs to.
 *
 * These files pile up in a Downloads folder, and
 * "codeplug-export-2026-09-12T10-14-22" says nothing about which radio it came
 * off. That matters once somebody owns several: writing the wrong codeplug to a
 * radio is not a cheap mistake.
 *
 * The model comes from the file's OWN radioInfo, so the name and the contents
 * cannot disagree — and a converted codeplug is named for its TARGET, which is
 * the radio it is now for.
 */

import { describe, it, expect } from 'vitest';
import { codeplugFileName, type CodeplugData } from '../../src/services/codeplugExport';

const AT = new Date('2026-09-12T10:14:22.000Z');

const data = (model: string | null): CodeplugData => ({
  channels: [], zones: [], scanLists: [], contacts: [],
  digitalEmergencies: [], digitalEmergencyConfig: null, analogEmergencies: [],
  radioSettings: null,
  radioInfo: model === null ? null : ({ model } as CodeplugData['radioInfo']),
  messages: [], radioIds: [], quickContacts: [], rxGroups: [], encryptionKeys: [],
  exportDate: AT.toISOString(), version: '1.1.0',
});

describe('the exported file is named for its radio', () => {
  it('puts the model where the word "export" used to be, as one lower-case word', () => {
    expect(codeplugFileName(data('DA-7X2'), AT)).toBe('codeplug-da7x2-2026-09-12T10-14-22.neonplug');
    expect(codeplugFileName(data('DM-32UV'), AT)).toBe('codeplug-dm32uv-2026-09-12T10-14-22.neonplug');
    expect(codeplugFileName(data('AT-D890UV'), AT)).toBe('codeplug-atd890uv-2026-09-12T10-14-22.neonplug');
    expect(codeplugFileName(data('UV5R-Mini'), AT)).toBe('codeplug-uv5rmini-2026-09-12T10-14-22.neonplug');
  });

  it('drops the segment when no radio is known, rather than inventing one', () => {
    // A file called "unknown" would be a claim. An absent radioInfo is not one.
    expect(codeplugFileName(data(null), AT)).toBe('codeplug-2026-09-12T10-14-22.neonplug');
    expect(codeplugFileName(data('   '), AT)).toBe('codeplug-2026-09-12T10-14-22.neonplug');
  });

  it('never lets a model break the file name', () => {
    // Every model shipped today is already safe; this is for the ones that
    // are not — a slash would make the browser treat it as a path.
    expect(codeplugFileName(data('Weird / Model v2'), AT))
      .toBe('codeplug-weirdmodelv2-2026-09-12T10-14-22.neonplug');
    expect(codeplugFileName(data('///'), AT)).toBe('codeplug-2026-09-12T10-14-22.neonplug');
  });

  it('keeps the timestamp, so two exports of one radio do not collide', () => {
    const later = new Date('2026-09-12T10:15:00.000Z');
    expect(codeplugFileName(data('DA-7X2'), AT))
      .not.toBe(codeplugFileName(data('DA-7X2'), later));
  });
});
