/**
 * Fetch the app's index (current origin + path, no full URL) and trigger download as neonplug-offline.zip.
 * Same-origin fetch avoids CORS; works on localhost and on the deployed site.
 * JSZip is loaded on demand when the user clicks.
 */
export async function downloadOfflineAsZip(): Promise<void> {
  const url = typeof window !== 'undefined' ? new URL('.', window.location.href).href : '';
  if (!url) throw new Error('Not available');
  const response = await fetch(url);
  if (!response.ok) throw new Error('Not available');
  const html = await response.text();

  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  zip.file('neonplug.html', html);

  const blob = await zip.generateAsync({ type: 'blob' });
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = 'neonplug-offline.zip';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(blobUrl);
}
