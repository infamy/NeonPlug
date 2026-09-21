/**
 * Every table the UI can edit must reach the radio, or say why it does not.
 *
 * This is an inventory, and it exists because the failure it guards is SILENT.
 * A table gets read, parsed, shown in the UI and edited by the user, and then
 * the write simply does not carry it — no refusal, no warning, and a dry run
 * that looks clean because nothing changed. Two of these were found by accident
 * in one session on 2026-09-11: the zone A/B current channel (the edit was
 * overridden by the read-time value) and the settings under-report. Nothing
 * stopped a third.
 *
 * The ledger below is typed `Record<keyof RadioTables, …>`, AND checked against
 * the interface at runtime. Both, deliberately: `tsconfig.json` includes only
 * `src`, so tests are never type-checked by `npm run build` — the Record type
 * alone would have been a claim nothing enforced. The runtime check parses
 * `radioTables.ts` the way `tools/d890-coverage.mjs` parses `recordLayout.ts`,
 * so adding a table and forgetting to wire it fails THIS test, in CI, today.
 *
 * What this does NOT catch, stated plainly so nobody trusts it too far: a table
 * that is wired but whose value loses to something else — precisely the zone
 * A/B bug. Reaching the builder is necessary, not sufficient. `plan` entries
 * are verified by seeding and checking the value arrives; `store` and
 * `separate` entries are documentation, covered by their own tests.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { useRadioStore } from '../../src/store/radioStore';
import { buildD890CodeplugTables } from '../../src/services/d890WriteInput';
import type { RadioTables } from '../../src/types/radioTables';

type Wiring =
  /** Reaches the codeplug write plan through `buildD890CodeplugTables`. */
  | { kind: 'plan'; fields: readonly string[]; note?: string }
  /** Reaches the plan, but sourced from a store rather than from `tables`. */
  | { kind: 'store'; via: string }
  /** Written to the radio by a path of its own. */
  | { kind: 'separate'; via: string }
  /** Not written. Must say why — this is the list that should shrink. */
  | { kind: 'none'; why: string };

const LEDGER: Record<keyof RadioTables, Wiring> = {
  writeOriginals: { kind: 'none', why: 'Read bookkeeping — the originals a write patches, never user data.' },
  pictures: { kind: 'separate', via: 'protocol.writeImage, from the Diagnostics picture panel' },
  roaming: {
    kind: 'plan',
    fields: ['roamingChannels'],
    note: 'Only .channels. Roaming ZONES have an encoder and no planner — see TODO-DA7X2.md.',
  },
  satellites: { kind: 'none', why: 'Read and displayed only; no encoder exists yet.' },
  emergencyAlarm: { kind: 'plan', fields: ['emergencySettings', 'emergencyContact'] },
  broadcast: { kind: 'plan', fields: ['amChannels', 'fmChannels', 'amVfo', 'fmVfo'] },
  amZones: { kind: 'plan', fields: ['amZones'] },
  toneLists: { kind: 'plan', fields: ['fiveTone', 'twoTone'] },
  gpsRoaming: { kind: 'plan', fields: ['gpsRoaming'] },
  zoneCurrentChannels: { kind: 'plan', fields: ['zoneCurrentChannels'] },
  zoneCurrentEdits: {
    kind: 'plan',
    fields: ['zoneCurrentChannels'],
    note: 'Overlaid on the read-time baseline by zone id — the fix for the 2026-09-11 drop.',
  },
  autoRepeaterOffsets: { kind: 'plan', fields: ['autoRepeaterOffsets'] },
  statusMessages: { kind: 'plan', fields: ['statusMessages'] },
  hotKeys: { kind: 'plan', fields: ['hotKeys'] },
  analogAddressBook: { kind: 'plan', fields: ['analogContacts'] },
  mdc1200Contacts: { kind: 'plan', fields: ['mdc1200Contacts'] },
  smsStore: { kind: 'plan', fields: ['smsStore'] },
  dtmf: { kind: 'plan', fields: ['dtmf'] },
  powerOnDisplay: { kind: 'plan', fields: ['powerOnDisplay'] },
  masterRadioId: { kind: 'plan', fields: ['masterRadioId'] },
  predefinedSms: { kind: 'store', via: 'quickMessagesStore via d890QuickMessages — texts and SMS chain move together' },
  scanListsDetailed: { kind: 'store', via: 'scan list store via d890ScanLists' },
  zoneRoamMask: { kind: 'none', why: 'Blocked: no confirmed encoder or address. See TODO-DA7X2.md.' },
};

