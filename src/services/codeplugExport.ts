/**
 * Codeplug Export/Import Service
 * Exports and imports full codeplug data to/from a zipped JSON file (.neonplug)
 */

import JSZip from 'jszip';
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
  exportDate: string;
  version: string;
}

const CODEPLUG_VERSION = '1.0.0';
const CODEPLUG_JSON_FILENAME = 'codeplug.json';

/** Convert CodeplugData to a JSON-serializable object (Uint8Array → number[]) */
function codeplugToJsonSafe(data: CodeplugData): Record<string, unknown> {
  return {
    ...data,
    channels: data.channels,
    zones: data.zones,
    scanLists: data.scanLists,
    contacts: data.contacts,
    digitalEmergencies: data.digitalEmergencies.map((de) => ({
      ...de,
      fields: Array.from(de.fields),
    })),
    digitalEmergencyConfig: data.digitalEmergencyConfig
      ? {
          ...data.digitalEmergencyConfig,
          entryArray: data.digitalEmergencyConfig.entryArray
            ? Array.from(data.digitalEmergencyConfig.entryArray)
            : undefined,
          additionalConfig: data.digitalEmergencyConfig.additionalConfig
            ? Array.from(data.digitalEmergencyConfig.additionalConfig)
            : undefined,
        }
      : null,
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
    exportDate: data.exportDate,
    version: data.version,
  };
}

/** Parse JSON object back to CodeplugData (number[] → Uint8Array, ensure zone ids) */
function jsonSafeToCodeplug(raw: Record<string, unknown>): CodeplugData {
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
    digitalEmergencies: dig.map((de) => ({
      ...de,
      fields: new Uint8Array((de.fields as number[]) ?? []),
    })) as DigitalEmergency[],
    digitalEmergencyConfig: config
      ? {
          ...config,
          entryArray: config.entryArray ? new Uint8Array(config.entryArray as number[]) : undefined,
          additionalConfig: config.additionalConfig
            ? new Uint8Array(config.additionalConfig as number[])
            : undefined,
        } as DigitalEmergencyConfig
      : null,
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
    exportDate: String(raw.exportDate ?? new Date().toISOString()),
    version: String(raw.version ?? CODEPLUG_VERSION),
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

  const zip = new JSZip();
  zip.file(CODEPLUG_JSON_FILENAME, jsonString);

  const blob = await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/zip',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  if (returnBlob) {
    return blob;
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const filename = `codeplug-export-${timestamp}.neonplug`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Import codeplug data from a .neonplug file (zip containing codeplug.json)
 */
export async function importCodeplug(file: File): Promise<CodeplugData> {
  const buffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(buffer);

  const entry = zip.file(CODEPLUG_JSON_FILENAME);
  if (!entry) {
    throw new Error(`Invalid codeplug file: missing ${CODEPLUG_JSON_FILENAME}`);
  }

  const text = await entry.async('string');
  const raw = JSON.parse(text) as Record<string, unknown>;
  return jsonSafeToCodeplug(raw);
}

/**
 * Get codeplug data from all stores (stub - callers build from stores when needed)
 */
export function getCodeplugDataFromStores(): CodeplugData {
  return {
    channels: [],
    zones: [],
    scanLists: [],
    contacts: [],
    digitalEmergencies: [],
    digitalEmergencyConfig: null,
    analogEmergencies: [],
    radioSettings: null,
    radioInfo: null,
    messages: [],
    radioIds: [],
    quickContacts: [],
    rxGroups: [],
    exportDate: new Date().toISOString(),
    version: CODEPLUG_VERSION,
  };
}
