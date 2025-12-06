/**
 * Smart Codeplug Importer
 * Enhanced importer with validation, error reporting, and flexible field matching
 */

import * as XLSX from 'xlsx';
import type { Channel, Zone, ScanList, Contact } from '../models';
import type { CodeplugData } from './codeplugExport';

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
  originalValue?: any;
  correctedValue?: any;
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
 * Get all column names from a sheet
 */
function getColumnNames(sheet: XLSX.WorkSheet): string[] {
  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
  const columns: string[] = [];
  
  for (let col = range.s.c; col <= range.e.c; col++) {
    const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col });
    const cell = sheet[cellAddress];
    if (cell && cell.v) {
      columns.push(String(cell.v));
    }
  }
  
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
        warning: `${field} CTCSS value ${value} is out of range (67.0-254.1 Hz)`
      };
    }
  }
  
  const dcsMatch = String(str).match(/DCS\s*(\d+)([NP])?/i);
  if (dcsMatch) {
    const value = parseInt(dcsMatch[1]);
    if (value >= 1 && value <= 754) {
      return { 
        result: { 
          type: 'DCS', 
          value, 
          polarity: (dcsMatch[2]?.toUpperCase() === 'P' ? 'P' : 'N') as 'N' | 'P' 
        }
      };
    } else {
      return { 
        result: { type: 'None' },
        warning: `${field} DCS value ${value} is out of range (1-754)`
      };
    }
  }
  
  return { 
    result: { type: 'None' },
    warning: `${field} could not parse CTCSS/DCS value: ${str}`
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
  
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        onProgress?.(10, 'Parsing Excel file...');
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        
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
        
        // Track which sheets we expect vs found
        const expectedSheets = ['Channels', 'Zones', 'Scan Lists', 'Contacts', 'Digital Emergency', 'Analog Emergency', 'Radio Settings', 'Radio Info'];
        summary.sheets.found = workbook.SheetNames.filter(name => expectedSheets.includes(name));
        summary.sheets.missing = expectedSheets.filter(name => !workbook.SheetNames.includes(name));
        
        // Report missing sheets as warnings
        for (const sheetName of summary.sheets.missing) {
          warnings.push({
            type: 'missing_sheet',
            sheet: sheetName,
            message: `Sheet "${sheetName}" not found in file`,
          });
        }
        
        onProgress?.(20, 'Importing channels...');
        
        // Import Channels with smart matching
        if (workbook.SheetNames.includes('Channels')) {
          const sheet = workbook.Sheets['Channels'];
          const columns = getColumnNames(sheet);
          const rows = XLSX.utils.sheet_to_json(sheet) as any[];
          
          summary.channels.total = rows.length;
          
          for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const rowNum = i + 2; // +2 because Excel is 1-indexed and we skip header
            
            try {
              // Smart column matching
              const channelNumCol = findColumn(columns, ['Channel #', 'Channel Number', 'Channel', '#', 'Number']);
              const nameCol = findColumn(columns, ['Name', 'Channel Name']);
              const rxFreqCol = findColumn(columns, ['RX Freq (MHz)', 'RX Frequency (MHz)', 'RX Freq', 'RX Frequency', 'Receive Frequency']);
              const txFreqCol = findColumn(columns, ['TX Freq (MHz)', 'TX Frequency (MHz)', 'TX Freq', 'TX Frequency', 'Transmit Frequency']);
              const modeCol = findColumn(columns, ['Mode', 'Channel Mode']);
              const rxCtcssCol = findColumn(columns, ['RX CTCSS/DCS', 'RX CTCSS', 'RX DCS', 'Receive CTCSS/DCS']);
              const txCtcssCol = findColumn(columns, ['TX CTCSS/DCS', 'TX CTCSS', 'TX DCS', 'Transmit CTCSS/DCS']);
              
              const channelNum = parseInt(row[channelNumCol || ''] || row['Channel #'] || row['Channel Number'] || '0');
              const channelValidation = validateChannelNumber(channelNum);
              
              if (!channelValidation.valid) {
                if (strictMode) {
                  errors.push({
                    type: 'validation_error',
                    sheet: 'Channels',
                    row: rowNum,
                    field: 'Channel Number',
                    message: channelValidation.warning || 'Invalid channel number',
                  });
                  continue;
                } else {
                  warnings.push({
                    type: 'invalid_value',
                    sheet: 'Channels',
                    row: rowNum,
                    field: 'Channel Number',
                    message: channelValidation.warning || 'Invalid channel number',
                    originalValue: channelNum,
                  });
                }
              }
              
              const rxFreq = parseFloat(row[rxFreqCol || ''] || row['RX Freq (MHz)'] || row['RX Frequency (MHz)'] || '0');
              const txFreq = parseFloat(row[txFreqCol || ''] || row['TX Freq (MHz)'] || row['TX Frequency (MHz)'] || '0');
              
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
              
              const rxCTCSSDCS = parseCTCSSDCS(row[rxCtcssCol || ''] || row['RX CTCSS/DCS'], 'RX');
              const txCTCSSDCS = parseCTCSSDCS(row[txCtcssCol || ''] || row['TX CTCSS/DCS'], 'TX');
              
              if (rxCTCSSDCS.warning) {
                warnings.push({
                  type: 'invalid_value',
                  sheet: 'Channels',
                  row: rowNum,
                  field: 'RX CTCSS/DCS',
                  message: rxCTCSSDCS.warning,
                  originalValue: row[rxCtcssCol || ''] || row['RX CTCSS/DCS'],
                });
              }
              
              if (txCTCSSDCS.warning) {
                warnings.push({
                  type: 'invalid_value',
                  sheet: 'Channels',
                  row: rowNum,
                  field: 'TX CTCSS/DCS',
                  message: txCTCSSDCS.warning,
                  originalValue: row[txCtcssCol || ''] || row['TX CTCSS/DCS'],
                });
              }
              
              // Build channel object with all fields
              const channel: Channel = {
                number: channelNum,
                name: row[nameCol || ''] || row['Name'] || '',
                rxFrequency: rxFreq,
                txFrequency: txFreq,
                mode: row[modeCol || ''] || row['Mode'] || 'Analog',
                bandwidth: row['Bandwidth'] || '12.5kHz',
                rxCtcssDcs: rxCTCSSDCS.result,
                txCtcssDcs: txCTCSSDCS.result,
                power: row['Power'] || 'Low',
                busyLock: row['Busy Lock'] || 'Off',
                scanAdd: row['Scan Add'] === 'Yes' || row['Scan Add'] === true,
                scanListId: parseInt(row['Scan List'] || row['Scan List ID'] || '0') || 0,
                forbidTalkaround: row['Forbid Talkaround'] === 'Yes' || row['Forbid Talkaround'] === true,
                forbidTx: row['Forbid TX'] === 'Yes' || row['Forbid TX'] === true,
                loneWorker: row['Lone Worker'] === 'Yes' || row['Lone Worker'] === true,
                aprsReceive: row['APRS Receive'] === 'Yes' || row['APRS Receive'] === true,
                aprsReportMode: row['APRS Report'] || row['APRS Report Mode'] || 'Off',
                contactId: parseInt(row['Contact ID'] || '0') || 0,
                colorCode: parseInt(row['Color Code'] || '0') || 0,
                squelchLevel: parseInt(row['Squelch'] || row['Squelch Level'] || '0') || 0,
                emergencySystemId: parseInt(row['Emergency ID'] || row['Emergency System ID'] || '0') || 0,
                reverseFreq: parseInt(row['Reverse Freq'] || '0') || 0,
                emergencyIndicator: row['Emergency'] === 'Yes' || row['Emergency'] === true,
                emergencyAck: row['Emergency Ack'] === 'Yes' || row['Emergency Ack'] === true,
                voxFunction: row['VOX'] === 'Yes' || row['VOX'] === true,
                scramble: row['Scramble'] === 'Yes' || row['Scramble'] === true,
                compander: row['Compander'] === 'Yes' || row['Compander'] === true,
                talkback: row['Talkback'] === 'Yes' || row['Talkback'] === true,
                pttIdDisplay: row['PTT ID Display'] === 'Yes' || row['PTT ID Display'] === true,
                pttId: parseInt(row['PTT ID'] || '0') || 0,
                companderDup: row['Compander Dup'] === 'Yes' || row['Compander Dup'] === true,
                voxRelated: row['VOX Related'] === 'Yes' || row['VOX Related'] === true,
                rxSquelchMode: row['RX Squelch Mode'] || 'Carrier/CTC',
                stepFrequency: parseInt(row['Step Frequency'] || '0') || 0,
                signalingType: row['Signaling Type'] || 'None',
                pttIdType: row['PTT ID Type'] || 'Off',
                // Set defaults for unknown fields
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
        
        // Import Zones (simplified for now)
        if (workbook.SheetNames.includes('Zones')) {
          const sheet = workbook.Sheets['Zones'];
          const rows = XLSX.utils.sheet_to_json(sheet) as any[];
          summary.zones.total = rows.length;
          
          for (const row of rows) {
            try {
              const zone: Zone = {
                name: row['Zone Name'] || '',
                channels: (row['Channels'] || '').toString().split(',').map((c: string) => parseInt(c.trim())).filter((n: number) => !isNaN(n)),
              };
              result.zones.push(zone);
              summary.zones.valid++;
            } catch (err) {
              summary.zones.errors++;
            }
          }
        }
        
        // Import Scan Lists (simplified for now)
        if (workbook.SheetNames.includes('Scan Lists')) {
          const sheet = workbook.Sheets['Scan Lists'];
          const rows = XLSX.utils.sheet_to_json(sheet) as any[];
          summary.scanLists.total = rows.length;
          
          for (const row of rows) {
            try {
              const scanList: ScanList = {
                name: row['Scan List Name'] || '',
                ctcScanMode: parseInt(row['CTC Scan Mode'] || '0') || 0,
                settings: [],
                channels: (row['Channels'] || '').toString().split(',').map((c: string) => parseInt(c.trim())).filter((n: number) => !isNaN(n)),
              };
              result.scanLists.push(scanList);
              summary.scanLists.valid++;
            } catch (err) {
              summary.scanLists.errors++;
            }
          }
        }
        
        onProgress?.(80, 'Importing contacts and settings...');
        
        // Import Contacts (simplified for now)
        if (workbook.SheetNames.includes('Contacts')) {
          const sheet = workbook.Sheets['Contacts'];
          const rows = XLSX.utils.sheet_to_json(sheet) as any[];
          summary.contacts.total = rows.length;
          
          for (const row of rows) {
            try {
              const contact: Contact = {
                id: parseInt(row['ID'] || '0') || 0,
                name: row['Name'] || '',
                callSign: row['Call Sign'] || '',
                dmrId: row['DMR ID'] || '',
              };
              result.contacts.push(contact);
              summary.contacts.valid++;
            } catch (err) {
              summary.contacts.errors++;
            }
          }
        }
        
        // TODO: Import other sheets (Digital Emergency, Analog Emergency, Radio Settings, Radio Info)
        // For now, we'll keep the basic structure and add them later
        
        onProgress?.(100, 'Import complete');
        
        // If strict mode and we have errors, reject
        if (strictMode && errors.length > 0) {
          reject(new Error(`Import failed with ${errors.length} error(s). First error: ${errors[0].message}`));
          return;
        }
        
        resolve({
          data: result,
          warnings,
          errors,
          summary,
        });
      } catch (error) {
        reject(new Error(`Failed to import codeplug: ${error instanceof Error ? error.message : 'Unknown error'}`));
      }
    };
    
    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };
    
    reader.readAsArrayBuffer(file);
  });
}

