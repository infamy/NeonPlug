import type { Channel, Contact } from '../../models';

export interface ImportResult {
  success: boolean;
  channels?: Channel[];
  contacts?: Contact[];
  errors?: string[];
}

export function parseCSV(content: string): string[][] {
  const lines: string[] = [];
  let currentLine = '';
  let inQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const nextChar = content[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentLine += '"';
        i++; // Skip next quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      lines.push(currentLine);
      currentLine = '';
    } else if (char === '\n' && !inQuotes) {
      lines.push(currentLine);
      currentLine = '';
    } else {
      currentLine += char;
    }
  }
  if (currentLine) {
    lines.push(currentLine);
  }

  // Split into rows
  const rows: string[][] = [];
  let row: string[] = [];
  for (const line of lines) {
    row.push(line.trim());
    if (line.includes('\n') || row.length > 50) { // Assume max 50 columns
      rows.push(row);
      row = [];
    }
  }
  if (row.length > 0) {
    rows.push(row);
  }

  // Simple approach: split by newlines first, then by commas
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
        const getValue = (headerName: string): string => {
          const index = headers.findIndex(h => h.includes(headerName.toLowerCase()));
          return index >= 0 && index < row.length ? row[index].trim() : '';
        };

        const getBool = (headerName: string): boolean => {
          const val = getValue(headerName).toLowerCase();
          return val === 'yes' || val === 'true' || val === '1';
        };

        const getNumber = (headerName: string, defaultValue: number = 0): number => {
          const val = getValue(headerName);
          const num = parseFloat(val);
          return isNaN(num) ? defaultValue : num;
        };

        const channel: Channel = {
          number: getNumber('channel number', 0) || (i),
          name: getValue('name') || `Channel ${i}`,
          rxFrequency: getNumber('rx frequency', 0),
          txFrequency: getNumber('tx frequency', 0),
          mode: (getValue('mode') as Channel['mode']) || 'Analog',
          bandwidth: (getValue('bandwidth') as Channel['bandwidth']) || '25kHz',
          power: (getValue('power') as Channel['power']) || 'High',
          forbidTx: getBool('forbid tx'),
          busyLock: (getValue('busy lock') as Channel['busyLock']) || 'Off',
          loneWorker: getBool('lone worker'),
          scanAdd: getBool('scan add'),
          scanListId: getNumber('scan list', 0),
          forbidTalkaround: getBool('forbid talkaround'),
          unknown1A_6_4: getNumber('unknown1a_6_4', 0),
          unknown1A_3: getBool('unknown1a_3'),
          aprsReceive: getBool('aprs receive'),
          reverseFreq: getNumber('reverse freq', 0),
          emergencyIndicator: getBool('emergency'),
          emergencyAck: getBool('emergency ack'),
          emergencySystemId: getNumber('emergency id', 0),
          aprsReportMode: (getValue('aprs tx') as Channel['aprsReportMode']) || 'Off',
          unknown1C_1_0: getNumber('unknown1c_1_0', 0),
          voxFunction: getBool('vox'),
          scramble: getBool('scramble'),
          compander: getBool('compander'),
          talkback: getBool('talkback'),
          unknown1D_3_0: getNumber('unknown1d_3_0', 0),
          squelchLevel: getNumber('squelch', 0),
          pttIdDisplay: getBool('ptt id display'),
          pttId: getNumber('ptt id', 0),
          colorCode: getNumber('color code', 0),
          rxCtcssDcs: {
            type: (getValue('rx ctcss/dcs type') as 'CTCSS' | 'DCS' | 'None') || 'None',
            value: getNumber('rx ctcss/dcs value'),
          },
          txCtcssDcs: {
            type: (getValue('tx ctcss/dcs type') as 'CTCSS' | 'DCS' | 'None') || 'None',
            value: getNumber('tx ctcss/dcs value'),
          },
          companderDup: getBool('compander dup'),
          voxRelated: getBool('vox related'),
          unknown25_7_6: getNumber('unknown25_7_6', 0),
          unknown25_3_0: getNumber('unknown25_3_0', 0),
          pttIdDisplay2: getBool('ptt id display2'),
          rxSquelchMode: (getValue('rx squelch mode') as Channel['rxSquelchMode']) || 'Carrier/CTC',
          unknown26_3_1: getNumber('unknown26_3_1', 0),
          unknown26_0: getBool('unknown26_0'),
          stepFrequency: getNumber('step frequency', 5),
          signalingType: (getValue('signaling type') as Channel['signalingType']) || 'None',
          pttIdType: (getValue('ptt id type') as Channel['pttIdType']) || 'Off',
          unknown29_3_2: getNumber('unknown29_3_2', 0),
          unknown29_1_0: getNumber('unknown29_1_0', 0),
          unknown2A: getNumber('unknown2a', 0),
          contactId: getNumber('contact id', 0),
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
        const getValue = (headerName: string): string => {
          const index = headers.findIndex(h => h.includes(headerName.toLowerCase()));
          return index >= 0 && index < row.length ? row[index].trim() : '';
        };

        const getNumber = (headerName: string, defaultValue: number = 0): number => {
          const val = getValue(headerName);
          const num = parseInt(val);
          return isNaN(num) ? defaultValue : num;
        };

        const contact: Contact = {
          id: getNumber('id', 0) || (i),
          name: getValue('name') || `Contact ${i}`,
          dmrId: getNumber('dmr id', 0),
          callSign: getValue('call sign') || undefined,
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

