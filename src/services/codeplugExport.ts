/**
 * Codeplug Export/Import Service
 * Exports and imports full codeplug data to/from XLSX format
 */

import * as XLSX from 'xlsx';
import type { Channel } from '../models/Channel';
import type { Zone } from '../models/Zone';
import type { ScanList } from '../models/ScanList';
import type { Contact } from '../models/Contact';
import type { DigitalEmergency, DigitalEmergencyConfig } from '../models/DigitalEmergency';
import type { AnalogEmergency } from '../models/AnalogEmergency';
import type { RadioSettings } from '../models/RadioSettings';
import type { RadioInfo } from '../protocol/interface';

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
  exportDate: string;
  version: string;
}

const CODEPLUG_VERSION = '1.0.0';

/**
 * Export codeplug data to XLSX file
 */
export function exportCodeplug(data: CodeplugData): void {
  const workbook = XLSX.utils.book_new();

  // Sheet 1: Channels - Enhanced with more fields and better formatting
  if (data.channels.length > 0) {
    const channelRows = data.channels.map(ch => ({
      'Channel #': ch.number,
      'Name': ch.name,
      'RX Freq (MHz)': ch.rxFrequency,
      'TX Freq (MHz)': ch.txFrequency,
      'Mode': ch.mode,
      'Bandwidth': ch.bandwidth,
      'Power': ch.power,
      'RX CTCSS/DCS': ch.rxCtcssDcs.type === 'None' ? 'None' : 
                     ch.rxCtcssDcs.type === 'CTCSS' ? `CTCSS ${ch.rxCtcssDcs.value || 0}` :
                     ch.rxCtcssDcs.type === 'DCS' ? `DCS ${ch.rxCtcssDcs.value || 0}${ch.rxCtcssDcs.polarity === 'P' ? 'P' : 'N'}` : 'None',
      'TX CTCSS/DCS': ch.txCtcssDcs.type === 'None' ? 'None' : 
                     ch.txCtcssDcs.type === 'CTCSS' ? `CTCSS ${ch.txCtcssDcs.value || 0}` :
                     ch.txCtcssDcs.type === 'DCS' ? `DCS ${ch.txCtcssDcs.value || 0}${ch.txCtcssDcs.polarity === 'P' ? 'P' : 'N'}` : 'None',
      'Color Code': ch.colorCode || 0,
      'Contact ID': ch.contactId || 0,
      'Scan Add': ch.scanAdd ? 'Yes' : 'No',
      'Scan List': ch.scanListId,
      'Busy Lock': ch.busyLock,
      'Forbid TX': ch.forbidTx ? 'Yes' : 'No',
      'Forbid Talkaround': ch.forbidTalkaround ? 'Yes' : 'No',
      'Lone Worker': ch.loneWorker ? 'Yes' : 'No',
      'APRS Receive': ch.aprsReceive ? 'Yes' : 'No',
      'APRS Report': ch.aprsReportMode,
      'Squelch': ch.squelchLevel || 0,
      'Emergency ID': ch.emergencySystemId || 0,
      'Emergency': ch.emergencyIndicator ? 'Yes' : 'No',
      'Emergency Ack': ch.emergencyAck ? 'Yes' : 'No',
      'VOX': ch.voxFunction ? 'Yes' : 'No',
      'Scramble': ch.scramble ? 'Yes' : 'No',
      'Compander': ch.compander ? 'Yes' : 'No',
      'Talkback': ch.talkback ? 'Yes' : 'No',
      'PTT ID Display': ch.pttIdDisplay ? 'Yes' : 'No',
      'PTT ID': ch.pttId || 0,
      'PTT ID Type': ch.pttIdType,
      'Reverse Freq': ch.reverseFreq || 0,
      'RX Squelch Mode': ch.rxSquelchMode,
      'Step Frequency': ch.stepFrequency || 0,
      'Signaling Type': ch.signalingType,
      'Compander Dup': ch.companderDup ? 'Yes' : 'No',
      'VOX Related': ch.voxRelated ? 'Yes' : 'No',
    }));
    const channelsSheet = XLSX.utils.json_to_sheet(channelRows);
    
    // Set column widths for better readability
    const channelColWidths = [
      { wch: 10 },  // Channel #
      { wch: 20 },  // Name
      { wch: 12 },  // RX Freq
      { wch: 12 },  // TX Freq
      { wch: 12 },  // Mode
      { wch: 10 },  // Bandwidth
      { wch: 8 },   // Power
      { wch: 15 },  // RX CTCSS/DCS
      { wch: 15 },  // TX CTCSS/DCS
      { wch: 10 },  // Color Code
      { wch: 10 },  // Contact ID
      { wch: 10 },  // Scan Add
      { wch: 10 },  // Scan List
      { wch: 12 },  // Busy Lock
      { wch: 10 },  // Forbid TX
      { wch: 15 },  // Forbid Talkaround
      { wch: 12 },  // Lone Worker
      { wch: 12 },  // APRS Receive
      { wch: 12 },  // APRS Report
      { wch: 10 },  // Squelch
      { wch: 12 },  // Emergency ID
      { wch: 10 },  // Emergency
      { wch: 12 },  // Emergency Ack
      { wch: 8 },   // VOX
      { wch: 10 },  // Scramble
      { wch: 10 },  // Compander
      { wch: 10 },  // Talkback
      { wch: 12 },  // PTT ID Display
      { wch: 8 },   // PTT ID
      { wch: 12 },  // PTT ID Type
      { wch: 12 },  // Reverse Freq
      { wch: 15 },  // RX Squelch Mode
      { wch: 12 },  // Step Frequency
      { wch: 15 },  // Signaling Type
      { wch: 12 },  // Compander Dup
      { wch: 12 },  // VOX Related
    ];
    channelsSheet['!cols'] = channelColWidths;
    
    XLSX.utils.book_append_sheet(workbook, channelsSheet, 'Channels');
  }

  // Sheet 2: Zones
  if (data.zones.length > 0) {
    const zoneRows = data.zones.map(zone => ({
      'Zone Name': zone.name,
      'Channel Count': zone.channels.length,
      'Channels': zone.channels.join(', '),
    }));
    const zonesSheet = XLSX.utils.json_to_sheet(zoneRows);
    zonesSheet['!cols'] = [{ wch: 20 }, { wch: 12 }, { wch: 50 }];
    XLSX.utils.book_append_sheet(workbook, zonesSheet, 'Zones');
  }

  // Sheet 3: Scan Lists
  if (data.scanLists.length > 0) {
    const scanListRows = data.scanLists.map(sl => ({
      'Scan List Name': sl.name,
      'CTC Scan Mode': sl.ctcScanMode,
      'Channel Count': sl.channels.length,
      'Channels': sl.channels.join(', '),
    }));
    const scanListsSheet = XLSX.utils.json_to_sheet(scanListRows);
    scanListsSheet['!cols'] = [{ wch: 20 }, { wch: 12 }, { wch: 12 }, { wch: 50 }];
    XLSX.utils.book_append_sheet(workbook, scanListsSheet, 'Scan Lists');
  }

  // Sheet 4: Contacts
  if (data.contacts.length > 0) {
    const contactRows = data.contacts.map(contact => ({
      'ID': contact.id,
      'Name': contact.name,
      'Call Sign': contact.callSign || '',
      'DMR ID': contact.dmrId || '',
    }));
    const contactsSheet = XLSX.utils.json_to_sheet(contactRows);
    contactsSheet['!cols'] = [{ wch: 8 }, { wch: 25 }, { wch: 15 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(workbook, contactsSheet, 'Contacts');
  }

  // Sheet 5: Digital Emergency Systems
  if (data.digitalEmergencies.length > 0) {
    const digitalEmergencyRows = data.digitalEmergencies.map(de => ({
      'Index': de.index,
      'Name': de.name,
      'Enabled': de.enabled ? 'Yes' : 'No',
      'Value 1': de.value1,
      'Value 2': de.value2,
      'Unknown': de.unknown,
    }));
    const digitalEmergencySheet = XLSX.utils.json_to_sheet(digitalEmergencyRows);
    XLSX.utils.book_append_sheet(workbook, digitalEmergencySheet, 'Digital Emergency');
    
    // Add config as a separate sheet if available
    if (data.digitalEmergencyConfig) {
      const configRows = [{
        'Count/Index': data.digitalEmergencyConfig.countIndex,
        'Unknown': data.digitalEmergencyConfig.unknown,
        'Numeric Field 1': data.digitalEmergencyConfig.numericFields[0],
        'Numeric Field 2': data.digitalEmergencyConfig.numericFields[1],
        'Numeric Field 3': data.digitalEmergencyConfig.numericFields[2],
        'Byte Field 1': data.digitalEmergencyConfig.byteFields[0],
        'Byte Field 2': data.digitalEmergencyConfig.byteFields[1],
        '16-bit Value 1': data.digitalEmergencyConfig.values16bit[0],
        '16-bit Value 2': data.digitalEmergencyConfig.values16bit[1],
        '16-bit Value 3': data.digitalEmergencyConfig.values16bit[2],
        '16-bit Value 4': data.digitalEmergencyConfig.values16bit[3],
        'Bit Flags': data.digitalEmergencyConfig.bitFlags,
        'Index/Count': data.digitalEmergencyConfig.indexCount,
      }];
      const configSheet = XLSX.utils.json_to_sheet(configRows);
      XLSX.utils.book_append_sheet(workbook, configSheet, 'Digital Emergency Config');
    }
  }

  // Sheet 6: Analog Emergency Systems
  if (data.analogEmergencies.length > 0) {
    const analogEmergencyRows = data.analogEmergencies.map(ae => ({
      'Index': ae.index,
      'Name': ae.name,
      'Enabled': ae.enabled ? 'Yes' : 'No',
      'Alarm Type': ae.alarmType,
      'Alarm Mode': ae.alarmMode,
      'Signalling': ae.signalling,
      'Revert Channel': ae.revertChannel,
      'Squelch Mode': ae.squelchMode,
      'ID Type': ae.idType,
      'Flags': ae.flags,
      'Frequency/ID': ae.frequencyId,
    }));
    const analogEmergencySheet = XLSX.utils.json_to_sheet(analogEmergencyRows);
    XLSX.utils.book_append_sheet(workbook, analogEmergencySheet, 'Analog Emergency');
  }

  // Sheet 7: Radio Settings - Row layout (field names in column A, values in column B)
  if (data.radioSettings) {
    const radioSettingsRows = [
      ['Field', 'Value'],
      ['Radio Boot Text Line 1', data.radioSettings.radioNameA],
      ['Radio Boot Text Line 2', data.radioSettings.radioNameB],
      ['Unknown Flag (0x00)', data.radioSettings.unknownFlag],
      ['Bit Flags 1 (0x1D)', data.radioSettings.bitFlags1],
      ['Value (0x1E)', data.radioSettings.value],
      ['Bit Flags 2 (0x20)', data.radioSettings.bitFlags2],
      ['Unknown Radio Setting (0x301)', data.radioSettings.unknownRadioSetting],
      ['Radio Enabled (0x302)', data.radioSettings.radioEnabled ? 'Yes' : 'No'],
      ['Latitude', data.radioSettings.latitude],
      ['Latitude Direction', data.radioSettings.latitudeDirection],
      ['Longitude', data.radioSettings.longitude],
      ['Longitude Direction', data.radioSettings.longitudeDirection],
      ['Current Channel A', data.radioSettings.currentChannelA > 0 ? data.radioSettings.currentChannelA : 'None'],
      ['Current Channel B', data.radioSettings.currentChannelB > 0 ? data.radioSettings.currentChannelB : 'None'],
      ['Channel Setting 3', data.radioSettings.channelSetting3],
      ['Channel Setting 4', data.radioSettings.channelSetting4],
      ['Channel Setting 5', data.radioSettings.channelSetting5],
      ['Channel Setting 6', data.radioSettings.channelSetting6],
      ['Channel Setting 7', data.radioSettings.channelSetting7],
      ['Channel Setting 8', data.radioSettings.channelSetting8],
      ['Current Zone', data.radioSettings.currentZone > 0 ? data.radioSettings.currentZone : 'None'],
      ['Zone Enabled', data.radioSettings.zoneEnabled ? 'Yes' : 'No'],
      ['Unknown Value (0x332)', data.radioSettings.unknownValue],
    ];
    const radioSettingsSheet = XLSX.utils.aoa_to_sheet(radioSettingsRows);
    
    // Set column widths
    radioSettingsSheet['!cols'] = [
      { wch: 30 },  // Field names
      { wch: 25 },  // Values
    ];
    
    XLSX.utils.book_append_sheet(workbook, radioSettingsSheet, 'Radio Settings');
  }

  // Sheet 8: Radio Info (Metadata)
  if (data.radioInfo) {
    const radioInfoRows = [{
      'Model': data.radioInfo.model || '',
      'Firmware': data.radioInfo.firmware || '',
      'Build Date': data.radioInfo.buildDate || '',
      'DSP Version': data.radioInfo.dspVersion || '',
      'Radio Version': data.radioInfo.radioVersion || '',
      'Codeplug Version': data.radioInfo.codeplugVersion || '',
      'Config Start': data.radioInfo.memoryLayout?.configStart ? `0x${data.radioInfo.memoryLayout.configStart.toString(16)}` : '',
      'Config End': data.radioInfo.memoryLayout?.configEnd ? `0x${data.radioInfo.memoryLayout.configEnd.toString(16)}` : '',
    }];
    const radioInfoSheet = XLSX.utils.json_to_sheet(radioInfoRows);
    XLSX.utils.book_append_sheet(workbook, radioInfoSheet, 'Radio Info');
  }

  // Sheet 9: Export Metadata
  const metadataRows = [{
    'Export Date': data.exportDate,
    'Codeplug Version': data.version,
    'Channel Count': data.channels.length,
    'Zone Count': data.zones.length,
    'Scan List Count': data.scanLists.length,
    'Contact Count': data.contacts.length,
    'Digital Emergency Count': data.digitalEmergencies.length,
    'Analog Emergency Count': data.analogEmergencies.length,
  }];
  const metadataSheet = XLSX.utils.json_to_sheet(metadataRows);
  XLSX.utils.book_append_sheet(workbook, metadataSheet, 'Export Info');

  // Generate filename with timestamp
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const filename = `codeplug-export-${timestamp}.xlsx`;

  // Write file
  XLSX.writeFile(workbook, filename);
}

/**
 * Import codeplug data from XLSX file
 */
export async function importCodeplug(file: File): Promise<CodeplugData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
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

        // Import Channels
        if (workbook.SheetNames.includes('Channels')) {
          const sheet = workbook.Sheets['Channels'];
          const rows = XLSX.utils.sheet_to_json(sheet) as any[];
          result.channels = rows.map(row => {
            // Parse CTCSS/DCS
            const parseCTCSSDCS = (str: string) => {
              if (!str || str === 'None') return { type: 'None' as const };
              const ctcssMatch = str.match(/CTCSS\s+(\d+\.?\d*)/);
              if (ctcssMatch) {
                return { type: 'CTCSS' as const, value: parseFloat(ctcssMatch[1]) };
              }
              const dcsMatch = str.match(/DCS\s+(\d+)([NP])?/);
              if (dcsMatch) {
                return { type: 'DCS' as const, value: parseInt(dcsMatch[1]), polarity: (dcsMatch[2] === 'P' ? 'P' : 'N') as 'N' | 'P' };
              }
              return { type: 'None' as const };
            };

            const rxCTCSSDCS = parseCTCSSDCS(row['RX CTCSS/DCS']);
            const txCTCSSDCS = parseCTCSSDCS(row['TX CTCSS/DCS']);
            
            return {
              number: row['Channel #'] || row['Channel Number'] || 0,
              name: row['Name'] || '',
              rxFrequency: parseFloat(row['RX Freq (MHz)'] || row['RX Frequency (MHz)']) || 0,
              txFrequency: parseFloat(row['TX Freq (MHz)'] || row['TX Frequency (MHz)']) || 0,
              mode: row['Mode'] || 'Analog',
              bandwidth: row['Bandwidth'] || '12.5kHz',
              rxCtcssDcs: rxCTCSSDCS,
              txCtcssDcs: txCTCSSDCS,
              power: row['Power'] || 'Low',
              busyLock: row['Busy Lock'] || 'Off',
              scanAdd: row['Scan Add'] === 'Yes',
              scanListId: parseInt(row['Scan List'] || row['Scan List ID']) || 0,
              forbidTalkaround: row['Forbid Talkaround'] === 'Yes',
              forbidTx: row['Forbid TX'] === 'Yes',
              loneWorker: row['Lone Worker'] === 'Yes',
              aprsReceive: row['APRS Receive'] === 'Yes',
              aprsReportMode: row['APRS Report'] || row['APRS Report Mode'] || 'Off',
              contactId: parseInt(row['Contact ID']) || 0,
              colorCode: parseInt(row['Color Code']) || 0,
              squelchLevel: parseInt(row['Squelch'] || row['Squelch Level']) || 0,
              emergencySystemId: parseInt(row['Emergency ID'] || row['Emergency System ID']) || 0,
              // Import additional fields if present
              reverseFreq: parseInt(row['Reverse Freq']) || 0,
              emergencyIndicator: row['Emergency'] === 'Yes',
              emergencyAck: row['Emergency Ack'] === 'Yes',
              voxFunction: row['VOX'] === 'Yes',
              scramble: row['Scramble'] === 'Yes',
              compander: row['Compander'] === 'Yes',
              talkback: row['Talkback'] === 'Yes',
              pttIdDisplay: row['PTT ID Display'] === 'Yes',
              pttId: parseInt(row['PTT ID']) || 0,
              companderDup: row['Compander Dup'] === 'Yes',
              voxRelated: row['VOX Related'] === 'Yes',
              rxSquelchMode: row['RX Squelch Mode'] || 'Carrier/CTC',
              stepFrequency: parseInt(row['Step Frequency']) || 0,
              signalingType: row['Signaling Type'] || 'None',
              pttIdType: row['PTT ID Type'] || 'Off',
            } as Channel;
          });
        }

        // Import Zones
        if (workbook.SheetNames.includes('Zones')) {
          const sheet = workbook.Sheets['Zones'];
          const rows = XLSX.utils.sheet_to_json(sheet) as any[];
          result.zones = rows.map(row => ({
            name: row['Zone Name'] || '',
            channels: (row['Channels'] || '').toString().split(',').map((c: string) => parseInt(c.trim())).filter((n: number) => !isNaN(n)),
          } as Zone));
        }

        // Import Scan Lists
        if (workbook.SheetNames.includes('Scan Lists')) {
          const sheet = workbook.Sheets['Scan Lists'];
          const rows = XLSX.utils.sheet_to_json(sheet) as any[];
          result.scanLists = rows.map(row => ({
            name: row['Scan List Name'] || '',
            ctcScanMode: parseInt(row['CTC Scan Mode']) || 0,
            settings: [],
            channels: (row['Channels'] || '').toString().split(',').map((c: string) => parseInt(c.trim())).filter((n: number) => !isNaN(n)),
          } as ScanList));
        }

        // Import Contacts
        if (workbook.SheetNames.includes('Contacts')) {
          const sheet = workbook.Sheets['Contacts'];
          const rows = XLSX.utils.sheet_to_json(sheet) as any[];
          result.contacts = rows.map(row => ({
            id: parseInt(row['ID']) || 0,
            name: row['Name'] || '',
            callSign: row['Call Sign'] || '',
            dmrId: row['DMR ID'] || '',
          } as Contact));
        }

        // Import Digital Emergency Systems
        if (workbook.SheetNames.includes('Digital Emergency')) {
          const sheet = workbook.Sheets['Digital Emergency'];
          const rows = XLSX.utils.sheet_to_json(sheet) as any[];
          result.digitalEmergencies = rows.map(row => ({
            index: parseInt(row['Index']) || 0,
            name: row['Name'] || '',
            enabled: row['Enabled'] === 'Yes',
            value1: parseInt(row['Value 1']) || 0,
            value2: parseInt(row['Value 2']) || 0,
            unknown: parseInt(row['Unknown']) || 0,
          } as DigitalEmergency));
        }

        // Import Digital Emergency Config
        if (workbook.SheetNames.includes('Digital Emergency Config')) {
          const sheet = workbook.Sheets['Digital Emergency Config'];
          const rows = XLSX.utils.sheet_to_json(sheet) as any[];
          if (rows.length > 0) {
            const row = rows[0];
            result.digitalEmergencyConfig = {
              countIndex: parseInt(row['Count/Index']) || 0,
              unknown: parseInt(row['Unknown']) || 0,
              numericFields: [
                parseInt(row['Numeric Field 1']) || 0,
                parseInt(row['Numeric Field 2']) || 0,
                parseInt(row['Numeric Field 3']) || 0,
              ] as [number, number, number],
              byteFields: [
                parseInt(row['Byte Field 1']) || 0,
                parseInt(row['Byte Field 2']) || 0,
              ] as [number, number],
              values16bit: [
                parseInt(row['16-bit Value 1']) || 0,
                parseInt(row['16-bit Value 2']) || 0,
                parseInt(row['16-bit Value 3']) || 0,
                parseInt(row['16-bit Value 4']) || 0,
              ] as [number, number, number, number],
              bitFlags: parseInt(row['Bit Flags']) || 0,
              indexCount: parseInt(row['Index/Count']) || 0,
              entryArray: [],
              additionalConfig: new Uint8Array(192),
            };
          }
        }

        // Import Analog Emergency Systems
        if (workbook.SheetNames.includes('Analog Emergency')) {
          const sheet = workbook.Sheets['Analog Emergency'];
          const rows = XLSX.utils.sheet_to_json(sheet) as any[];
          result.analogEmergencies = rows.map(row => ({
            index: parseInt(row['Index']) || 0,
            name: row['Name'] || '',
            enabled: row['Enabled'] === 'Yes',
            alarmType: parseInt(row['Alarm Type']) || 0,
            alarmMode: parseInt(row['Alarm Mode']) || 0,
            signalling: parseInt(row['Signalling']) || 0,
            revertChannel: parseInt(row['Revert Channel']) || 0,
            squelchMode: parseInt(row['Squelch Mode']) || 0,
            idType: parseInt(row['ID Type']) || 0,
            flags: parseInt(row['Flags']) || 0,
            frequencyId: parseInt(row['Frequency/ID']) || 0,
          } as AnalogEmergency));
        }

        // Import Radio Settings (row-based layout: Field in column A, Value in column B)
        if (workbook.SheetNames.includes('Radio Settings') || workbook.SheetNames.includes('VFO Settings')) {
          const sheet = workbook.Sheets[workbook.SheetNames.includes('Radio Settings') ? 'Radio Settings' : 'VFO Settings'];
          
          // Try to detect layout: if first cell is "Field", it's row layout
          const firstCell = sheet['A1']?.v;
          const settingsData: any = {};
          
          if (firstCell === 'Field') {
            // Row layout: Field names in column A, values in column B
            const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as any[][];
            for (let i = 1; i < rows.length; i++) {
              const [field, value] = rows[i];
              if (field && value !== undefined && value !== '') {
                // Map field names to settings properties
                if (field.includes('Radio Boot Text Line 1')) settingsData.radioNameA = String(value);
                else if (field.includes('Radio Boot Text Line 2')) settingsData.radioNameB = String(value);
                else if (field.includes('Unknown Flag')) settingsData.unknownFlag = parseInt(String(value)) || 0;
                else if (field.includes('Bit Flags 1')) settingsData.bitFlags1 = parseInt(String(value)) || 0;
                else if (field.includes('Value (0x1E)') || field === 'Value') settingsData.value = parseInt(String(value)) || 0;
                else if (field.includes('Bit Flags 2')) settingsData.bitFlags2 = parseInt(String(value)) || 0;
                else if (field.includes('Unknown Radio Setting')) settingsData.unknownRadioSetting = parseInt(String(value)) || 0;
                else if (field.includes('Radio Enabled')) settingsData.radioEnabled = String(value).toLowerCase() === 'yes';
                else if (field === 'Latitude') settingsData.latitude = String(value);
                else if (field === 'Latitude Direction') settingsData.latitudeDirection = String(value) === 'S' ? 'S' : 'N';
                else if (field === 'Longitude') settingsData.longitude = String(value);
                else if (field === 'Longitude Direction') settingsData.longitudeDirection = String(value) === 'W' ? 'W' : 'E';
                else if (field === 'Current Channel A') settingsData.currentChannelA = String(value) === 'None' ? 0 : parseInt(String(value)) || 0;
                else if (field === 'Current Channel B') settingsData.currentChannelB = String(value) === 'None' ? 0 : parseInt(String(value)) || 0;
                else if (field === 'Channel Setting 3') settingsData.channelSetting3 = parseInt(String(value)) || 0;
                else if (field === 'Channel Setting 4') settingsData.channelSetting4 = parseInt(String(value)) || 0;
                else if (field === 'Channel Setting 5') settingsData.channelSetting5 = parseInt(String(value)) || 0;
                else if (field === 'Channel Setting 6') settingsData.channelSetting6 = parseInt(String(value)) || 0;
                else if (field === 'Channel Setting 7') settingsData.channelSetting7 = parseInt(String(value)) || 0;
                else if (field === 'Channel Setting 8') settingsData.channelSetting8 = parseInt(String(value)) || 0;
                else if (field === 'Current Zone') settingsData.currentZone = String(value) === 'None' ? 0 : parseInt(String(value)) || 0;
                else if (field === 'Zone Enabled') settingsData.zoneEnabled = String(value).toLowerCase() === 'yes';
                else if (field.includes('Unknown Value')) settingsData.unknownValue = String(value);
              }
            }
          } else {
            // Old column layout: try to parse as JSON object (backward compatibility)
            const rows = XLSX.utils.sheet_to_json(sheet) as any[];
            if (rows.length > 0) {
              const row = rows[0];
              settingsData.unknownFlag = parseInt(row['Unknown Flag']) || 0;
              settingsData.radioNameA = row['Radio Boot Text Line 1'] || '';
              settingsData.radioNameB = row['Radio Boot Text Line 2'] || '';
              settingsData.bitFlags1 = parseInt(row['Bit Flags 1']) || 0;
              settingsData.value = parseInt(row['Value']) || 0;
              settingsData.bitFlags2 = parseInt(row['Bit Flags 2']) || 0;
            }
          }
          
          // Merge with defaults
          result.radioSettings = {
            unknownFlag: settingsData.unknownFlag ?? 0,
            radioNameA: settingsData.radioNameA ?? '',
            radioNameB: settingsData.radioNameB ?? '',
            bitFlags1: settingsData.bitFlags1 ?? 0,
            value: settingsData.value ?? 0,
            bitFlags2: settingsData.bitFlags2 ?? 0,
            unknownRadioSetting: settingsData.unknownRadioSetting ?? 0,
            radioEnabled: settingsData.radioEnabled ?? false,
            latitude: settingsData.latitude ?? '',
            latitudeDirection: settingsData.latitudeDirection ?? 'N',
            longitude: settingsData.longitude ?? '',
            longitudeDirection: settingsData.longitudeDirection ?? 'E',
            currentChannelA: settingsData.currentChannelA ?? 0,
            currentChannelB: settingsData.currentChannelB ?? 0,
            channelSetting3: settingsData.channelSetting3 ?? 0,
            channelSetting4: settingsData.channelSetting4 ?? 0,
            channelSetting5: settingsData.channelSetting5 ?? 0,
            channelSetting6: settingsData.channelSetting6 ?? 0,
            channelSetting7: settingsData.channelSetting7 ?? 0,
            channelSetting8: settingsData.channelSetting8 ?? 0,
            currentZone: settingsData.currentZone ?? 0,
            zoneEnabled: settingsData.zoneEnabled ?? false,
            unknownValue: settingsData.unknownValue ?? '000000',
          } as RadioSettings;
        }

        // Import Radio Info
        if (workbook.SheetNames.includes('Radio Info')) {
          const sheet = workbook.Sheets['Radio Info'];
          const rows = XLSX.utils.sheet_to_json(sheet) as any[];
          if (rows.length > 0) {
            const row = rows[0];
            const parseHex = (str: string) => {
              if (!str) return undefined;
              const match = str.match(/0x([0-9a-fA-F]+)/);
              return match ? parseInt(match[1], 16) : undefined;
            };
            result.radioInfo = {
              model: row['Model'] || '',
              firmware: row['Firmware'] || '',
              buildDate: row['Build Date'] || '',
              dspVersion: row['DSP Version'] || undefined,
              radioVersion: row['Radio Version'] || undefined,
              codeplugVersion: row['Codeplug Version'] || undefined,
              memoryLayout: {
                configStart: parseHex(row['Config Start']) || 0,
                configEnd: parseHex(row['Config End']) || 0,
              },
              vframes: new Map(),
            } as RadioInfo;
          }
        }

        resolve(result);
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

/**
 * Get codeplug data from all stores
 */
export function getCodeplugDataFromStores(): CodeplugData {
  // This will be called from a component that has access to all stores
  // For now, return a structure that components can populate
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
    exportDate: new Date().toISOString(),
    version: CODEPLUG_VERSION,
  };
}

