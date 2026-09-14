import { createZip } from './zip';
import { downloadBlob } from './download';

/**
 * The newest release's single-file build. The release workflow uploads every build
 * twice, as neonplug-vYEAR.MONTH.N.html and again as neonplug-latest.html, so this
 * URL never needs updating. The startup screen and the About tab both send people
 * here when the ZIP download isn't available, so it lives in one place.
 */
export const OFFLINE_RELEASE_URL =
  'https://github.com/infamy/NeonPlug/releases/latest/download/neonplug-latest.html';

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
