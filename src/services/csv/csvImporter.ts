import type { Channel, Contact } from '../../models';

export interface ImportResult {
  success: boolean;
  channels?: Channel[];
  contacts?: Contact[];
  errors?: string[];
}

export function parseCSV(content: string): string[][] {
  return content.split('\n')
    .filter(line => line.trim())
    .map(line => {
      const result: string[] = [];
      let current = '';
      let inQuotes = false;

      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          if (inQuotes && line[i + 1] === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (char === ',' && !inQuotes) {
          result.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      result.push(current.trim());
      return result;
    });
}

export function getValue(headers: string[], row: string[], headerName: string): string {
  const name = headerName.toLowerCase();
  // Exact match wins; partial match alone would let 'ptt id' hit the earlier
  // 'ptt id display' column. Partial stays as fallback ('id' → 'dmr id').
  let index = headers.indexOf(name);
  if (index < 0) index = headers.findIndex(h => h.includes(name));
  return index >= 0 && index < row.length ? row[index].trim() : '';
}

export function getBool(headers: string[], row: string[], headerName: string): boolean {
  const val = getValue(headers, row, headerName).toLowerCase();
  return val === 'yes' || val === 'true' || val === '1';
}

export function getFloat(headers: string[], row: string[], headerName: string, defaultValue = 0): number {
  const val = getValue(headers, row, headerName);
  const num = parseFloat(val);
  return isNaN(num) ? defaultValue : num;
}

export function getInt(headers: string[], row: string[], headerName: string, defaultValue = 0): number {
  const val = getValue(headers, row, headerName);
  const num = parseInt(val);
  return isNaN(num) ? defaultValue : num;
}

export function importChannelsFromCSV(content: string): ImportResult {
  try {
    const rows = parseCSV(content);
    if (rows.length < 2) {
      return { success: false, errors: ['CSV file must have at least a header row and one data row'] };
    }

    const headers = rows[0].map(h => h.toLowerCase().trim());
    const channels: Channel[] = [];
    const errors: string[] = [];

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (row.length === 0 || row.every(cell => !cell.trim())) continue;

      try {
        const channel: Channel = {
          number: getFloat(headers, row, 'channel number', 0) || (i),
          name: getValue(headers, row, 'name') || `Channel ${i}`,
          rxFrequency: getFloat(headers, row, 'rx frequency', 0),
          txFrequency: getFloat(headers, row, 'tx frequency', 0),
          mode: (getValue(headers, row, 'mode') as Channel['mode']) || 'Analog',
          bandwidth: (getValue(headers, row, 'bandwidth') as Channel['bandwidth']) || '25kHz',
          power: (getValue(headers, row, 'power') as Channel['power']) || 'High',
          forbidTx: getBool(headers, row, 'forbid tx'),
          loneWorker: getBool(headers, row, 'lone worker'),
          scanAdd: false,
          scanListId: getFloat(headers, row, 'scan list', 0),
          forbidTalkaround: getBool(headers, row, 'forbid talkaround'),
          unknown1A_6_4: getFloat(headers, row, 'unknown1a_6_4', 0),
          unknown1A_3: getBool(headers, row, 'unknown1a_3'),
          aprsReceive: getBool(headers, row, 'aprs receive'),
          emergencyIndicator: getBool(headers, row, 'emergency'),
          emergencyAck: getBool(headers, row, 'emergency ack'),
          emergencySystemId: getFloat(headers, row, 'emergency id', 0),
          aprsReportMode: (getValue(headers, row, 'aprs tx') as Channel['aprsReportMode']) || 'Off',
          unknown1C_1_0: getFloat(headers, row, 'unknown1c_1_0', 0),
          voxFunction: getBool(headers, row, 'vox'),
          scramble: getBool(headers, row, 'scramble'),
          compander: getBool(headers, row, 'compander'),
          talkback: getBool(headers, row, 'talkback'),
          unknown1D_3_0: getFloat(headers, row, 'unknown1d_3_0', 0),
          squelchLevel: getFloat(headers, row, 'squelch', 3),
          digitalEmergencySystemId: getFloat(headers, row, 'digital emergency system id', 0),
          pttIdDisplay: getBool(headers, row, 'ptt id display'),
          pttId: getFloat(headers, row, 'ptt id', 0),
          colorCode: getFloat(headers, row, 'color code', 0),
          rxCtcssDcs: {
            type: (getValue(headers, row, 'rx ctcss/dcs type') as 'CTCSS' | 'DCS' | 'None') || 'None',
            value: getFloat(headers, row, 'rx ctcss/dcs value'),
          },
          txCtcssDcs: {
            type: (getValue(headers, row, 'tx ctcss/dcs type') as 'CTCSS' | 'DCS' | 'None') || 'None',
            value: getFloat(headers, row, 'tx ctcss/dcs value'),
          },
          companderDup: getBool(headers, row, 'compander dup'),
          voxRelated: getBool(headers, row, 'vox related'),
          unknown25_7_6: getFloat(headers, row, 'unknown25_7_6', 0),
          unknown25_3_0: getFloat(headers, row, 'unknown25_3_0', 0),
          pttIdDisplay2: getBool(headers, row, 'ptt id display2'),
          rxSquelchMode: (getValue(headers, row, 'rx squelch mode') as Channel['rxSquelchMode']) || 'Carrier/CTC',
          unknown26_3_1: getFloat(headers, row, 'unknown26_3_1', 0),
          unknown26_0: getBool(headers, row, 'unknown26_0'),
          stepFrequency: getFloat(headers, row, 'step frequency', 5),
          signalingType: (getValue(headers, row, 'signaling type') as Channel['signalingType']) || 'None',
          pttIdType: (getValue(headers, row, 'ptt id type') as Channel['pttIdType']) || 'Off',
          unknown29_3_2: getFloat(headers, row, 'unknown29_3_2', 0),
          unknown29_1_0: getFloat(headers, row, 'unknown29_1_0', 0),
          unknown2A: getFloat(headers, row, 'unknown2a', 0),
          contactId: getFloat(headers, row, 'contact id', 0),
        };

        channels.push(channel);
      } catch (error) {
        errors.push(`Row ${i + 1}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    return {
      success: errors.length === 0,
      channels,
      errors: errors.length > 0 ? errors : undefined,
    };
  } catch (error) {
    return {
      success: false,
      errors: [error instanceof Error ? error.message : 'Failed to parse CSV'],
    };
  }
}

export function importContactsFromCSV(content: string): ImportResult {
  try {
    const rows = parseCSV(content);
    if (rows.length < 2) {
      return { success: false, errors: ['CSV file must have at least a header row and one data row'] };
    }

    const headers = rows[0].map(h => h.toLowerCase().trim());
    const contacts: Contact[] = [];
    const errors: string[] = [];

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (row.length === 0 || row.every(cell => !cell.trim())) continue;

      try {
        const contact: Contact = {
          id: getInt(headers, row, 'id', 0) || (i),
          name: getValue(headers, row, 'name') || `Contact ${i}`,
          dmrId: getInt(headers, row, 'dmr id', 0),
          callSign: getValue(headers, row, 'call sign') || undefined,
        };

        contacts.push(contact);
      } catch (error) {
        errors.push(`Row ${i + 1}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    return {
      success: errors.length === 0,
      contacts,
      errors: errors.length > 0 ? errors : undefined,
    };
  } catch (error) {
    return {
      success: false,
      errors: [error instanceof Error ? error.message : 'Failed to parse CSV'],
    };
  }
}
