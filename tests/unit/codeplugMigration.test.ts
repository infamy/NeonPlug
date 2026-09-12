/**
 * Converting a codeplug between radios, with the target's real limits applied.
 *
 * The converter had no tests at all, and it truncated LISTS without ever
 * looking at what fits INSIDE them. Both directions between the two DMR radios
 * overflowed something:
 *
 *   DM-32 -> DA-7X2   250 radio IDs into a radio that holds 64
 *   DA-7X2 -> DM-32   10,000 talkgroups into 800, 160-member zones into 64,
 *                     50-member scan lists into 15
 *
 * The overflow was left to each radio's encoder, which is the worst place for
 * it: the DA-7X2 write gate refuses outright, and the DM-32 masks values and
 * writes something else.
 */

import { describe, it, expect } from 'vitest';
import { migrateCodeplug } from '../../src/services/codeplugMigration';
import type { CodeplugData } from '../../src/services/codeplugExport';
import type { Channel } from '../../src/models/Channel';

const D890 = 'DA-7X2';
const DM32 = 'DM-32UV';

const channel = (number: number, extra: Partial<Channel> = {}): Channel =>
  ({ number, name: `CH${number}`, rxFrequency: 145 + number / 1000, txFrequency: 145 + number / 1000,
     mode: 'Digital', scanListId: 0, ...extra } as Channel);

function codeplug(over: Partial<CodeplugData> = {}, sourceModel = D890): CodeplugData {
  return {
    channels: [channel(1), channel(2)],
    zones: [], scanLists: [], contacts: [],
    digitalEmergencies: [], digitalEmergencyConfig: null, analogEmergencies: [],
    radioSettings: null,
    radioInfo: { model: sourceModel, firmware: 'V100' } as CodeplugData['radioInfo'],
    messages: [], radioIds: [], quickContacts: [], rxGroups: [], encryptionKeys: [],
    exportDate: '2026-09-12T00:00:00.000Z', version: '1.1.0',
    ...over,
  };
}

const ids = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ index: i, id: 1000 + i, name: `ID${i}` })) as never[];
const talkgroups = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ index: i, id: 100 + i, name: `TG${i}` })) as never[];

describe('DM-32 -> DA-7X2', () => {
  it('truncates DMR radio IDs to the 64 the DA-7X2 holds', () => {
    // The DM-32 allows 250. Left alone, the extra 186 reached a 64-slot table.
    const { migrated, loss } = migrateCodeplug(codeplug({ radioIds: ids(250) }, DM32), D890);
    expect(migrated.radioIds).toHaveLength(64);
    expect(loss.radioIdsLost).toBe(186);
  });

  it('leaves talkgroups alone — the DA-7X2 holds far more', () => {
    const { migrated, loss } = migrateCodeplug(codeplug({ quickContacts: talkgroups(800) }, DM32), D890);
    expect(migrated.quickContacts).toHaveLength(800);
    expect(loss.quickContactsLost).toBe(0);
  });
});

describe('DA-7X2 -> DM-32', () => {
  it('truncates talkgroups to the 800 the DM-32 holds', () => {
    const { migrated, loss } = migrateCodeplug(codeplug({ quickContacts: talkgroups(1000) }), DM32);
    expect(migrated.quickContacts).toHaveLength(800);
    expect(loss.quickContactsLost).toBe(200);
  });

  it('trims zone members to 64, rather than leaving it to the encoder', () => {
    const channels = Array.from({ length: 160 }, (_, i) => channel(i + 1));
    const zone = { id: 'z1', name: 'BIG', channels: channels.map((c) => c.number) };
    const { migrated, loss } = migrateCodeplug(codeplug({ channels, zones: [zone] }), DM32);
    expect(migrated.zones[0]!.channels).toHaveLength(64);
    expect(loss.zoneChannelsTrimmed).toBe(96);
  });

  it('trims scan list members to 15', () => {
    const channels = Array.from({ length: 50 }, (_, i) => channel(i + 1));
    const list = { id: 1, name: 'SL', channels: channels.map((c) => c.number) };
    const { migrated, loss } = migrateCodeplug(
      codeplug({ channels, scanLists: [list] as never }), DM32
    );
    expect(migrated.scanLists[0]!.channels).toHaveLength(15);
    expect(loss.scanListChannelsTrimmed).toBe(35);
  });
});

describe('references that outlive what they point at', () => {
  it('clears a channel pointing at a scan list that did not survive', () => {
    // Two lists survive; a channel aimed at list 5 would be dangling. The
    // DA-7X2 write refuses that outright and the DM-32 masks it to another
    // list — so the converter clears it and says so.
    const channels = [channel(1, { scanListId: 5 }), channel(2, { scanListId: 1 })];
    const scanLists = [
      { id: 1, name: 'A', channels: [1] },
      { id: 2, name: 'B', channels: [2] },
    ] as never;
    const { migrated, loss } = migrateCodeplug(codeplug({ channels, scanLists }), DM32);
    expect(migrated.channels[0]!.scanListId).toBe(0);
    expect(migrated.channels[1]!.scanListId).toBe(1);
    expect(loss.scanListRefsCleared).toBe(1);
  });

  it('clears every scan list reference when the target has no scan lists', () => {
    // Analog, deliberately: an analog-only target drops digital channels first,
    // and a dropped channel proves nothing about reference clearing.
    const channels = [channel(1, { mode: 'Analog', scanListId: 3 })];
    const { migrated, loss } = migrateCodeplug(codeplug({ channels }), 'UV5R-Mini');
    expect(migrated.channels.every((c) => (c.scanListId ?? 0) === 0)).toBe(true);
    expect(loss.scanListRefsCleared).toBeGreaterThan(0);
  });
});

describe('encryption keys do not cross radios', () => {
  const keys = [{ id: 1, name: 'K1', encryptionType: 'AES', key: 'abcd' }] as never[];

  it('drops them when the target is a different radio', () => {
    // Slot, type, and what a type MEANS all differ between families: carrying
    // one over would be reinterpreting a key, not moving it.
    const { migrated, loss } = migrateCodeplug(codeplug({ encryptionKeys: keys }), DM32);
    expect(migrated.encryptionKeys).toEqual([]);
    expect(loss.encryptionKeysLost).toBe(1);
  });

  it('keeps them for the SAME radio under its other name', () => {
    // The DA-7X2 and the AT-D890UV are one radio with two descriptors, so a
    // codeplug moving between those names is not crossing anything.
    const { migrated, loss } = migrateCodeplug(codeplug({ encryptionKeys: keys }), 'AT-D890UV');
    expect(migrated.encryptionKeys).toHaveLength(1);
    expect(loss.encryptionKeysLost).toBe(0);
  });

  it('drops them when the source radio is unknown', () => {
    const source = codeplug({ encryptionKeys: keys });
    const { migrated } = migrateCodeplug({ ...source, radioInfo: null }, D890);
    expect(migrated.encryptionKeys).toEqual([]);
  });
});

describe('what the converter already did, still doing it', () => {
  it('clears settings, which never map between radios', () => {
    const source = codeplug({ radioSettings: { squelch: 3 } as never });
    const { migrated, loss } = migrateCodeplug(source, DM32);
    expect(migrated.radioSettings).toBeNull();
    expect(loss.settingsCleared).toBe(true);
  });

  it('drops digital channels for an analog-only target', () => {
    const { migrated } = migrateCodeplug(codeplug(), 'UV5R-Mini');
    expect(migrated.channels).toEqual([]);
    expect(migrated.quickContacts).toEqual([]);
  });
});
