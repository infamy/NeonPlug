import type { Plugin } from 'vite';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * Vite plugin to inline favicon as base64 data URI during build
 * This keeps the source HTML clean while embedding the favicon for offline use
 * Reads favicon.ico directly and converts to base64 on-the-fly
 */
export function inlineFavicon(): Plugin {
  return {
    name: 'inline-favicon',
    transformIndexHtml(html) {
      try {
        // Try to find favicon.ico in common locations (root first, then public)
        const possiblePaths = [
          join(process.cwd(), 'favicon.ico'),
          join(process.cwd(), 'public', 'favicon.ico'),
        ];

        let faviconPath: string | null = null;
        for (const path of possiblePaths) {
          if (existsSync(path)) {
            faviconPath = path;
            break;
          }
        }

        if (!faviconPath) {
          console.warn('Favicon not found, skipping inline');
          return html;
        }

        // Read the favicon file and convert to base64
        const faviconBuffer = readFileSync(faviconPath);
        const faviconBase64 = faviconBuffer.toString('base64');

        // Replace the placeholder with the actual data URI
        const dataUri = `data:image/x-icon;base64,${faviconBase64}`;
        return html.replace(
          /href="\/favicon\.ico"/g,
          `href="${dataUri}"`
        );
      } catch (error) {
        console.warn('Failed to inline favicon:', error);
        return html;
      }
    },
  };
}
