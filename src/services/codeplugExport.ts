/**
 * Codeplug Export/Import Service
 * Exports and imports full codeplug data to/from a zipped JSON file (.neonplug)
 */

import { createZip, readZip } from '../utils/zip';
import { downloadBlob } from '../utils/download';
import type { Channel } from '../models/Channel';
import type { Zone } from '../models/Zone';
import type { ScanList } from '../models/ScanList';
import type { Contact } from '../models/Contact';
import type { DigitalEmergency, DigitalEmergencyConfig } from '../models/DigitalEmergency';
import type { AnalogEmergency } from '../models/AnalogEmergency';
import type { RadioSettings } from '../models/RadioSettings';
import type { RadioInfo } from '../types/radio';
import type { QuickTextMessage } from '../models/QuickTextMessage';
import type { DMRRadioID } from '../models/DMRRadioID';
import type { QuickContact } from '../models/QuickContact';
import type { RXGroup } from '../models/RXGroup';
import type { EncryptionKey } from '../models/EncryptionKey';
import type { RadioTables } from '../types/radioTables';
import { generateZoneId } from '../utils/zoneHelpers';

export interface CodeplugData {
  channels: Channel[];
  zones: Zone[];
  scanLists: ScanList[];
  contacts: Contact[];
  digitalEmergencies: DigitalEmergency[];
  digitalEmergencyConfig: DigitalEmergencyConfig | null;
  analogEmergencies: AnalogEmergency[];
  radioSettings: RadioSettings | null;
  radioInfo: RadioInfo | null;
  messages: QuickTextMessage[];
  radioIds: DMRRadioID[];
  quickContacts: QuickContact[];
  rxGroups: RXGroup[];
  encryptionKeys: EncryptionKey[];
  /**
   * Radio-specific tables — everything the shared model above cannot describe.
   *
   * Added 2026-09-12. Without it a DA-7X2 "backup" carried channels, zones,
   * scan lists, contacts and keys, and silently dropped AM airband and its
   * zones, FM broadcast, roaming, DTMF, hot keys, status messages, MDC1200, the
   * analog address book, the power-on display, auto-repeater offsets and GPS
   * roaming. The write dialog tells people to keep a backup before writing, so
   * the file it points at had better be one.
   *
   * Optional, and unknown keys are ignored on read, so older files load and
   * older builds load these files.
   */
  tables?: Partial<RadioTables>;
  exportDate: string;
  version: string;
}

/**
 * Tables deliberately kept OUT of an exported file.
 *
 * `writeOriginals` is the read log — megabytes of raw bytes, and bookkeeping
 * for one session rather than user data. `pictures` is ~120 KB of boot and
 * standby images with a read/write path of its own. `zoneRoamMask` holds
 * Uint8Arrays that this codec has no encoding for, and nothing writes it yet.
 *
 * Exported as a named list so what is missing from a backup is a fact in the
 * code rather than an accident of whatever happened to serialize.
 */
export const UNEXPORTABLE_TABLES = ['writeOriginals', 'pictures', 'zoneRoamMask'] as const;

/** The subset of a radio's tables that can travel in a file. */
export function exportableTables(
  tables: Partial<RadioTables> | undefined
): Partial<RadioTables> | undefined {
  if (!tables) return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(tables)) {
    if ((UNEXPORTABLE_TABLES as readonly string[]).includes(key)) continue;
    if (value === undefined) continue;
    out[key] = value;
  }
  return Object.keys(out).length > 0 ? (out as Partial<RadioTables>) : undefined;
}

/**
 * Put imported tables back, one `setTable` call each.
 *
 * Takes the setter rather than reaching for the store, so this stays a pure
 * function of its inputs and the service layer keeps no store dependency.
 */
export function applyImportedTables(
  tables: Partial<RadioTables> | undefined,
  setTable: <K extends keyof RadioTables>(key: K, value: RadioTables[K] | null) => void
): number {
  const safe = exportableTables(tables);
  if (!safe) return 0;
  let applied = 0;
  for (const [key, value] of Object.entries(safe)) {
    setTable(key as keyof RadioTables, value as RadioTables[keyof RadioTables]);
    applied += 1;
  }
  return applied;
}

// 1.1.0 adds the optional `tables` field. Additive: older files have no
// `tables` and load fine, and older builds ignore the key.
const CODEPLUG_VERSION = '1.1.0';
const CODEPLUG_JSON_FILENAME = 'codeplug.json';

/** Convert CodeplugData to a JSON-serializable object (Uint8Array → number[]) */
export function codeplugToJsonSafe(data: CodeplugData): Record<string, unknown> {
  return {
    ...data,
    channels: data.channels,
    zones: data.zones,
    scanLists: data.scanLists,
    contacts: data.contacts,
    digitalEmergencies: data.digitalEmergencies,
    digitalEmergencyConfig: data.digitalEmergencyConfig ?? null,
    analogEmergencies: data.analogEmergencies,
    radioSettings: data.radioSettings,
    radioInfo: data.radioInfo,
    messages: data.messages ?? [],
    radioIds: (data.radioIds ?? []).map((r) => ({
      ...r,
      dmrIdBytes: Array.from(r.dmrIdBytes ?? new Uint8Array(0)),
    })),
    quickContacts: (data.quickContacts ?? []).map((q) => ({
      ...q,
      rawData: Array.from(q.rawData ?? new Uint8Array(0)),
    })),
    rxGroups: data.rxGroups ?? [],
    encryptionKeys: data.encryptionKeys ?? [],
    // Filtered again here, not just at the call site: whatever reaches this
    // function is what lands in the file.
    tables: exportableTables(data.tables),
    exportDate: data.exportDate,
    // The WRITER stamps the format version, ignoring whatever the caller
    // carried. Every call site hardcoded '1.0.0', so the first file to contain
    // the 1.1.0 `tables` field still announced itself as 1.0.0 — caught by
    // exporting a real codeplug on 2026-09-12 and reading the file back.
    version: CODEPLUG_VERSION,
  };
}

