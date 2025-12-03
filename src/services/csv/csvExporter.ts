import type { Channel, Contact } from '../../models';

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
    'Busy Lock',
    'Lone Worker',
    'Scan Add',
    'Scan List ID',
    'Forbid Talkaround',
    'APRS Receive',
    'Reverse Freq',
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
    channel.busyLock,
    channel.loneWorker ? 'Yes' : 'No',
    channel.scanAdd ? 'Yes' : 'No',
    channel.scanListId.toString(),
    channel.forbidTalkaround ? 'Yes' : 'No',
    channel.aprsReceive ? 'Yes' : 'No',
    channel.reverseFreq.toString(),
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

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
  ].join('\n');

  return csvContent;
}

export function exportContactsToCSV(contacts: Contact[]): string {
  const headers = ['ID', 'Name', 'DMR ID', 'Call Sign'];

  const rows = contacts.map(contact => [
    contact.id.toString(),
    contact.name,
    contact.dmrId.toString(),
    contact.callSign || '',
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
  ].join('\n');

  return csvContent;
}

export function downloadCSV(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  URL.revokeObjectURL(url);
}

