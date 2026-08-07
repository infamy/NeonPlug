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
import { generateZoneId } from '../utils/zoneHelpers';
import { APP_VERSION, COMMIT_HASH } from '../utils/version';

/**
 * Version of the `.neonplug` *file schema* — deliberately separate from the app
 * version. It changes only when the shape of the data changes, so a NeonPlug
 * release that ships no format change writes the same formatVersion as the one
 * before it.
 *
 * Bump rules, and what a reader that is too old does about each:
 *   major — a field changed meaning or was removed; an older reader would
 *           mis-interpret the file. **Hard reject, no override.**
 *   minor — fields were added. An older reader can show the file, but it cannot
 *           round-trip it: `jsonSafeToCodeplug` rebuilds a fixed shape, so the
 *           added fields are dropped and `codeplugToJsonSafe` re-stamps the
 *           current version. **Warn and allow an explicit override.**
 *   patch — no schema effect (encoding fixes that round-trip identically).
 *
 * The minor case is a warn-not-reject because the loss is on *save*, not on
 * load: opening the file to look at it is harmless, and a user who understands
 * that saving will discard the newer fields is entitled to make that call.
 * `CodeplugFormatError.canOverride` is what carries that distinction to the UI.
 *
 * When this first goes above 1.x, add a `migrations[from -> to]` chain in
 * `jsonSafeToCodeplug` rather than widening the ad-hoc `??` defaults below.
 */
export const CODEPLUG_FORMAT_VERSION = '1.0.0';

/**
 * Files written before format versioning existed either carry `version: '1.0.0'`
 * or nothing at all. Both are the same schema, so both read as 1.0.0.
 */
const LEGACY_FORMAT_VERSION = '1.0.0';

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
  exportDate: string;
  /**
   * Schema version of the file this data came from. Optional on the way *in* —
   * `codeplugToJsonSafe` always stamps the current writer's version, so callers
   * building a codeplug from live stores must not supply one (four call sites
   * used to hardcode '1.0.0' and would have silently kept doing so after a bump).
   */
  version?: string;
  /** NeonPlug version that wrote the file, for provenance on bug reports. */
  appVersion?: string;
  /** Commit hash of the build that wrote the file. */
  appCommit?: string;
}

const CODEPLUG_JSON_FILENAME = 'codeplug.json';

/** Numeric major/minor of a semver-ish string; unparseable parts read as 0 (fails open). */
function partsOf(version: string): { major: number; minor: number } {
  const [maj, min] = version.split('.');
  const major = parseInt(maj ?? '', 10);
  const minor = parseInt(min ?? '', 10);
  return {
    major: Number.isFinite(major) ? major : 0,
    minor: Number.isFinite(minor) ? minor : 0,
  };
}

export type FormatVerdict = 'ok' | 'newer-minor' | 'newer-major';

/** Compare a file's format version against what this build can read. */
export function checkFormatCompatibility(fileVersion: string): FormatVerdict {
  const file = partsOf(fileVersion);
  const self = partsOf(CODEPLUG_FORMAT_VERSION);
  if (file.major > self.major) return 'newer-major';
  if (file.major === self.major && file.minor > self.minor) return 'newer-minor';
  return 'ok';
}

/**
 * Thrown when a file's format is ahead of this build. `canOverride` tells the UI
 * whether to offer "open anyway" (newer minor) or only "update NeonPlug"
 * (newer major).
 */
export class CodeplugFormatError extends Error {
  readonly canOverride: boolean;
  readonly fileVersion: string;

  constructor(message: string, fileVersion: string, canOverride: boolean) {
    super(message);
    this.name = 'CodeplugFormatError';
    this.fileVersion = fileVersion;
    this.canOverride = canOverride;
  }
}

/**
 * Guard the import path. This data ends up written to radio hardware, so a field
 * that quietly changed meaning is exactly the silent corruption worth refusing.
 * Older and same-version files always load.
 *
 * @param allowNewerFormat set only after the user has accepted the newer-minor
 *   warning. It never relaxes the newer-major reject.
 */
