/**
 * Smart Codeplug Importer
 * Enhanced importer with validation, error reporting, and flexible field matching
 */

import { sheetToJson, loadExcelJS } from './codeplugExport';
import type { Worksheet } from 'exceljs';
import type { Channel, Zone, ScanList, Contact } from '../models';
import type { CodeplugData } from './codeplugExport';
import { generateZoneId } from '../utils/zoneHelpers';

const CODEPLUG_VERSION = '1.0.0';

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
  strictMode?: boolean; // If true, fail on errors instead of continuing
  autoCorrect?: boolean; // If true, attempt to auto-correct common issues
  validateRanges?: boolean; // If true, validate data ranges
}

/**
 * Smart column name matcher - finds columns by fuzzy matching
 */
function findColumn(columns: string[], patterns: string[]): string | null {
  const normalizedColumns = columns.map(c => c.toLowerCase().trim());

  for (const pattern of patterns) {
    const normalizedPattern = pattern.toLowerCase().trim();

    // Exact match
    const exactIndex = normalizedColumns.indexOf(normalizedPattern);
    if (exactIndex >= 0) {
      return columns[exactIndex];
    }

    // Contains match
    for (let i = 0; i < normalizedColumns.length; i++) {
      if (normalizedColumns[i].includes(normalizedPattern) || normalizedPattern.includes(normalizedColumns[i])) {
        return columns[i];
      }
    }
  }

  return null;
}

/**
 * Get all column names from first row of an ExcelJS worksheet
 */
function getColumnNames(worksheet: Worksheet): string[] {
  const columns: string[] = [];
  const headerRow = worksheet.getRow(1);
  headerRow.eachCell({ includeEmpty: true }, (cell: { value: unknown }) => {
    const v = cell.value;
    if (v != null && typeof v === 'object' && 'result' in v) {
      columns.push(String((v as { result: unknown }).result));
    } else {
      columns.push(v != null ? String(v) : '');
    }
  });
  return columns;
}

/**
 * Validate frequency range
 */
function validateFrequency(freq: number, field: string): { valid: boolean; corrected?: number; warning?: string } {
  if (isNaN(freq) || freq <= 0) {
    return { valid: false, warning: `${field} is invalid: ${freq}` };
  }

  // Common ham radio bands
  if (freq < 136 || freq > 174) {
    if (freq < 400 || freq > 480) {
      return { valid: true, warning: `${field} (${freq} MHz) is outside common ham bands` };
    }
  }

  return { valid: true };
}

/**
 * Validate channel number
 */
function validateChannelNumber(num: number): { valid: boolean; corrected?: number; warning?: string } {
  if (isNaN(num) || num < 1 || num > 4000) {
    return { valid: false, warning: `Channel number ${num} is out of range (1-4000)` };
  }

  return { valid: true };
}

/**
 * Parse CTCSS/DCS with validation
 */
function parseCTCSSDCS(str: string | undefined, field: string): {
  result: { type: 'None' } | { type: 'CTCSS'; value: number } | { type: 'DCS'; value: number; polarity: 'N' | 'P' };
  warning?: string;
} {
  if (!str || str === 'None' || str === '' || str === '0') {
    return { result: { type: 'None' } };
  }

  const ctcssMatch = String(str).match(/CTCSS\s*(\d+\.?\d*)/i);
  if (ctcssMatch) {
    const value = parseFloat(ctcssMatch[1]);
    if (value >= 67.0 && value <= 254.1) {
      return { result: { type: 'CTCSS', value } };
    } else {
      return {
        result: { type: 'None' },
        warning: `${field} CTCSS value ${value} is out of range (67.0-254.1 Hz)`,
      };
    }
  }

  const dcsMatch = String(str).match(/DCS\s*(\d+)([NP])?/i);
  if (dcsMatch) {
    const value = parseInt(dcsMatch[1], 10);
    if (value >= 1 && value <= 754) {
      return {
        result: {
          type: 'DCS',
          value,
          polarity: (dcsMatch[2]?.toUpperCase() === 'P' ? 'P' : 'N') as 'N' | 'P',
        },
      };
    } else {
      return {
        result: { type: 'None' },
        warning: `${field} DCS value ${value} is out of range (1-754)`,
      };
    }
  }

  return {
    result: { type: 'None' },
    warning: `${field} could not parse CTCSS/DCS value: ${str}`,
  };
}

/**
 * Smart codeplug importer with validation and error reporting
 */
