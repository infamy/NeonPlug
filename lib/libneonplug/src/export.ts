import type { Contact } from './types';

/**
 * Export contacts to CSV format
 * @param contacts Array of contacts to export
 * @returns CSV string with headers: ID, Name, DMR ID, Call Sign
 */
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

/**
 * Download CSV content as a file (browser only)
 * @param content CSV string content
 * @param filename Name of the file to download
 */
export function downloadCSV(content: string, filename: string): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('downloadCSV is only available in browser environments');
  }

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
