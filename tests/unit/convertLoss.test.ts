/**
 * The convert-loss list gives every item its count.
 *
 * Two clauses used to print none ("channels had a scan list reference cleared")
 * because they treated formatPlural as returning the count with the noun.
 */

import { describe, it, expect } from 'vitest';
import { describeMigrationLoss } from '../../src/components/layout/convertLoss';
import type { MigrationLoss } from '../../src/services/codeplugMigration';

const none = (): MigrationLoss => ({
  channelsDropped: 0, zonesLost: 0, scanListsLost: 0, contactsLost: 0, radioIdsLost: 0,
  digitalEmergenciesLost: 0, messagesLost: 0, quickContactsLost: 0, rxGroupsLost: 0,
  encryptionKeysLost: 0, settingsCleared: false, zoneChannelsTrimmed: 0,
  scanListChannelsTrimmed: 0, rxGroupMembersTrimmed: 0, scanListRefsCleared: 0,
  powerLevelsDowngraded: 0,
});

describe('describeMigrationLoss', () => {
  it('says nothing when nothing is lost', () => {
    expect(describeMigrationLoss(none())).toEqual([]);
  });

  it('gives the scan-list and power clauses their counts', () => {
    const items = describeMigrationLoss({ ...none(), scanListRefsCleared: 4, powerLevelsDowngraded: 1 });
    expect(items).toEqual([
      '4 channels lost a scan list reference: the list does not exist on this radio',
      '1 channel stepped down to the strongest power this radio supports',
    ]);
  });

  it('uses real plurals, and the same nouns as the import summary', () => {
    const items = describeMigrationLoss({ ...none(), channelsDropped: 1, quickContactsLost: 206, zoneChannelsTrimmed: 12 });
    expect(items).toEqual([
      '1 channel removed',
      '206 talk groups removed',
      "12 zone members trimmed to this radio's per-zone limit",
    ]);
  });

  it('ends with the settings, which never carry over', () => {
    expect(describeMigrationLoss({ ...none(), settingsCleared: true })).toEqual([
      'Radio settings cleared: they do not map between radios',
    ]);
  });
});