/** Structurally plausible, deliberately EMPTY values — presence is the test. */
const SEED = {
  roaming: { channels: [], zones: [] },
  emergencyAlarm: { settings: {}, contact: {} },
  broadcast: { am: [], fm: [], amVfo: {}, fmVfo: {} },
  amZones: [],
  toneLists: { fiveTone: [], twoTone: [] },
  gpsRoaming: [],
  zoneCurrentChannels: { a: [], b: [] },
  zoneCurrentEdits: {},
  autoRepeaterOffsets: [],
  statusMessages: [],
  hotKeys: [],
  analogAddressBook: [],
  mdc1200Contacts: [],
  smsStore: {},
  dtmf: {},
  powerOnDisplay: { line1: '', line2: '', password: '' },
  masterRadioId: {},
} as unknown as Partial<RadioTables>;

const planned = Object.entries(LEDGER).filter(([, w]) => w.kind === 'plan');

/**
 * The keys of `RadioTables`, read from the source.
 *
 * Types are gone at runtime and tests are outside `tsconfig.json`'s `include`,
 * so this is what actually holds the ledger to the interface.
 */
function radioTableKeys(): string[] {
  const src = readFileSync(
    join(__dirname, '../../src/types/radioTables.ts'), 'utf8'
  );
  const start = src.indexOf('export interface RadioTables {');
  expect(start, 'RadioTables interface not found — has it been renamed?').toBeGreaterThan(-1);
  const body = src.slice(start, src.indexOf('\n}', start));
  // Top-level members only: nested object literals are indented deeper.
  return [...body.matchAll(/^ {2}([a-zA-Z][a-zA-Z0-9_]*)\??:/gm)].map((m) => m[1]!);
}

describe('the table wiring ledger', () => {
  it('covers every key of RadioTables, checked against the source', () => {
    // The failure this produces is the useful one: add a table to RadioTables,
    // forget to wire it, and its name appears here.
    const keys = radioTableKeys();
    expect(keys.length).toBeGreaterThanOrEqual(20);
    expect(keys.filter((k) => !(k in LEDGER))).toEqual([]);
    expect(Object.keys(LEDGER).filter((k) => !keys.includes(k))).toEqual([]);
    expect(planned.length).toBeGreaterThan(0);
  });

  it('gives a reason for every table that is NOT written', () => {
    for (const [key, w] of Object.entries(LEDGER)) {
      if (w.kind === 'none') expect(w.why.length, key).toBeGreaterThan(20);
      if (w.kind === 'separate') expect(w.via.length, key).toBeGreaterThan(10);
      if (w.kind === 'store') expect(w.via.length, key).toBeGreaterThan(10);
    }
  });
});

describe('every table marked "plan" actually arrives', () => {
  beforeEach(() => {
    useRadioStore.setState({ tables: { ...SEED } });
  });

  it('carries each one into the write input', () => {
    const out = buildD890CodeplugTables([], []) as Record<string, unknown>;
    const missing: string[] = [];
    for (const [key, w] of planned) {
      if (w.kind !== 'plan') continue;
      for (const field of w.fields) {
        if (out[field] === undefined) missing.push(`${key} -> ${field}`);
      }
    }
    // A name here means an edit the user can make that the radio never sees.
    expect(missing).toEqual([]);
  });

  it('carries nothing for a table the ledger says is not written', () => {
    // Guards the other direction: if one of these gets wired, the ledger has to
    // be updated rather than silently drifting out of date.
    const out = buildD890CodeplugTables([], []) as Record<string, unknown>;
    expect(out.satellites).toBeUndefined();
    expect(out.zoneRoamMask).toBeUndefined();
    expect(out.pictures).toBeUndefined();
  });
});
