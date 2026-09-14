import type { Channel, Contact, Zone, ScanList, RXGroup, DMRRadioID, QuickContact } from '../../models';
import { generateZoneId } from '../../utils/zoneHelpers';
import { createDefaultChannel } from '../../utils/channelHelpers';
import { CHANNEL_CSV_COLUMN_LIST, channelCsvCellIndex } from './channelCsvColumns';

export interface ImportResult {
  success: boolean;
  channels?: Channel[];
  contacts?: Contact[];
  zones?: Zone[];
  scanLists?: ScanList[];
  rxGroups?: RXGroup[];
  dmrRadioIds?: DMRRadioID[];
  quickContacts?: QuickContact[];
  errors?: string[];
}

/** Matches the ';' separator exportZonesToCSV/exportScanListsToCSV/exportRXGroupsToCSV use for a channel/ID list in one cell. */
function parseNumberList(value: string): number[] {
  return value
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0)
    .map(s => parseInt(s, 10))
    .filter(n => !isNaN(n));
}

/**
 * A 0-based index column. Empty means next in order. The old
 * `getInt(...) || (i - 1)` turned a real index 0 into a duplicate of whatever
 * came after it.
 */
function readIndex(cell: string, position: number): number | string {
  if (cell === '') return position;
  const n = Number(cell);
  return Number.isInteger(n) && n >= 0 ? n : `Index "${cell}" is not a whole number of 0 or more`;
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
    // Where each column's cells sit in this file, worked out once.
    const cellIndexes = CHANNEL_CSV_COLUMN_LIST.map(([, column]) =>
      column.headers.map((header) => channelCsvCellIndex(headers, header))
    );

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (row.length === 0 || row.every(cell => !cell.trim())) continue;

      try {
        // Defaults for whatever the file leaves out. A missing frequency stays 0,
        // never a real-looking default someone could transmit on.
        const channel = createDefaultChannel({ rxFrequency: 0, txFrequency: 0 });
        // Each column's type matches its field, which the table's type guarantees.
        const fields = channel as unknown as Record<string, unknown>;
        const rowErrors: string[] = [];

        CHANNEL_CSV_COLUMN_LIST.forEach(([key, column], c) => {
          const cells = cellIndexes[c].map((at) => (at >= 0 && at < row.length ? row[at].trim() : ''));
          const result = column.read(cells);
          if ('error' in result) rowErrors.push(result.error);
          else if (result.value !== undefined) fields[key] = result.value;
        });

        if (rowErrors.length > 0) {
          errors.push(`Row ${i + 1}: ${rowErrors.join('; ')}`);
          continue;
        }
        if (!channel.number) channel.number = i;
        if (!channel.name) channel.name = `Channel ${i}`;

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
          city: getValue(headers, row, 'city') || undefined,
          province: getValue(headers, row, 'province') || undefined,
          country: getValue(headers, row, 'country') || undefined,
          remark: getValue(headers, row, 'remark') || undefined,
        };
        // Left unset when the file says nothing, so radios with no friends list stay distinguishable.
        if (getValue(headers, row, 'friend') !== '') contact.isFriend = getBool(headers, row, 'friend');

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

export function importZonesFromCSV(content: string): ImportResult {
  try {
    const rows = parseCSV(content);
    if (rows.length < 2) {
      return { success: false, errors: ['CSV file must have at least a header row and one data row'] };
    }

    const headers = rows[0].map(h => h.toLowerCase().trim());
    const zones: Zone[] = [];
    const errors: string[] = [];

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (row.length === 0 || row.every(cell => !cell.trim())) continue;

      try {
        // Keep the file's zone id when it has one: on the DA-7X2 the id is what
        // keeps a zone in its slot. A file without the column gets new ids.
        const id = getValue(headers, row, 'zone id') || generateZoneId();
        if (zones.some((z) => z.id === id)) {
          errors.push(`Row ${i + 1}: Zone ID "${id}" appears more than once`);
          continue;
        }
        const zone: Zone = {
          id,
          name: getValue(headers, row, 'zone name') || `Zone ${i}`,
          channels: parseNumberList(getValue(headers, row, 'channels')),
        };
        if (getValue(headers, row, 'hidden') !== '') zone.hidden = getBool(headers, row, 'hidden');
        zones.push(zone);
      } catch (error) {
        errors.push(`Row ${i + 1}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    return {
      success: errors.length === 0,
      zones,
      errors: errors.length > 0 ? errors : undefined,
    };
  } catch (error) {
    return {
      success: false,
      errors: [error instanceof Error ? error.message : 'Failed to parse CSV'],
    };
  }
}

export function importScanListsFromCSV(content: string): ImportResult {
  try {
    const rows = parseCSV(content);
    if (rows.length < 2) {
      return { success: false, errors: ['CSV file must have at least a header row and one data row'] };
    }

    const headers = rows[0].map(h => h.toLowerCase().trim());
    const scanLists: ScanList[] = [];
    const errors: string[] = [];

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (row.length === 0 || row.every(cell => !cell.trim())) continue;

      try {
        const priorityChannel1 = getValue(headers, row, 'priority channel 1');
        const priorityChannel2 = getValue(headers, row, 'priority channel 2');
        const designatedTxChannel = getValue(headers, row, 'designated tx channel');
        const priority1Type = getValue(headers, row, 'priority 1 type');
        const priority2Type = getValue(headers, row, 'priority 2 type');
        const hangTime = getValue(headers, row, 'hang time');
        const slotCell = getValue(headers, row, 'slot');
        const slot = slotCell === '' ? undefined : Number(slotCell);
        if (slot !== undefined && !(Number.isInteger(slot) && slot >= 0)) {
          errors.push(`Row ${i + 1}: Slot "${slotCell}" is not a whole number of 0 or more`);
          continue;
        }
        if (slot !== undefined && scanLists.some((l) => l.slot === slot)) {
          errors.push(`Row ${i + 1}: Slot ${slot} appears more than once`);
          continue;
        }

        scanLists.push({
          name: getValue(headers, row, 'name') || `Scan List ${i}`,
          ...(slot === undefined ? {} : { slot }),
          channels: parseNumberList(getValue(headers, row, 'channels')),
          ctcScanMode: getInt(headers, row, 'ctc scan mode', 0),
          scanTxMode: getInt(headers, row, 'scan tx mode', 0),
          hangTime: hangTime === '' ? undefined : parseInt(hangTime, 10),
          priority1Type: priority1Type === '' ? undefined : parseInt(priority1Type, 10),
          priority2Type: priority2Type === '' ? undefined : parseInt(priority2Type, 10),
          priorityChannel1: priorityChannel1 === '' ? undefined : parseInt(priorityChannel1, 10),
          priorityChannel2: priorityChannel2 === '' ? undefined : parseInt(priorityChannel2, 10),
          designatedTxChannel: designatedTxChannel === '' ? undefined : parseInt(designatedTxChannel, 10),
        });
      } catch (error) {
        errors.push(`Row ${i + 1}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    return {
      success: errors.length === 0,
      scanLists,
      errors: errors.length > 0 ? errors : undefined,
    };
  } catch (error) {
    return {
      success: false,
      errors: [error instanceof Error ? error.message : 'Failed to parse CSV'],
    };
  }
}

export function importRXGroupsFromCSV(content: string): ImportResult {
  try {
    const rows = parseCSV(content);
    if (rows.length < 2) {
      return { success: false, errors: ['CSV file must have at least a header row and one data row'] };
    }

    const headers = rows[0].map(h => h.toLowerCase().trim());
    const rxGroups: RXGroup[] = [];
    const errors: string[] = [];

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (row.length === 0 || row.every(cell => !cell.trim())) continue;

      try {
        const index = readIndex(getValue(headers, row, 'index'), rxGroups.length);
        if (typeof index === 'string') {
          errors.push(`Row ${i + 1}: ${index}`);
          continue;
        }
        if (rxGroups.some((g) => g.index === index)) {
          errors.push(`Row ${i + 1}: Index ${index} appears more than once`);
          continue;
        }
        // Members stay as the file's DMR IDs. A radio that stores slots converts
        // them with rxGroupsWithRadioMembers.
        rxGroups.push({
          index,
          name: getValue(headers, row, 'name') || `RX Group ${i}`,
          bitmask: 0, // Derived at encode time from the group's position, not stored per-entry
          statusFlag: 0,
          entryFlag: 1,
          validationFlag: 0,
          talkGroupIndices: parseNumberList(getValue(headers, row, 'talk group dmr ids')),
        });
      } catch (error) {
        errors.push(`Row ${i + 1}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    return {
      success: errors.length === 0,
      rxGroups,
      errors: errors.length > 0 ? errors : undefined,
    };
  } catch (error) {
    return {
      success: false,
      errors: [error instanceof Error ? error.message : 'Failed to parse CSV'],
    };
  }
}

export function importDMRRadioIDsFromCSV(content: string): ImportResult {
  try {
    const rows = parseCSV(content);
    if (rows.length < 2) {
      return { success: false, errors: ['CSV file must have at least a header row and one data row'] };
    }

    const headers = rows[0].map(h => h.toLowerCase().trim());
    const dmrRadioIds: DMRRadioID[] = [];
    const errors: string[] = [];

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (row.length === 0 || row.every(cell => !cell.trim())) continue;

      try {
        const dmrId = getValue(headers, row, 'dmr id') || '0';
        const dmrIdValue = parseInt(dmrId, 10) || 0;
        const bytes = new Uint8Array(3);
        bytes[0] = dmrIdValue & 0xFF;
        bytes[1] = (dmrIdValue >> 8) & 0xFF;
        bytes[2] = (dmrIdValue >> 16) & 0xFF;

        const index = readIndex(getValue(headers, row, 'index'), dmrRadioIds.length);
        if (typeof index === 'string') {
          errors.push(`Row ${i + 1}: ${index}`);
          continue;
        }
        if (dmrRadioIds.some((r) => r.index === index)) {
          errors.push(`Row ${i + 1}: Index ${index} appears more than once`);
          continue;
        }
        dmrRadioIds.push({
          index,
          dmrId,
          dmrIdValue,
          dmrIdBytes: bytes,
          name: getValue(headers, row, 'name') || `Radio ID ${i}`,
        });
      } catch (error) {
        errors.push(`Row ${i + 1}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    return {
      success: errors.length === 0,
      dmrRadioIds,
      errors: errors.length > 0 ? errors : undefined,
    };
  } catch (error) {
    return {
      success: false,
      errors: [error instanceof Error ? error.message : 'Failed to parse CSV'],
    };
  }
}

/** The labels the exporter writes, their longer forms, and the raw call type byte. Nothing else is guessed at. */
const CALL_TYPES: Record<string, number> = {
  'private': 0x03, 'private call': 0x03, 'prv': 0x03, '3': 0x03, '0x03': 0x03,
  'group': 0x04, 'group call': 0x04, '4': 0x04, '0x04': 0x04,
  'all': 0x05, 'all call': 0x05, '5': 0x05, '0x05': 0x05,
};

/** The largest 24-bit DMR ID, and the one an All Call uses. */
const ALL_CALL_ID = 0xFFFFFF;

export function importQuickContactsFromCSV(content: string): ImportResult {
  try {
    const rows = parseCSV(content);
    if (rows.length < 2) {
      return { success: false, errors: ['CSV file must have at least a header row and one data row'] };
    }

    const headers = rows[0].map(h => h.toLowerCase().trim());
    const quickContacts: QuickContact[] = [];
    const errors: string[] = [];

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (row.length === 0 || row.every(cell => !cell.trim())) continue;

      const label = getValue(headers, row, 'call type');
      const callType = CALL_TYPES[label.toLowerCase()];
      if (callType === undefined) {
        errors.push(`Row ${i + 1}: call type "${label}" isn't Group Call, Private Call or All Call`);
        continue;
      }
      const idText = getValue(headers, row, 'contact number');
      const contactNumber = /^\d+$/.test(idText) ? Number(idText) : NaN;
      if (!(contactNumber >= 1 && contactNumber <= ALL_CALL_ID)) {
        errors.push(`Row ${i + 1}: DMR ID "${idText}" must be a whole number from 1 to ${ALL_CALL_ID}`);
        continue;
      }
      if (callType === 0x05 && contactNumber !== ALL_CALL_ID) {
        errors.push(`Row ${i + 1}: an All Call uses DMR ID ${ALL_CALL_ID}, not ${contactNumber}`);
        continue;
      }

      const newIndex = quickContacts.length + 1;
      quickContacts.push({
        index: newIndex,
        offset: 0,
        name: getValue(headers, row, 'name') || `TG ${newIndex}`,
        contactNumber,
        callType,
        hasHeader: newIndex === 1,
        flag: 0,
        rawData: new Uint8Array(0),
      });
    }

    return {
      success: errors.length === 0,
      quickContacts,
      errors: errors.length > 0 ? errors : undefined,
    };
  } catch (error) {
    return {
      success: false,
      errors: [error instanceof Error ? error.message : 'Failed to parse CSV'],
    };
  }
}
