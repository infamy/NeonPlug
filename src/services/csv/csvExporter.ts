import type { Channel, Contact, Zone, ScanList, RXGroup, DMRRadioID, QuickContact } from '../../models';
import { downloadFile } from '../../utils/download';
import { CHANNEL_CSV_COLUMN_LIST } from './channelCsvColumns';

function toCSV(headers: string[], rows: (string | number)[][]): string {
  return [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
  ].join('\n');
}

/** Every channel field, one column (or three, for a tone) each. See channelCsvColumns.ts. */
export function exportChannelsToCSV(channels: Channel[]): string {
  const headers = CHANNEL_CSV_COLUMN_LIST.flatMap(([, column]) => [...column.headers]);
  const rows = channels.map((channel) =>
    CHANNEL_CSV_COLUMN_LIST.flatMap(([key, column]) => column.write(channel[key]))
  );
  return toCSV(headers, rows);
}

export function exportContactsToCSV(contacts: Contact[]): string {
  const headers = ['ID', 'Name', 'DMR ID', 'Call Sign', 'City', 'Province', 'Country', 'Remark'];

  const rows = contacts.map(contact => [
    contact.id.toString(),
    contact.name,
    contact.dmrId.toString(),
    contact.callSign || '',
    contact.city || '',
    contact.province || '',
    contact.country || '',
    contact.remark || '',
  ]);

  return toCSV(headers, rows);
}

/** Channel numbers are joined with ';' within a single cell since Zone/ScanList each hold a list. */
const CHANNEL_LIST_SEPARATOR = ';';

export function exportZonesToCSV(zones: Zone[]): string {
  const headers = ['Zone Name', 'Channels'];

  const rows = zones.map(zone => [
    zone.name,
    zone.channels.join(CHANNEL_LIST_SEPARATOR),
  ]);

  return toCSV(headers, rows);
}

export function exportScanListsToCSV(scanLists: ScanList[]): string {
  const headers = [
    'Name',
    'Channels',
    'CTC Scan Mode',
    'Scan TX Mode',
    'Hang Time',
    'Priority 1 Type',
    'Priority 2 Type',
    'Priority Channel 1',
    'Priority Channel 2',
    'Designated TX Channel',
  ];

  const rows = scanLists.map(scanList => [
    scanList.name,
    scanList.channels.join(CHANNEL_LIST_SEPARATOR),
    scanList.ctcScanMode.toString(),
    scanList.scanTxMode.toString(),
    scanList.hangTime?.toString() ?? '',
    scanList.priority1Type?.toString() ?? '',
    scanList.priority2Type?.toString() ?? '',
    scanList.priorityChannel1?.toString() ?? '',
    scanList.priorityChannel2?.toString() ?? '',
    scanList.designatedTxChannel?.toString() ?? '',
  ]);

  return toCSV(headers, rows);
}

export function exportRXGroupsToCSV(groups: RXGroup[]): string {
  const headers = ['Index', 'Name', 'Talk Group DMR IDs'];

  const rows = groups.map(group => [
    group.index.toString(),
    group.name,
    group.talkGroupIndices.join(CHANNEL_LIST_SEPARATOR),
  ]);

  return toCSV(headers, rows);
}

export function exportDMRRadioIDsToCSV(radioIds: DMRRadioID[]): string {
  const headers = ['Index', 'DMR ID', 'Name'];

  const rows = radioIds.map(radioId => [
    radioId.index.toString(),
    radioId.dmrId,
    radioId.name,
  ]);

  return toCSV(headers, rows);
}

const QUICK_CONTACT_CALL_TYPE_LABELS: Record<number, string> = { 0x03: 'Private', 0x04: 'Group', 0x05: 'All' };

export function exportQuickContactsToCSV(contacts: QuickContact[]): string {
  const headers = ['Index', 'Name', 'Contact Number', 'Call Type'];

  const rows = contacts.map(contact => [
    contact.index.toString(),
    contact.name,
    contact.contactNumber.toString(),
    QUICK_CONTACT_CALL_TYPE_LABELS[contact.callType] ?? contact.callType.toString(),
  ]);

  return toCSV(headers, rows);
}

export function downloadCSV(content: string, filename: string): void {
  downloadFile(content, filename, 'text/csv;charset=utf-8;');
}

