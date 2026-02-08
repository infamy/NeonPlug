/**
 * Smart Codeplug Importer
 * Imports from the app's codeplug format (.neonplug = zip with codeplug.json) and returns a structured result.
 */

import { importCodeplug } from './codeplugExport';
import type { CodeplugData } from './codeplugExport';
import { generateZoneId } from '../utils/zoneHelpers';

export interface ImportResult {
  data: CodeplugData;
  warnings: ImportWarning[];
  errors: ImportError[];
  summary: ImportSummary;
}

export interface ImportWarning {
  type: 'missing_field' | 'invalid_value' | 'data_correction' | 'missing_sheet';
  sheet?: string;
  row?: number;
  field?: string;
  message: string;
  originalValue?: unknown;
  correctedValue?: unknown;
}

export interface ImportError {
  type: 'parse_error' | 'validation_error' | 'file_error';
  sheet?: string;
  row?: number;
  field?: string;
  message: string;
}

export interface ImportSummary {
  channels: { total: number; valid: number; warnings: number; errors: number };
  zones: { total: number; valid: number; warnings: number; errors: number };
  scanLists: { total: number; valid: number; warnings: number; errors: number };
  contacts: { total: number; valid: number; warnings: number; errors: number };
  sheets: { found: string[]; missing: string[] };
}

export interface ImportOptions {
  onProgress?: (progress: number, message: string) => void;
  strictMode?: boolean;
  autoCorrect?: boolean;
  validateRanges?: boolean;
}

/**
 * Import codeplug from a .neonplug file (zipped JSON).
 * Returns the same ImportResult shape for compatibility with any UI that uses smart import.
 */
export async function smartImportCodeplug(
  file: File,
  options: ImportOptions = {}
): Promise<ImportResult> {
  const { onProgress } = options;
  const warnings: ImportWarning[] = [];
  const errors: ImportError[] = [];

  onProgress?.(0, 'Reading file...');

  let data: CodeplugData;
  try {
    data = await importCodeplug(file);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to read codeplug file';
    errors.push({ type: 'file_error', message });
    onProgress?.(100, 'Import failed');
    return {
      data: {
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
        encryptionKeys: [],
        exportDate: new Date().toISOString(),
        version: '1.0.0',
      },
      warnings,
      errors,
      summary: {
        channels: { total: 0, valid: 0, warnings: 0, errors: 0 },
        zones: { total: 0, valid: 0, warnings: 0, errors: 0 },
        scanLists: { total: 0, valid: 0, warnings: 0, errors: 0 },
        contacts: { total: 0, valid: 0, warnings: 0, errors: 0 },
        sheets: { found: [], missing: [] },
      },
    };
  }

  onProgress?.(100, 'Import complete');

  // Ensure zones have ids
  data.zones = data.zones.map((z) => ({
    ...z,
    id: z.id ?? generateZoneId(),
  }));

  const summary: ImportSummary = {
    channels: {
      total: data.channels.length,
      valid: data.channels.length,
      warnings: 0,
      errors: 0,
    },
    zones: {
      total: data.zones.length,
      valid: data.zones.length,
      warnings: 0,
      errors: 0,
    },
    scanLists: {
      total: data.scanLists.length,
      valid: data.scanLists.length,
      warnings: 0,
      errors: 0,
    },
    contacts: {
      total: data.contacts.length,
      valid: data.contacts.length,
      warnings: 0,
      errors: 0,
    },
    sheets: { found: ['codeplug.json'], missing: [] },
  };

  return {
    data,
    warnings,
    errors,
    summary,
  };
}