export function assertReadableFormat(
  fileVersion: string,
  opts?: { allowNewerFormat?: boolean }
): void {
  const verdict = checkFormatCompatibility(fileVersion);
  if (verdict === 'ok') return;

  const preamble =
    `This codeplug was saved by a newer version of NeonPlug ` +
    `(file format ${fileVersion}, this build reads up to ${CODEPLUG_FORMAT_VERSION}).`;

  if (verdict === 'newer-major') {
    // No override: a major bump means existing fields changed meaning, so
    // everything shown would be suspect, not just the parts we can't see.
    throw new CodeplugFormatError(
      `${preamble}\n\nIt uses an incompatible format and cannot be opened by this build. ` +
        `Update NeonPlug to open it.`,
      fileVersion,
      false
    );
  }

  if (opts?.allowNewerFormat) return;

  throw new CodeplugFormatError(
    `${preamble}\n\nYou can open it, but any settings this build doesn't understand ` +
      `will not be shown — and if you save, export, or write to a radio afterwards, ` +
      `those settings will be permanently discarded.\n\n` +
      `Update NeonPlug to keep them.`,
    fileVersion,
    true
  );
}

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
    exportDate: data.exportDate,
    // Stamped by the writer, never taken from the caller — see CodeplugData.version.
    formatVersion: CODEPLUG_FORMAT_VERSION,
    // Mirrored into the old field name so a build predating formatVersion can
    // still read files written by this one.
    version: CODEPLUG_FORMAT_VERSION,
    appVersion: APP_VERSION,
    appCommit: COMMIT_HASH,
  };
}

/**
 * Parse JSON object back to CodeplugData (number[] → Uint8Array, ensure zone ids).
 *
 * Throws `CodeplugFormatError` if the file's format is ahead of this build; pass
 * `allowNewerFormat` once the user has accepted the newer-minor warning.
 */
export function jsonSafeToCodeplug(
  raw: Record<string, unknown>,
  opts?: { allowNewerFormat?: boolean }
): CodeplugData {
  const dig = (raw.digitalEmergencies as Record<string, unknown>[] | undefined) ?? [];
  const config = raw.digitalEmergencyConfig as Record<string, unknown> | null | undefined;
  const radioIdsRaw = (raw.radioIds as Record<string, unknown>[] | undefined) ?? [];
  const quickContactsRaw = (raw.quickContacts as Record<string, unknown>[] | undefined) ?? [];

  // formatVersion is canonical; `version` is what pre-versioning builds wrote;
  // absent entirely means an early file, which is still schema 1.0.0.
  const fileVersion = String(raw.formatVersion ?? raw.version ?? LEGACY_FORMAT_VERSION);
  assertReadableFormat(fileVersion, opts);

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
    exportDate: String(raw.exportDate ?? new Date().toISOString()),
    version: fileVersion,
    appVersion: raw.appVersion ? String(raw.appVersion) : undefined,
    appCommit: raw.appCommit ? String(raw.appCommit) : undefined,
  };
}

/**
 * Export codeplug data to a zipped JSON file (.neonplug)
 * @param data Codeplug data to export
 * @param returnBlob If true, returns a Blob instead of downloading. For use in zip archives.
 */
export async function exportCodeplug(data: CodeplugData, returnBlob?: boolean): Promise<Blob | void> {
  const jsonSafe = codeplugToJsonSafe(data);
  const jsonString = JSON.stringify(jsonSafe, null, 0);

  const blob = await createZip([{ name: CODEPLUG_JSON_FILENAME, data: jsonString }]);

  if (returnBlob) {
    return blob;
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  downloadBlob(blob, `codeplug-export-${timestamp}.neonplug`);
}

/**
 * Import codeplug data from a .neonplug file (zip containing codeplug.json).
 *
 * Throws `CodeplugFormatError` when the file is ahead of this build. Callers
 * should offer "open anyway" only when `canOverride` is true, then retry with
 * `{ allowNewerFormat: true }` — see `importCodeplugWithOverride`.
 */
export async function importCodeplug(
  file: File,
  opts?: { allowNewerFormat?: boolean }
): Promise<CodeplugData> {
  const buffer = await file.arrayBuffer();
  const files = await readZip(buffer);

  const bytes = files.get(CODEPLUG_JSON_FILENAME);
  if (!bytes) {
    throw new Error(`Invalid codeplug file: missing ${CODEPLUG_JSON_FILENAME}`);
  }

  const text = new TextDecoder().decode(bytes);
  const raw = JSON.parse(text) as Record<string, unknown>;
  return jsonSafeToCodeplug(raw, opts);
}

/**
 * Shared "warn, then let the user decide" wrapper for any codeplug read.
 *
 * Keeps the retry-after-confirm dance in one place so the three entry points
 * (file import, snapshot restore ×2) can't drift. Returns `null` when the user
 * declines the override; a hard reject (newer major) still throws so the
 * caller's normal error handling shows it.
 */
export async function readWithFormatOverride<T>(
  read: (opts?: { allowNewerFormat?: boolean }) => Promise<T>,
  confirmOverride: (error: CodeplugFormatError) => Promise<boolean>
): Promise<T | null> {
  try {
    return await read();
  } catch (error) {
    if (!(error instanceof CodeplugFormatError) || !error.canOverride) throw error;
    if (!(await confirmOverride(error))) return null;
    return await read({ allowNewerFormat: true });
  }
}
