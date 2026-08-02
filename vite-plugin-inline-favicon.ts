import type { Plugin } from 'vite';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * Inline the favicon as a base64 data URI at build time, so the icon rides
 * inside index.html — required for the offline single-file build (a saved
 * HTML file can't reference a sibling icon) and saves a request otherwise.
 *
 * Runs with order 'pre' so the replacement happens BEFORE Vite's asset
 * pipeline rewrites the href to a hashed filename (the previous version ran
 * after and its pattern never matched, silently inlining nothing).
 */
export function inlineFavicon(): Plugin {
  return {
    name: 'inline-favicon',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        try {
          const possiblePaths = [
            join(process.cwd(), 'favicon.png'),
            join(process.cwd(), 'public', 'favicon.png'),
          ];
          const faviconPath = possiblePaths.find((p) => existsSync(p));
          if (!faviconPath) {
            console.warn('favicon.png not found, skipping inline');
            return html;
          }

          const faviconBase64 = readFileSync(faviconPath).toString('base64');
          const dataUri = `data:image/png;base64,${faviconBase64}`;
          return html.replace(/href="\/favicon\.png"/g, `href="${dataUri}"`);
        } catch (error) {
          console.warn('Failed to inline favicon:', error);
          return html;
        }
      },
    },
  };
}
