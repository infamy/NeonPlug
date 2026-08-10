import type { Channel, Contact, Zone, ScanList, RXGroup, DMRRadioID, QuickContact } from '../../models';
import { downloadFile } from '../../utils/download';

function toCSV(headers: string[], rows: (string | number)[][]): string {
  return [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
  ].join('\n');
}

export function exportChannelsToCSV(channels: Channel[]): string {
  const headers = [
    'Channel Number',
    'Name',
    'RX Frequency',
    'TX Frequency',
    'Mode',
    'Bandwidth',
    'Power',
    'Forbid TX',
    'Lone Worker',
    'Scan List ID',
    'Forbid Talkaround',
    'APRS Receive',
    'Emergency',
    'Emergency Ack',
    'Emergency ID',
    'APRS TX',
    'VOX',
    'Scramble',
    'Compander',
    'Talkback',
    'Squelch',
    'PTT ID Display',
    'PTT ID',
    'Color Code',
    'RX CTCSS/DCS Type',
    'RX CTCSS/DCS Value',
    'TX CTCSS/DCS Type',
    'TX CTCSS/DCS Value',
    'Compander Dup',
    'VOX Related',
    'RX Squelch Mode',
    'Step Frequency',
    'Signaling Type',
    'PTT ID Type',
    'Contact ID',
  ];

  const rows = channels.map(channel => [
    channel.number.toString(),
    channel.name,
    channel.rxFrequency.toFixed(4),
    channel.txFrequency.toFixed(4),
    channel.mode,
    channel.bandwidth,
    channel.power,
    channel.forbidTx ? 'Yes' : 'No',
    channel.loneWorker ? 'Yes' : 'No',
    channel.scanListId.toString(),
    channel.forbidTalkaround ? 'Yes' : 'No',
    channel.aprsReceive ? 'Yes' : 'No',
    channel.emergencyIndicator ? 'Yes' : 'No',
    channel.emergencyAck ? 'Yes' : 'No',
    channel.emergencySystemId.toString(),
    channel.aprsReportMode === 'Digital' ? 'Yes' : 'No',
    channel.voxFunction ? 'Yes' : 'No',
    channel.scramble ? 'Yes' : 'No',
    channel.compander ? 'Yes' : 'No',
    channel.talkback ? 'Yes' : 'No',
    channel.squelchLevel.toString(),
    channel.pttIdDisplay ? 'Yes' : 'No',
    channel.pttId.toString(),
    channel.colorCode.toString(),
    channel.rxCtcssDcs.type,
    channel.rxCtcssDcs.value?.toString() || '',
    channel.txCtcssDcs.type,
    channel.txCtcssDcs.value?.toString() || '',
    channel.companderDup ? 'Yes' : 'No',
    channel.voxRelated ? 'Yes' : 'No',
    channel.rxSquelchMode,
    channel.stepFrequency.toString(),
    channel.signalingType,
    channel.pttIdType,
    channel.contactId.toString(),
  ]);

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