/** Parse JSON object back to CodeplugData (number[] → Uint8Array, ensure zone ids) */
export function jsonSafeToCodeplug(raw: Record<string, unknown>): CodeplugData {
  const dig = (raw.digitalEmergencies as Record<string, unknown>[] | undefined) ?? [];
  const config = raw.digitalEmergencyConfig as Record<string, unknown> | null | undefined;
  const radioIdsRaw = (raw.radioIds as Record<string, unknown>[] | undefined) ?? [];
  const quickContactsRaw = (raw.quickContacts as Record<string, unknown>[] | undefined) ?? [];
  return {
    channels: (raw.channels as Channel[]) ?? [],
    zones: ((raw.zones as Zone[]) ?? []).map((z) => ({
      ...z,
      id: (z as Zone).id ?? generateZoneId(),
    })),
    scanLists: (raw.scanLists as ScanList[]) ?? [],
    contacts: (raw.contacts as Contact[]) ?? [],
    digitalEmergencies: dig as unknown as DigitalEmergency[],
    digitalEmergencyConfig: config as DigitalEmergencyConfig | null ?? null,
    analogEmergencies: (raw.analogEmergencies as AnalogEmergency[]) ?? [],
    radioSettings: (raw.radioSettings as RadioSettings | null) ?? null,
    radioInfo: (raw.radioInfo as RadioInfo | null) ?? null,
    messages: (raw.messages as QuickTextMessage[]) ?? [],
    radioIds: radioIdsRaw.map((r) => ({
      ...r,
      dmrIdBytes: new Uint8Array((r.dmrIdBytes as number[]) ?? []),
    })) as DMRRadioID[],
    quickContacts: quickContactsRaw.map((q) => ({
      ...q,
      rawData: new Uint8Array((q.rawData as number[]) ?? []),
    })) as QuickContact[],
    rxGroups: (raw.rxGroups as RXGroup[]) ?? [],
    encryptionKeys: (raw.encryptionKeys as EncryptionKey[]) ?? [],
    tables: exportableTables(raw.tables as Partial<RadioTables> | undefined),
    exportDate: String(raw.exportDate ?? new Date().toISOString()),
    version: String(raw.version ?? CODEPLUG_VERSION),
  };
}

/**
 * Export codeplug data to a zipped JSON file (.neonplug)
 * @param data Codeplug data to export
 * @param returnBlob If true, returns a Blob instead of downloading. For use in zip archives.
 */
/**
 * The name an exported codeplug is saved under.
 *
 * The model goes in it because these files pile up in a Downloads folder and
 * "codeplug-export-2026-09-12T10-14-22" says nothing about which radio it came
 * off — a real problem once somebody owns several, and writing the wrong
 * codeplug to a radio is not a cheap mistake. The model comes from the file's
 * OWN `radioInfo`, so the name and the contents cannot disagree; a converted
 * codeplug is therefore named for its TARGET, which is the radio it is now for.
 *
 * Drops the model segment when the model is unknown rather than inventing one —
 * a file called "unknown" would be a claim, and an absent radioInfo is not one.
 */
export function codeplugFileName(data: CodeplugData, now = new Date()): string {
  // 20260912T101422 — ISO 8601 basic form. The dashes and colons go because the
  // name already uses dashes to separate its parts, and 15 characters beats 19
  // in a file list without losing the seconds that keep two exports apart.
  const timestamp = now.toISOString().replace(/[-:]/g, '').slice(0, 15);
  const model = (data.radioInfo?.model ?? '').trim();
  if (!model) return `codeplug-${timestamp}.neonplug`;
  // Squashed to lower-case letters and digits: "DA-7X2" becomes "da7x2",
  // "AT-D890UV" becomes "atd890uv". The model's own punctuation would collide
  // with the dashes separating the name's parts, and dropping it keeps the
  // segment one readable word — which is also what makes a model unsafe for a
  // file name impossible rather than merely unlikely.
  const safe = model.toLowerCase().replace(/[^a-z0-9]+/g, '');
  return safe
    ? `codeplug-${safe}-${timestamp}.neonplug`
    : `codeplug-${timestamp}.neonplug`;
}

export async function exportCodeplug(data: CodeplugData, returnBlob?: boolean): Promise<Blob | void> {
  const jsonSafe = codeplugToJsonSafe(data);
  const jsonString = JSON.stringify(jsonSafe, null, 0);

  const blob = await createZip([{ name: CODEPLUG_JSON_FILENAME, data: jsonString }]);

  if (returnBlob) {
    return blob;
  }

  downloadBlob(blob, codeplugFileName(data));
}

/**
 * Import codeplug data from a .neonplug file (zip containing codeplug.json)
 */
export async function importCodeplug(file: File): Promise<CodeplugData> {
  const buffer = await file.arrayBuffer();
  const files = await readZip(buffer);

  const bytes = files.get(CODEPLUG_JSON_FILENAME);
  if (!bytes) {
    throw new Error(`Invalid codeplug file: missing ${CODEPLUG_JSON_FILENAME}`);
  }

  const text = new TextDecoder().decode(bytes);
  const raw = JSON.parse(text) as Record<string, unknown>;
  return jsonSafeToCodeplug(raw);
}
