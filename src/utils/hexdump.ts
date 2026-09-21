/**
 * Shared hex-dump helpers for the Diagnostics tab and debug exports.
 * One implementation of the classic "OFFSET  HH HH ...  ascii" 16-byte-row
 * format — previously copy-pasted across DiagnosticsTab panels and exports.
 */

import { downloadFile } from './download';

export function formatHexDumpText(data: Uint8Array, headerLines: string[] = []): string {
  const bytesPerRow = 16;
  let out = '';
  for (const line of headerLines) out += `${line}\n`;
  for (let i = 0; i < data.length; i += bytesPerRow) {
    const rowBytes = data.slice(i, i + bytesPerRow);
    const offsetHex = i.toString(16).toUpperCase().padStart(4, '0');
    const hexBytes = Array.from(rowBytes)
      .map((b) => b.toString(16).toUpperCase().padStart(2, '0'))
      .join(' ');
    const hexPadding = '   '.repeat(bytesPerRow - rowBytes.length);
    const ascii = Array.from(rowBytes)
      .map((b) => (b >= 32 && b <= 126 ? String.fromCharCode(b) : '.'))
      .join('');
    out += `${offsetHex}  ${hexBytes}${hexPadding}  ${ascii}\n`;
  }
  return out;
}

export function downloadHexDump(data: Uint8Array, filename: string): void {
  downloadFile(formatHexDumpText(data), filename, 'text/plain');
}

export function downloadBinary(data: Uint8Array, filename: string): void {
  // Copy so the Blob never wraps a SharedArrayBuffer-backed view.
  downloadFile(new Uint8Array(data), filename, 'application/octet-stream');
}
