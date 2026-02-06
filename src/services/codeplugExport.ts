/**
 * Codeplug Export/Import Service
 * Exports and imports full codeplug data to/from XLSX format (ExcelJS)
 */

import ExcelJS from 'exceljs';
import type { Channel } from '../models/Channel';
import type { Zone } from '../models/Zone';
import type { ScanList } from '../models/ScanList';
import type { Contact } from '../models/Contact';
import type { DigitalEmergency, DigitalEmergencyConfig } from '../models/DigitalEmergency';
import type { AnalogEmergency } from '../models/AnalogEmergency';
import type { RadioSettings } from '../models/RadioSettings';
import type { RadioInfo } from '../types/radio';

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

/** Convert ExcelJS worksheet to array of row objects (first row = headers). Exported for use by smartImporter. */
export function sheetToJson(worksheet: ExcelJS.Worksheet): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];
  const rowCount = worksheet.rowCount ?? 0;
  if (rowCount < 2) return rows;

  const headerRow = worksheet.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    const v = cell.value;
    headers[colNumber - 1] = v != null ? String(v) : '';
  });

  for (let r = 2; r <= rowCount; r++) {
    const row = worksheet.getRow(r);
    const obj: Record<string, unknown> = {};
    headers.forEach((h, i) => {
      const cell = row.getCell(i + 1);
      const val = cell.value;
      if (val != null && typeof val === 'object' && 'result' in val) {
        obj[h] = (val as { result: unknown }).result;
      } else {
        obj[h] = val;
      }
    });
    rows.push(obj);
  }
  return rows;
}

/** Get worksheet as array of arrays (row-major), for Radio Settings style sheets */
function sheetToArrays(worksheet: ExcelJS.Worksheet): unknown[][] {
  const out: unknown[][] = [];
  const rowCount = worksheet.rowCount ?? 0;
  for (let r = 1; r <= rowCount; r++) {
    const row = worksheet.getRow(r);
    const arr: unknown[] = [];
    row.eachCell({ includeEmpty: true }, (cell) => {
      const v = cell.value;
      if (v != null && typeof v === 'object' && 'result' in v) {
        arr.push((v as { result: unknown }).result);
      } else {
        arr.push(v);
      }
    });
    out.push(arr);
  }
  return out;
}

/**
 * Export codeplug data to XLSX file
 * @param data Codeplug data to export
 * @param returnBlob If true, returns a Blob instead of downloading. For use in zip archives.
 */
