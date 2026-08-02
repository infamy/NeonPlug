import { createZip } from './zip';
import { downloadBlob } from './download';

/**
 * Fetch the app's index (current origin + path, no full URL) and trigger download as neonplug-offline.zip.
 * Same-origin fetch avoids CORS; works on localhost and on the deployed site.
 */
export async function downloadOfflineAsZip(): Promise<void> {
  const url = typeof window !== 'undefined' ? new URL('.', window.location.href).href : '';
  if (!url) throw new Error('Not available');
  const response = await fetch(url);
  if (!response.ok) throw new Error('Not available');
  const html = await response.text();

  const blob = await createZip([{ name: 'neonplug.html', data: html }]);
  downloadBlob(blob, 'neonplug-offline.zip');
}
