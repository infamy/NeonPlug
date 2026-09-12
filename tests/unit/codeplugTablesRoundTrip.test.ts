/**
 * A backup has to contain the radio's own tables.
 *
 * `CodeplugData` describes what every radio has — channels, zones, scan lists,
 * contacts, talk groups, keys. Everything the DA-7X2 holds BESIDE that was
 * simply absent from an exported file: AM airband and its zones, FM broadcast,
 * roaming, DTMF, hot keys, status messages, MDC1200, the analog address book,
 * the power-on display, auto-repeater offsets, GPS roaming. Snapshots use the
 * same format, so "Recent codeplugs" dropped them too.
 *
 * That is not an abstract gap: the write dialog tells people to have a backup
 * of their codeplug before writing, and the backup it points at was partial.
 *
 * Three tables stay out on purpose and this pins which: the read log (raw bytes
 * and session bookkeeping), the pictures (~120 KB, own read/write path) and the
 * zone roam mask (Uint8Arrays this codec cannot encode, and nothing writes it).
 */

import { describe, it, expect, vi } from 'vitest';
import {
  codeplugToJsonSafe,
  jsonSafeToCodeplug,
  exportableTables,
  applyImportedTables,
  UNEXPORTABLE_TABLES,
  type CodeplugData,
} from '../../src/services/codeplugExport';
import type { RadioTables } from '../../src/types/radioTables';

/** The D890-only tables a backup has to survive, with recognisable values. */
const RADIO_TABLES = {
  broadcast: { am: [{ index: 0, name: 'CZBB TWR', frequency: 118.1 }], fm: [], amVfo: null, fmVfo: null },
  amZones: [{ index: 0, name: 'CZBB', members: [0, 1], currentChannel: 0 }],
  dtmf: { codes: ['1234'] },
  hotKeys: [{ slot: 0, action: 1 }],
  statusMessages: [{ slot: 0, text: 'ON DUTY' }],
  mdc1200Contacts: [{ slot: 0, name: 'BASE', id: 4660 }],
  analogAddressBook: [{ slot: 0, name: 'Contact1', callId: '12345' }],
  powerOnDisplay: { line1: 'ZULU ONE', line2: 'ANYTONE', password: '12345678' },
  autoRepeaterOffsets: [0.6, null],
  gpsRoaming: [{ index: 0, name: 'HOME' }],
  masterRadioId: { id: 1234567, name: 'RID Main' },
} as unknown as Partial<RadioTables>;

/** The three that must NOT travel, in the shapes that make them unfit. */
const HEAVY = {
  writeOriginals: { readLog: new Map([[0, new Uint8Array(16)]]) },
  pictures: { boot: new Uint8Array(40960), bk1: null, bk2: null },
  zoneRoamMask: [new Uint8Array(4)],
} as unknown as Partial<RadioTables>;

const base = (tables?: Partial<RadioTables>): CodeplugData => ({
  channels: [], zones: [], scanLists: [], contacts: [],
  digitalEmergencies: [], digitalEmergencyConfig: null, analogEmergencies: [],
  radioSettings: null, radioInfo: null, messages: [], radioIds: [],
  quickContacts: [], rxGroups: [], encryptionKeys: [],
  tables,
  exportDate: '2026-09-12T00:00:00.000Z',
  version: '1.1.0',
});

/** Export and read back through real JSON, as a file would. */
const roundTrip = (data: CodeplugData) =>
  jsonSafeToCodeplug(JSON.parse(JSON.stringify(codeplugToJsonSafe(data))));

describe('a codeplug file carries the radio-specific tables', () => {
  it('survives a full export and import', () => {
    const back = roundTrip(base({ ...RADIO_TABLES }));
    expect(Object.keys(back.tables ?? {}).sort()).toEqual(Object.keys(RADIO_TABLES).sort());
  });

  it('keeps the values, not just the keys', () => {
    const back = roundTrip(base({ ...RADIO_TABLES })).tables as Record<string, any>;
    expect(back.powerOnDisplay.line1).toBe('ZULU ONE');
    expect(back.broadcast.am[0].name).toBe('CZBB TWR');
    expect(back.statusMessages[0].text).toBe('ON DUTY');
    expect(back.autoRepeaterOffsets).toEqual([0.6, null]);
    expect(back.masterRadioId.name).toBe('RID Main');
  });

  it('names every table it refuses to carry', () => {
    expect([...UNEXPORTABLE_TABLES]).toEqual(['writeOriginals', 'pictures', 'zoneRoamMask']);
  });

  it('leaves the read log and pictures out of the file', () => {
    const json = codeplugToJsonSafe(base({ ...RADIO_TABLES, ...HEAVY }));
    const tables = (json.tables ?? {}) as Record<string, unknown>;
    for (const key of UNEXPORTABLE_TABLES) expect(tables[key], key).toBeUndefined();
    // The rest still travels.
    expect(tables.powerOnDisplay).toBeDefined();
    // And the file stays a file: a 40 KB picture would dwarf everything else.
    expect(JSON.stringify(json).length).toBeLessThan(4000);
  });

  it('drops them on the way IN as well, so a hand-edited file cannot smuggle one', () => {
    const back = jsonSafeToCodeplug({ tables: { ...RADIO_TABLES, ...HEAVY } } as never);
    for (const key of UNEXPORTABLE_TABLES) {
      expect((back.tables as Record<string, unknown>)[key], key).toBeUndefined();
    }
  });
});

describe('the format version is the writer\'s to stamp', () => {
  it('ignores a version the caller carried', () => {
    // Every builder hardcoded '1.0.0', so the first file containing the 1.1.0
    // `tables` field still called itself 1.0.0 — a file describing itself
    // wrongly is worse than one with no version at all.
    const json = codeplugToJsonSafe({ ...base({ ...RADIO_TABLES }), version: '1.0.0' });
    expect(json.version).toBe('1.1.0');
  });

  it('says 1.1.0 even when there are no tables to carry', () => {
    expect(codeplugToJsonSafe(base(undefined)).version).toBe('1.1.0');
  });
});

describe('older files and empty radios', () => {
  it('loads a file written before tables existed', () => {
    // Every .neonplug exported before 2026-09-12. No `tables` key at all.
    const back = jsonSafeToCodeplug({ channels: [], zones: [] } as never);
    expect(back.tables).toBeUndefined();
    expect(back.channels).toEqual([]);
  });

  it('reports nothing rather than an empty object when there is nothing to carry', () => {
    expect(exportableTables(undefined)).toBeUndefined();
    expect(exportableTables({})).toBeUndefined();
    expect(exportableTables({ ...HEAVY })).toBeUndefined();
  });
});

describe('restoring tables into the stores', () => {
  it('sets each carried table once and skips the excluded ones', () => {
    const setTable = vi.fn();
    const applied = applyImportedTables({ ...RADIO_TABLES, ...HEAVY }, setTable);
    expect(applied).toBe(Object.keys(RADIO_TABLES).length);
    const keys = setTable.mock.calls.map((c) => c[0]);
    expect(keys.sort()).toEqual(Object.keys(RADIO_TABLES).sort());
    expect(setTable).toHaveBeenCalledWith('powerOnDisplay', RADIO_TABLES.powerOnDisplay);
  });

  it('does nothing for a file that carries no tables', () => {
    const setTable = vi.fn();
    expect(applyImportedTables(undefined, setTable)).toBe(0);
    expect(setTable).not.toHaveBeenCalled();
  });
});