export async function smartImportCodeplug(
  file: File,
  options: ImportOptions = {}
): Promise<ImportResult> {
  const { onProgress, strictMode = false, validateRanges = true } = options;

  const warnings: ImportWarning[] = [];
  const errors: ImportError[] = [];

  onProgress?.(0, 'Reading file...');

  const ExcelJS = (await loadExcelJS()) as any;
  const buffer = await file.arrayBuffer();
  onProgress?.(10, 'Parsing Excel file...');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const result: CodeplugData = {
    channels: [],
    zones: [],
    scanLists: [],
    contacts: [],
    digitalEmergencies: [],
    digitalEmergencyConfig: null,
    analogEmergencies: [],
    radioSettings: null,
    radioInfo: null,
    exportDate: new Date().toISOString(),
    version: CODEPLUG_VERSION,
  };

  const summary: ImportSummary = {
    channels: { total: 0, valid: 0, warnings: 0, errors: 0 },
    zones: { total: 0, valid: 0, warnings: 0, errors: 0 },
    scanLists: { total: 0, valid: 0, warnings: 0, errors: 0 },
    contacts: { total: 0, valid: 0, warnings: 0, errors: 0 },
    sheets: { found: [], missing: [] },
  };

  const sheetNames = workbook.worksheets.map((ws: { name: string }) => ws.name);
  const expectedSheets = ['Channels', 'Zones', 'Scan Lists', 'Contacts', 'Digital Emergency', 'Analog Emergency', 'Radio Settings', 'Radio Info'];
  summary.sheets.found = sheetNames.filter((name: string) => expectedSheets.includes(name));
  summary.sheets.missing = expectedSheets.filter((name: string) => !sheetNames.includes(name));

  for (const sheetName of summary.sheets.missing) {
    warnings.push({
      type: 'missing_sheet',
      sheet: sheetName,
      message: `Sheet "${sheetName}" not found in file`,
    });
  }

  onProgress?.(20, 'Importing channels...');

  const channelsSheet = workbook.getWorksheet('Channels');
  if (channelsSheet) {
    const columns = getColumnNames(channelsSheet);
    const rows = sheetToJson(channelsSheet) as Record<string, unknown>[];
    summary.channels.total = rows.length;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!;
      const rowNum = i + 2;

      try {
        const channelNumCol = findColumn(columns, ['Channel #', 'Channel Number', 'Channel', '#', 'Number']);
        const nameCol = findColumn(columns, ['Name', 'Channel Name']);
        const rxFreqCol = findColumn(columns, ['RX Freq (MHz)', 'RX Frequency (MHz)', 'RX Freq', 'RX Frequency', 'Receive Frequency']);
        const txFreqCol = findColumn(columns, ['TX Freq (MHz)', 'TX Frequency (MHz)', 'TX Freq', 'TX Frequency', 'Transmit Frequency']);
        const modeCol = findColumn(columns, ['Mode', 'Channel Mode']);
        const rxCtcssCol = findColumn(columns, ['RX CTCSS/DCS', 'RX CTCSS', 'RX DCS', 'Receive CTCSS/DCS']);
        const txCtcssCol = findColumn(columns, ['TX CTCSS/DCS', 'TX CTCSS', 'TX DCS', 'Transmit CTCSS/DCS']);

        const channelNum = parseInt(String(row[channelNumCol ?? ''] ?? row['Channel #'] ?? row['Channel Number'] ?? '0'), 10);
        const channelValidation = validateChannelNumber(channelNum);

        if (!channelValidation.valid) {
          if (strictMode) {
            errors.push({
              type: 'validation_error',
              sheet: 'Channels',
              row: rowNum,
              field: 'Channel Number',
              message: channelValidation.warning ?? 'Invalid channel number',
            });
            continue;
          } else {
            warnings.push({
              type: 'invalid_value',
              sheet: 'Channels',
              row: rowNum,
              field: 'Channel Number',
              message: channelValidation.warning ?? 'Invalid channel number',
              originalValue: channelNum,
            });
          }
        }

        const rxFreq = parseFloat(String(row[rxFreqCol ?? ''] ?? row['RX Freq (MHz)'] ?? row['RX Frequency (MHz)'] ?? '0'));
        const txFreq = parseFloat(String(row[txFreqCol ?? ''] ?? row['TX Freq (MHz)'] ?? row['TX Frequency (MHz)'] ?? '0'));

        let rxValidation: { valid: boolean; warning?: string } = { valid: true };
        let txValidation: { valid: boolean; warning?: string } = { valid: true };

        if (validateRanges) {
          rxValidation = validateFrequency(rxFreq, 'RX Frequency');
          txValidation = validateFrequency(txFreq, 'TX Frequency');

          if (rxValidation.warning) {
            warnings.push({
              type: 'invalid_value',
              sheet: 'Channels',
              row: rowNum,
              field: 'RX Frequency',
              message: rxValidation.warning,
              originalValue: rxFreq,
            });
          }

          if (txValidation.warning) {
            warnings.push({
              type: 'invalid_value',
              sheet: 'Channels',
              row: rowNum,
              field: 'TX Frequency',
              message: txValidation.warning,
              originalValue: txFreq,
            });
          }
        }

        const rxCTCSSDCS = parseCTCSSDCS(String(row[rxCtcssCol ?? ''] ?? row['RX CTCSS/DCS'] ?? ''), 'RX');
        const txCTCSSDCS = parseCTCSSDCS(String(row[txCtcssCol ?? ''] ?? row['TX CTCSS/DCS'] ?? ''), 'TX');

        if (rxCTCSSDCS.warning) {
          warnings.push({
            type: 'invalid_value',
            sheet: 'Channels',
            row: rowNum,
            field: 'RX CTCSS/DCS',
            message: rxCTCSSDCS.warning,
            originalValue: row[rxCtcssCol ?? ''] ?? row['RX CTCSS/DCS'],
          });
        }

        if (txCTCSSDCS.warning) {
          warnings.push({
            type: 'invalid_value',
            sheet: 'Channels',
            row: rowNum,
            field: 'TX CTCSS/DCS',
            message: txCTCSSDCS.warning,
            originalValue: row[txCtcssCol ?? ''] ?? row['TX CTCSS/DCS'],
          });
        }

        const channel: Channel = {
          number: channelNum,
          name: String(row[nameCol ?? ''] ?? row['Name'] ?? ''),
          rxFrequency: rxFreq,
          txFrequency: txFreq,
          mode: (row[modeCol ?? ''] ?? row['Mode'] ?? 'Analog') as Channel['mode'],
          bandwidth: (row['Bandwidth'] ?? '12.5kHz') as Channel['bandwidth'],
          rxCtcssDcs: rxCTCSSDCS.result,
          txCtcssDcs: txCTCSSDCS.result,
          power: (row['Power'] ?? 'High') as Channel['power'],
          scanAdd: false,
          scanListId: parseInt(String(row['Scan List'] ?? row['Scan List ID'] ?? '0'), 10) || 0,
          forbidTalkaround: row['Forbid Talkaround'] === 'Yes' || row['Forbid Talkaround'] === true,
          forbidTx: row['Forbid TX'] === 'Yes' || row['Forbid TX'] === true,
          loneWorker: row['Lone Worker'] === 'Yes' || row['Lone Worker'] === true,
          aprsReceive: row['APRS Receive'] === 'Yes' || row['APRS Receive'] === true,
          aprsReportMode: (row['APRS Report'] ?? row['APRS Report Mode'] ?? 'Off') as Channel['aprsReportMode'],
          contactId: parseInt(String(row['Contact ID'] ?? '0'), 10) || 0,
          colorCode: parseInt(String(row['Color Code'] ?? '0'), 10) || 0,
          squelchLevel: parseInt(String(row['Squelch'] ?? row['Squelch Level'] ?? '3'), 10) || 3,
          digitalEmergencySystemId: parseInt(String(row['Digital Emergency System ID'] ?? '0'), 10) || 0,
          emergencySystemId: parseInt(String(row['Emergency ID'] ?? row['Emergency System ID'] ?? '0'), 10) || 0,
          emergencyIndicator: row['Emergency'] === 'Yes' || row['Emergency'] === true,
          emergencyAck: row['Emergency Ack'] === 'Yes' || row['Emergency Ack'] === true,
          voxFunction: row['VOX'] === 'Yes' || row['VOX'] === true,
          scramble: row['Scramble'] === 'Yes' || row['Scramble'] === true,
          compander: row['Compander'] === 'Yes' || row['Compander'] === true,
          talkback: row['Talkback'] === 'Yes' || row['Talkback'] === true,
          pttIdDisplay: row['PTT ID Display'] === 'Yes' || row['PTT ID Display'] === true,
          pttId: parseInt(String(row['PTT ID'] ?? '0'), 10) || 0,
          companderDup: row['Compander Dup'] === 'Yes' || row['Compander Dup'] === true,
          voxRelated: row['VOX Related'] === 'Yes' || row['VOX Related'] === true,
          rxSquelchMode: (row['RX Squelch Mode'] ?? 'Carrier/CTC') as Channel['rxSquelchMode'],
          stepFrequency: parseInt(String(row['Step Frequency'] ?? '0'), 10) || 0,
          signalingType: (row['Signaling Type'] ?? 'None') as Channel['signalingType'],
          pttIdType: (row['PTT ID Type'] ?? 'Off') as Channel['pttIdType'],
          unknown1A_6_4: 0,
          unknown1A_3: false,
          unknown1C_1_0: 0,
          unknown1D_3_0: 0,
          unknown25_7_6: 0,
          unknown25_3_0: 0,
          unknown26_3_1: 0,
          unknown26_0: false,
          unknown29_3_2: 0,
          unknown29_1_0: 0,
          unknown2A: 0,
          pttIdDisplay2: false,
        };

        result.channels.push(channel);
        summary.channels.valid++;

        if (rxCTCSSDCS.warning || txCTCSSDCS.warning || rxValidation.warning || txValidation.warning) {
          summary.channels.warnings++;
        }
      } catch (err) {
        summary.channels.errors++;
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';

        if (strictMode) {
          errors.push({
            type: 'parse_error',
            sheet: 'Channels',
            row: rowNum,
            message: `Failed to parse channel: ${errorMsg}`,
          });
        } else {
          warnings.push({
            type: 'invalid_value',
            sheet: 'Channels',
            row: rowNum,
            message: `Channel parsing issue: ${errorMsg}`,
          });
        }
      }
    }
  }

  onProgress?.(60, 'Importing zones and scan lists...');

  const zonesSheet = workbook.getWorksheet('Zones');
  if (zonesSheet) {
    const rows = sheetToJson(zonesSheet) as Record<string, unknown>[];
    summary.zones.total = rows.length;

    for (const row of rows) {
      try {
        const zone: Zone = {
          id: generateZoneId(),
          name: String(row['Zone Name'] ?? ''),
          channels: String(row['Channels'] ?? '').split(',').map((c: string) => parseInt(c.trim(), 10)).filter((n: number) => !isNaN(n)),
        };
        result.zones.push(zone);
        summary.zones.valid++;
      } catch {
        summary.zones.errors++;
      }
    }
  }

  const scanListsSheet = workbook.getWorksheet('Scan Lists');
  if (scanListsSheet) {
    const rows = sheetToJson(scanListsSheet) as Record<string, unknown>[];
    summary.scanLists.total = rows.length;

    for (const row of rows) {
      try {
        const priorityCh1 = row['Priority Channel 1'];
        const priorityCh2 = row['Priority Channel 2'];
        const designatedTx = row['Designated TX Channel'];

        const scanList: ScanList = {
          name: String(row['Scan List Name'] ?? ''),
          ctcScanMode: parseInt(String(row['CTC Scan Mode'] ?? '0'), 10) || 0,
          scanTxMode: parseInt(String(row['Scan TX Mode'] ?? '0'), 10) || 0,
          hangTime: row['Hang Time (tenths)'] != null && row['Hang Time (tenths)'] !== '' ? parseInt(String(row['Hang Time (tenths)']), 10) : undefined,
          priority1Type: row['Priority 1 Type'] != null ? parseInt(String(row['Priority 1 Type']), 10) : 0,
          priority2Type: row['Priority 2 Type'] != null ? parseInt(String(row['Priority 2 Type']), 10) : 0,
          priorityChannel1: priorityCh1 != null && priorityCh1 !== '' ? parseInt(String(priorityCh1), 10) : undefined,
          priorityChannel2: priorityCh2 != null && priorityCh2 !== '' ? parseInt(String(priorityCh2), 10) : undefined,
          designatedTxChannel: designatedTx != null && designatedTx !== '' ? parseInt(String(designatedTx), 10) : undefined,
          channels: String(row['Channels'] ?? '').split(',').map((c: string) => parseInt(c.trim(), 10)).filter((n: number) => !isNaN(n)),
        };
        result.scanLists.push(scanList);
        summary.scanLists.valid++;
      } catch {
        summary.scanLists.errors++;
      }
    }
  }

  onProgress?.(80, 'Importing contacts and settings...');

  const contactsSheet = workbook.getWorksheet('Contacts');
  if (contactsSheet) {
    const rows = sheetToJson(contactsSheet) as Record<string, unknown>[];
    summary.contacts.total = rows.length;

    for (const row of rows) {
      try {
        const contact: Contact = {
          id: parseInt(String(row['ID'] ?? '0'), 10) || 0,
          name: String(row['Name'] ?? ''),
          callSign: String(row['Call Sign'] ?? ''),
          dmrId: parseInt(String(row['DMR ID'] ?? '0'), 10) || 0,
        };
        result.contacts.push(contact);
        summary.contacts.valid++;
      } catch {
        summary.contacts.errors++;
      }
    }
  }

  onProgress?.(100, 'Import complete');

  if (strictMode && errors.length > 0) {
    throw new Error(`Import failed with ${errors.length} error(s). First error: ${errors[0].message}`);
  }

  return {
    data: result,
    warnings,
    errors,
    summary,
  };
}