export async function exportCodeplug(data: CodeplugData, returnBlob?: boolean): Promise<Blob | void> {
  const workbook = new ExcelJS.Workbook();

  // Sheet 1: Channels
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
                     ch.rxCtcssDcs.type === 'CTCSS' ? `CTCSS ${ch.rxCtcssDcs.value ?? 0}` :
                     ch.rxCtcssDcs.type === 'DCS' ? `DCS ${ch.rxCtcssDcs.value ?? 0}${ch.rxCtcssDcs.polarity === 'P' ? 'P' : 'N'}` : 'None',
      'TX CTCSS/DCS': ch.txCtcssDcs.type === 'None' ? 'None' :
                     ch.txCtcssDcs.type === 'CTCSS' ? `CTCSS ${ch.txCtcssDcs.value ?? 0}` :
                     ch.txCtcssDcs.type === 'DCS' ? `DCS ${ch.txCtcssDcs.value ?? 0}${ch.txCtcssDcs.polarity === 'P' ? 'P' : 'N'}` : 'None',
      'Color Code': ch.colorCode ?? 0,
      'Contact ID': ch.contactId ?? 0,
      'Scan List': ch.scanListId,
      'Forbid TX': ch.forbidTx ? 'Yes' : 'No',
      'Forbid Talkaround': ch.forbidTalkaround ? 'Yes' : 'No',
      'Lone Worker': ch.loneWorker ? 'Yes' : 'No',
      'APRS Receive': ch.aprsReceive ? 'Yes' : 'No',
      'APRS Report': ch.aprsReportMode,
      'Squelch': ch.squelchLevel ?? 0,
      'Emergency ID': ch.emergencySystemId ?? 0,
      'Emergency': ch.emergencyIndicator ? 'Yes' : 'No',
      'Emergency Ack': ch.emergencyAck ? 'Yes' : 'No',
      'VOX': ch.voxFunction ? 'Yes' : 'No',
      'Scramble': ch.scramble ? 'Yes' : 'No',
      'Compander': ch.compander ? 'Yes' : 'No',
      'Talkback': ch.talkback ? 'Yes' : 'No',
      'PTT ID Display': ch.pttIdDisplay ? 'Yes' : 'No',
      'PTT ID': ch.pttId ?? 0,
      'PTT ID Type': ch.pttIdType,
      'RX Squelch Mode': ch.rxSquelchMode,
      'Step Frequency': ch.stepFrequency ?? 0,
      'Signaling Type': ch.signalingType,
      'Compander Dup': ch.companderDup ? 'Yes' : 'No',
      'VOX Related': ch.voxRelated ? 'Yes' : 'No',
    }));
    const headers = Object.keys(channelRows[0]!);
    const ws = workbook.addWorksheet('Channels');
    const channelColWidths = [10, 20, 12, 12, 12, 10, 8, 15, 15, 10, 10, 10, 10, 15, 12, 12, 12, 10, 12, 10, 12, 8, 10, 10, 10, 12, 8, 12, 15, 12, 15, 12, 12];
    channelColWidths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
    ws.addRow(headers);
    channelRows.forEach(row => ws.addRow(headers.map(h => (row as Record<string, unknown>)[h])));
  }

  // Sheet 2: Zones
  if (data.zones.length > 0) {
    const zoneRows = data.zones.map(zone => ({
      'Zone Name': zone.name,
      'Channel Count': zone.channels.length,
      'Channels': zone.channels.join(', '),
    }));
    const headers = Object.keys(zoneRows[0]!);
    const ws = workbook.addWorksheet('Zones');
    ws.getColumn(1).width = 20;
    ws.getColumn(2).width = 12;
    ws.getColumn(3).width = 50;
    ws.addRow(headers);
    zoneRows.forEach(row => ws.addRow(headers.map(h => (row as Record<string, unknown>)[h])));
  }

  // Sheet 3: Scan Lists
  if (data.scanLists.length > 0) {
    const scanListRows = data.scanLists.map(sl => ({
      'Scan List Name': sl.name,
      'CTC Scan Mode': sl.ctcScanMode,
      'Scan TX Mode': sl.scanTxMode,
      'Hang Time (tenths)': sl.hangTime ?? '',
      'Priority 1 Type': sl.priority1Type ?? 0,
      'Priority 2 Type': sl.priority2Type ?? 0,
      'Priority Channel 1': sl.priorityChannel1 ?? '',
      'Priority Channel 2': sl.priorityChannel2 ?? '',
      'Designated TX Channel': sl.designatedTxChannel ?? '',
      'Channel Count': sl.channels.length,
      'Channels': sl.channels.join(', '),
    }));
    const headers = Object.keys(scanListRows[0]!);
    const ws = workbook.addWorksheet('Scan Lists');
    [20, 12, 12, 12, 12, 18, 18, 20, 12, 50].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
    ws.addRow(headers);
    scanListRows.forEach(row => ws.addRow(headers.map(h => (row as Record<string, unknown>)[h])));
  }

  // Sheet 4: Contacts
  if (data.contacts.length > 0) {
    const contactRows = data.contacts.map(contact => ({
      'ID': contact.id,
      'Name': contact.name,
      'Call Sign': contact.callSign ?? '',
      'DMR ID': contact.dmrId ?? '',
    }));
    const headers = Object.keys(contactRows[0]!);
    const ws = workbook.addWorksheet('Contacts');
    ws.getColumn(1).width = 8;
    ws.getColumn(2).width = 25;
    ws.getColumn(3).width = 15;
    ws.getColumn(4).width = 12;
    ws.addRow(headers);
    contactRows.forEach(row => ws.addRow(headers.map(h => (row as Record<string, unknown>)[h])));
  }

  // Sheet 5: Digital Emergency
  if (data.digitalEmergencies.length > 0) {
    const digitalEmergencyRows = data.digitalEmergencies.map(de => ({
      'Index': de.index,
      'Name': de.name,
      'Fields (Hex)': Array.from(de.fields).map(b => b.toString(16).padStart(2, '0')).join(' ').toUpperCase(),
    }));
    const headers = Object.keys(digitalEmergencyRows[0]!);
    const ws = workbook.addWorksheet('Digital Emergency');
    ws.addRow(headers);
    digitalEmergencyRows.forEach(row => ws.addRow(headers.map(h => (row as Record<string, unknown>)[h])));
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
      const configHeaders = Object.keys(configRows[0]!);
      const wsConfig = workbook.addWorksheet('Digital Emergency Config');
      wsConfig.addRow(configHeaders);
      wsConfig.addRow(configHeaders.map(h => (configRows[0] as Record<string, unknown>)[h]));
    }
  }

  // Sheet 6: Analog Emergency
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
    const headers = Object.keys(analogEmergencyRows[0]!);
    const ws = workbook.addWorksheet('Analog Emergency');
    ws.addRow(headers);
    analogEmergencyRows.forEach(row => ws.addRow(headers.map(h => (row as Record<string, unknown>)[h])));
  }

  // Sheet 7: Radio Settings (array of arrays)
  if (data.radioSettings) {
    const radioSettingsRows = [
      ['Field', 'Value'],
      ['Power On Display Line 1', data.radioSettings.powerOnDisplayLine1],
      ['Power On Display Line 2', data.radioSettings.powerOnDisplayLine2],
      ['Unknown Flag (0x00)', data.radioSettings.unknownFlag],
      ['Allow Reset (0x1D)', data.radioSettings.allowReset ? 'Yes' : 'No'],
      ['Power On Interface (0x1E)', data.radioSettings.powerOnInterface],
      ['Alert Tone Flags (0x20)', data.radioSettings.alertToneFlags],
      ['Alert Tone Flags Cont (0x21)', data.radioSettings.alertToneFlagsCont],
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
    const ws = workbook.addWorksheet('Radio Settings');
    ws.getColumn(1).width = 30;
    ws.getColumn(2).width = 25;
    ws.addRows(radioSettingsRows);
  }

  // Sheet 8: Radio Info
  if (data.radioInfo) {
    const radioInfoRows = [{
      'Model': data.radioInfo.model ?? '',
      'Firmware': data.radioInfo.firmware ?? '',
      'Build Date': data.radioInfo.buildDate ?? '',
      'DSP Version': data.radioInfo.dspVersion ?? '',
      'Radio Version': data.radioInfo.radioVersion ?? '',
      'Codeplug Version': data.radioInfo.codeplugVersion ?? '',
      'Config Start': data.radioInfo.memoryLayout?.configStart != null ? `0x${data.radioInfo.memoryLayout.configStart.toString(16)}` : '',
      'Config End': data.radioInfo.memoryLayout?.configEnd != null ? `0x${data.radioInfo.memoryLayout.configEnd.toString(16)}` : '',
    }];
    const headers = Object.keys(radioInfoRows[0]!);
    const ws = workbook.addWorksheet('Radio Info');
    ws.addRow(headers);
    ws.addRow(headers.map(h => (radioInfoRows[0] as Record<string, unknown>)[h]));
  }

  // Sheet 9: Export Info
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
  const metaHeaders = Object.keys(metadataRows[0]!);
  const wsMeta = workbook.addWorksheet('Export Info');
  wsMeta.addRow(metaHeaders);
  wsMeta.addRow(metaHeaders.map(h => (metadataRows[0] as Record<string, unknown>)[h]));

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const filename = `codeplug-export-${timestamp}.xlsx`;

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

  if (returnBlob) {
    return blob;
  }
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
 * Import codeplug data from XLSX file
 */
export async function importCodeplug(file: File): Promise<CodeplugData> {
  const buffer = await file.arrayBuffer();
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

  const getSheet = (name: string) => workbook.getWorksheet(name);

  // Import Channels
  const channelsSheet = getSheet('Channels');
  if (channelsSheet) {
    const rows = sheetToJson(channelsSheet) as Record<string, unknown>[];
    const parseCTCSSDCS = (str: string) => {
      if (!str || str === 'None') return { type: 'None' as const };
      const ctcssMatch = String(str).match(/CTCSS\s+(\d+\.?\d*)/);
      if (ctcssMatch) {
        return { type: 'CTCSS' as const, value: parseFloat(ctcssMatch[1]) };
      }
      const dcsMatch = String(str).match(/DCS\s+(\d+)([NP])?/);
      if (dcsMatch) {
        return { type: 'DCS' as const, value: parseInt(dcsMatch[1], 10), polarity: (dcsMatch[2] === 'P' ? 'P' : 'N') as 'N' | 'P' };
      }
      return { type: 'None' as const };
    };
    result.channels = rows.map(row => {
      const rxCTCSSDCS = parseCTCSSDCS(String(row['RX CTCSS/DCS'] ?? ''));
      const txCTCSSDCS = parseCTCSSDCS(String(row['TX CTCSS/DCS'] ?? ''));
      return {
        number: Number(row['Channel #'] ?? row['Channel Number'] ?? 0),
        name: String(row['Name'] ?? ''),
        rxFrequency: parseFloat(String(row['RX Freq (MHz)'] ?? row['RX Frequency (MHz)'] ?? '0')) || 0,
        txFrequency: parseFloat(String(row['TX Freq (MHz)'] ?? row['TX Frequency (MHz)'] ?? '0')) || 0,
        mode: String(row['Mode'] ?? 'Analog'),
        bandwidth: String(row['Bandwidth'] ?? '12.5kHz'),
        rxCtcssDcs: rxCTCSSDCS,
        txCtcssDcs: txCTCSSDCS,
        power: String(row['Power'] ?? 'High'),
        scanListId: parseInt(String(row['Scan List'] ?? row['Scan List ID'] ?? '0'), 10) || 0,
        forbidTalkaround: row['Forbid Talkaround'] === 'Yes',
        forbidTx: row['Forbid TX'] === 'Yes',
        loneWorker: row['Lone Worker'] === 'Yes',
        aprsReceive: row['APRS Receive'] === 'Yes',
        aprsReportMode: String(row['APRS Report'] ?? row['APRS Report Mode'] ?? 'Off'),
        contactId: parseInt(String(row['Contact ID'] ?? '0'), 10) || 0,
        colorCode: parseInt(String(row['Color Code'] ?? '0'), 10) || 0,
        squelchLevel: parseInt(String(row['Squelch'] ?? row['Squelch Level'] ?? '3'), 10) || 3,
        emergencySystemId: parseInt(String(row['Emergency ID'] ?? row['Emergency System ID'] ?? '0'), 10) || 0,
        emergencyIndicator: row['Emergency'] === 'Yes',
        emergencyAck: row['Emergency Ack'] === 'Yes',
        voxFunction: row['VOX'] === 'Yes',
        scramble: row['Scramble'] === 'Yes',
        compander: row['Compander'] === 'Yes',
        talkback: row['Talkback'] === 'Yes',
        pttIdDisplay: row['PTT ID Display'] === 'Yes',
        pttId: parseInt(String(row['PTT ID'] ?? '0'), 10) || 0,
        companderDup: row['Compander Dup'] === 'Yes',
        voxRelated: row['VOX Related'] === 'Yes',
        rxSquelchMode: String(row['RX Squelch Mode'] ?? 'Carrier/CTC'),
        stepFrequency: parseInt(String(row['Step Frequency'] ?? '0'), 10) || 0,
        signalingType: String(row['Signaling Type'] ?? 'None'),
        pttIdType: String(row['PTT ID Type'] ?? 'Off'),
        scanAdd: false,
      } as Channel;
    });
  }

  // Import Zones
  const zonesSheet = getSheet('Zones');
  if (zonesSheet) {
    const rows = sheetToJson(zonesSheet) as Record<string, unknown>[];
    result.zones = rows.map(row => ({
      name: String(row['Zone Name'] ?? ''),
      channels: String(row['Channels'] ?? '').split(',').map((c: string) => parseInt(c.trim(), 10)).filter((n: number) => !isNaN(n)),
    } as Zone));
  }

  // Import Scan Lists
  const scanListsSheet = getSheet('Scan Lists');
  if (scanListsSheet) {
    const rows = sheetToJson(scanListsSheet) as Record<string, unknown>[];
    result.scanLists = rows.map(row => {
      const priorityCh1 = row['Priority Channel 1'];
      const priorityCh2 = row['Priority Channel 2'];
      const designatedTx = row['Designated TX Channel'];
      return {
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
      } as ScanList;
    });
  }

  // Import Contacts
  const contactsSheet = getSheet('Contacts');
  if (contactsSheet) {
    const rows = sheetToJson(contactsSheet) as Record<string, unknown>[];
    result.contacts = rows.map(row => ({
      id: parseInt(String(row['ID'] ?? '0'), 10) || 0,
      name: String(row['Name'] ?? ''),
      callSign: String(row['Call Sign'] ?? ''),
      dmrId: parseInt(String(row['DMR ID'] ?? '0'), 10) || 0,
    } as Contact));
  }

  // Import Digital Emergency
  const digitalEmergencySheet = getSheet('Digital Emergency');
  if (digitalEmergencySheet) {
    const rows = sheetToJson(digitalEmergencySheet) as Record<string, unknown>[];
    result.digitalEmergencies = rows.map(row => {
      const fieldsHex = String(row['Fields (Hex)'] ?? '').replace(/[^0-9A-Fa-f]/g, '').slice(0, 20);
      const fields = new Uint8Array(10);
      for (let i = 0; i < fieldsHex.length && i < 20; i += 2) {
        const hexByte = fieldsHex.slice(i, i + 2);
        if (hexByte.length === 2) fields[i / 2] = parseInt(hexByte, 16);
      }
      return {
        index: parseInt(String(row['Index'] ?? '0'), 10) || 0,
        name: String(row['Name'] ?? ''),
        fields,
      };
    });
  }

  // Import Digital Emergency Config
  const digitalConfigSheet = getSheet('Digital Emergency Config');
  if (digitalConfigSheet) {
    const rows = sheetToJson(digitalConfigSheet) as Record<string, unknown>[];
    if (rows.length > 0) {
      const row = rows[0];
      result.digitalEmergencyConfig = {
        countIndex: parseInt(String(row['Count/Index'] ?? '0'), 10) || 0,
        unknown: parseInt(String(row['Unknown'] ?? '0'), 10) || 0,
        numericFields: [
          parseInt(String(row['Numeric Field 1'] ?? '0'), 10) || 0,
          parseInt(String(row['Numeric Field 2'] ?? '0'), 10) || 0,
          parseInt(String(row['Numeric Field 3'] ?? '0'), 10) || 0,
        ] as [number, number, number],
        byteFields: [
          parseInt(String(row['Byte Field 1'] ?? '0'), 10) || 0,
          parseInt(String(row['Byte Field 2'] ?? '0'), 10) || 0,
        ] as [number, number],
        values16bit: [
          parseInt(String(row['16-bit Value 1'] ?? '0'), 10) || 0,
          parseInt(String(row['16-bit Value 2'] ?? '0'), 10) || 0,
          parseInt(String(row['16-bit Value 3'] ?? '0'), 10) || 0,
          parseInt(String(row['16-bit Value 4'] ?? '0'), 10) || 0,
        ] as [number, number, number, number],
        bitFlags: parseInt(String(row['Bit Flags'] ?? '0'), 10) || 0,
        indexCount: parseInt(String(row['Index/Count'] ?? '0'), 10) || 0,
        entryArray: [],
        additionalConfig: new Uint8Array(192),
      };
    }
  }

  // Import Analog Emergency
  const analogSheet = getSheet('Analog Emergency');
  if (analogSheet) {
    const rows = sheetToJson(analogSheet) as Record<string, unknown>[];
    result.analogEmergencies = rows.map(row => ({
      index: parseInt(String(row['Index'] ?? '0'), 10) || 0,
      name: String(row['Name'] ?? ''),
      enabled: row['Enabled'] === 'Yes',
      alarmType: parseInt(String(row['Alarm Type'] ?? '0'), 10) || 0,
      alarmMode: parseInt(String(row['Alarm Mode'] ?? '0'), 10) || 0,
      signalling: parseInt(String(row['Signalling'] ?? '0'), 10) || 0,
      revertChannel: parseInt(String(row['Revert Channel'] ?? '0'), 10) || 0,
      squelchMode: parseInt(String(row['Squelch Mode'] ?? '0'), 10) || 0,
      idType: parseInt(String(row['ID Type'] ?? '0'), 10) || 0,
      flags: parseInt(String(row['Flags'] ?? '0'), 10) || 0,
      frequencyId: parseInt(String(row['Frequency/ID'] ?? '0'), 10) || 0,
    } as AnalogEmergency));
  }

  // Import Radio Settings (row layout)
  const radioSettingsSheet = getSheet('Radio Settings') ?? getSheet('VFO Settings');
  if (radioSettingsSheet) {
    const rows = sheetToArrays(radioSettingsSheet) as (string | number)[][];
    const firstCell = rows[0]?.[0];
    const settingsData: Record<string, unknown> = {};
    if (firstCell === 'Field' && rows.length > 1) {
      for (let i = 1; i < rows.length; i++) {
        const [field, value] = rows[i] ?? [];
        if (field && value !== undefined && value !== '') {
          const f = String(field);
          const v = value;
          if (f.includes('Power On Display Line 1')) settingsData.powerOnDisplayLine1 = String(v);
          else if (f.includes('Power On Display Line 2')) settingsData.powerOnDisplayLine2 = String(v);
          else if (f.includes('Unknown Flag')) settingsData.unknownFlag = parseInt(String(v), 10) || 0;
          else if (f.includes('Allow Reset')) settingsData.allowReset = String(v).toLowerCase() === 'yes';
          else if (f.includes('Power On Interface')) settingsData.powerOnInterface = parseInt(String(v), 10) || 0;
          else if (f.includes('Alert Tone Flags') && !f.includes('Cont')) settingsData.alertToneFlags = parseInt(String(v), 10) || 0;
          else if (f.includes('Alert Tone Flags Cont')) settingsData.alertToneFlagsCont = parseInt(String(v), 10) || 0;
          else if (f.includes('Unknown Radio Setting')) settingsData.unknownRadioSetting = parseInt(String(v), 10) || 0;
          else if (f.includes('Radio Enabled')) settingsData.radioEnabled = String(v).toLowerCase() === 'yes';
          else if (f === 'Latitude') settingsData.latitude = String(v);
          else if (f === 'Latitude Direction') settingsData.latitudeDirection = String(v) === 'S' ? 'S' : 'N';
          else if (f === 'Longitude') settingsData.longitude = String(v);
          else if (f === 'Longitude Direction') settingsData.longitudeDirection = String(v) === 'W' ? 'W' : 'E';
          else if (f === 'Current Channel A') settingsData.currentChannelA = String(v) === 'None' ? 0 : parseInt(String(v), 10) || 0;
          else if (f === 'Current Channel B') settingsData.currentChannelB = String(v) === 'None' ? 0 : parseInt(String(v), 10) || 0;
          else if (f === 'Channel Setting 3') settingsData.channelSetting3 = parseInt(String(v), 10) || 0;
          else if (f === 'Channel Setting 4') settingsData.channelSetting4 = parseInt(String(v), 10) || 0;
          else if (f === 'Channel Setting 5') settingsData.channelSetting5 = parseInt(String(v), 10) || 0;
          else if (f === 'Channel Setting 6') settingsData.channelSetting6 = parseInt(String(v), 10) || 0;
          else if (f === 'Channel Setting 7') settingsData.channelSetting7 = parseInt(String(v), 10) || 0;
          else if (f === 'Channel Setting 8') settingsData.channelSetting8 = parseInt(String(v), 10) || 0;
          else if (f === 'Current Zone') settingsData.currentZone = String(v) === 'None' ? 0 : parseInt(String(v), 10) || 0;
          else if (f === 'Zone Enabled') settingsData.zoneEnabled = String(v).toLowerCase() === 'yes';
          else if (f.includes('Unknown Value')) settingsData.unknownValue = String(v);
        }
      }
    }
    result.radioSettings = {
      unknownFlag: (settingsData.unknownFlag as number) ?? 0,
      powerOnDisplayLine1: (settingsData.powerOnDisplayLine1 as string) ?? '',
      powerOnDisplayLine2: (settingsData.powerOnDisplayLine2 as string) ?? '',
      allowReset: (settingsData.allowReset as boolean) ?? false,
      powerOnInterface: (settingsData.powerOnInterface as number) ?? 0,
      alertToneFlags: (settingsData.alertToneFlags as number) ?? 0,
      alertToneFlagsCont: (settingsData.alertToneFlagsCont as number) ?? 0,
      channelAColor: (settingsData.channelAColor as number) ?? 0,
      channelBColor: (settingsData.channelBColor as number) ?? 0,
      unknownDisplay: (settingsData.unknownDisplay as number) ?? 0,
      displayFlags: (settingsData.displayFlags as number) ?? 0,
      backlightBrightness: (settingsData.backlightBrightness as number) ?? 3,
      autoBacklightDuration: (settingsData.autoBacklightDuration as number) ?? 10,
      menuExitTime: (settingsData.menuExitTime as number) ?? 5,
      standbyCharacterColor1: (settingsData.standbyCharacterColor1 as number) ?? 0,
      standbyCharacterColor2: (settingsData.standbyCharacterColor2 as number) ?? 0,
      zoneAColor: (settingsData.zoneAColor as number) ?? 0,
      zoneBColor: (settingsData.zoneBColor as number) ?? 0,
      workModeFlags: (settingsData.workModeFlags as number) ?? 0,
      utcZone: (settingsData.utcZone as number) ?? 0,
      measurePeriodInterval: (settingsData.measurePeriodInterval as number) ?? 5,
      unknownFlags: (settingsData.unknownFlags as number) ?? 0,
      gpsAprsFlags: (settingsData.gpsAprsFlags as number) ?? 0,
      callHoldTime: (settingsData.callHoldTime as number) ?? 0,
      activeWaitTime: (settingsData.activeWaitTime as number) ?? 1,
      activeRetriesTime: (settingsData.activeRetriesTime as number) ?? 1,
      preCarrierTime: (settingsData.preCarrierTime as number) ?? 0,
      digitalSettingsFlags: (settingsData.digitalSettingsFlags as number) ?? 0,
      remoteMonitorTime: (settingsData.remoteMonitorTime as number) ?? 0,
      digitalSettingsCont: (settingsData.digitalSettingsCont as number) ?? 0,
      vfoEmbeddedFlags: (settingsData.vfoEmbeddedFlags as number) ?? 0,
      txDwellTime: (settingsData.txDwellTime as number) ?? 0,
      languageOtherSettings: (settingsData.languageOtherSettings as Uint8Array) ?? new Uint8Array(8),
      unknownRadioSetting: (settingsData.unknownRadioSetting as number) ?? 0,
      radioEnabled: (settingsData.radioEnabled as boolean) ?? false,
      latitude: (settingsData.latitude as string) ?? '',
      latitudeDirection: (settingsData.latitudeDirection as string) ?? 'N',
      longitude: (settingsData.longitude as string) ?? '',
      longitudeDirection: (settingsData.longitudeDirection as string) ?? 'E',
      currentChannelA: (settingsData.currentChannelA as number) ?? 0,
      currentChannelB: (settingsData.currentChannelB as number) ?? 0,
      channelSetting3: (settingsData.channelSetting3 as number) ?? 0,
      channelSetting4: (settingsData.channelSetting4 as number) ?? 0,
      channelSetting5: (settingsData.channelSetting5 as number) ?? 0,
      channelSetting6: (settingsData.channelSetting6 as number) ?? 0,
      channelSetting7: (settingsData.channelSetting7 as number) ?? 0,
      channelSetting8: (settingsData.channelSetting8 as number) ?? 0,
      currentZone: (settingsData.currentZone as number) ?? 0,
      zoneEnabled: (settingsData.zoneEnabled as boolean) ?? false,
      unknownValue: (settingsData.unknownValue as string) ?? '000000',
    } as RadioSettings;
  }

  // Import Radio Info
  const radioInfoSheet = getSheet('Radio Info');
  if (radioInfoSheet) {
    const rows = sheetToJson(radioInfoSheet) as Record<string, unknown>[];
    if (rows.length > 0) {
      const row = rows[0];
      const parseHex = (str: string) => {
        if (!str) return undefined;
        const match = String(str).match(/0x([0-9a-fA-F]+)/);
        return match ? parseInt(match[1], 16) : undefined;
      };
      const configStart = parseHex(String(row['Config Start'] ?? ''));
      const configEnd = parseHex(String(row['Config End'] ?? ''));
      result.radioInfo = {
        model: String(row['Model'] ?? ''),
        firmware: String(row['Firmware'] ?? ''),
        buildDate: String(row['Build Date'] ?? ''),
        dspVersion: row['DSP Version'] != null ? String(row['DSP Version']) : undefined,
        radioVersion: row['Radio Version'] != null ? String(row['Radio Version']) : undefined,
        codeplugVersion: row['Codeplug Version'] != null ? String(row['Codeplug Version']) : undefined,
        ...(configStart !== undefined && configEnd !== undefined && { memoryLayout: { configStart, configEnd } }),
      } as RadioInfo;
    }
  }

  return result;
}

/**
 * Get codeplug data from all stores
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
    exportDate: new Date().toISOString(),
    version: CODEPLUG_VERSION,
  };
}
