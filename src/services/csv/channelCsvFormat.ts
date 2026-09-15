/**
 * Which channel CSV a file is, from its header row.
 *
 * The Channel Wizard offered only CHIRP import, and the CHIRP importer looks
 * for an exact "Frequency" column. A NeonPlug channels.csv calls it "RX
 * Frequency", so dropping one in failed every row with "Invalid RX frequency".
 */

import { parseCSV } from './csvImporter';

export type ChannelCsvFormat = 'chirp' | 'neonplug';

export function detectChannelCsvFormat(content: string): ChannelCsvFormat | null {
  // A spreadsheet's export can start with a byte order mark (U+FEFF).
  const text = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const headers = (parseCSV(firstLine)[0] ?? []).map((header) => header.trim().toLowerCase());
  if (headers.some((header) => header.startsWith('rx frequency'))) return 'neonplug';
  if (headers.includes('frequency')) return 'chirp';
  return null;
}
