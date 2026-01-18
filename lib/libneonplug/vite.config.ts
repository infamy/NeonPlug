import { defineConfig } from 'vite';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'NeonPlug',
      fileName: 'libneonplug',
      formats: ['es']
    },
    rollupOptions: {
      external: [], // Bundle everything (no external deps)
      output: {
        // Bundle all imports from ../../src/ into output
      }
    },
    outDir: 'dist',
    sourcemap: true,
    commonjsOptions: {
      include: [/node_modules/]
    }
  },
  resolve: {
    alias: [
      // Resolve relative imports from lib/libneonplug/src to workspace root
      {
        find: /^\.\.\/\.\.\/src\/(.*)$/,
        replacement: resolve(__dirname, '../../src/$1')
      }
    ]
  },
  // Ensure we can resolve TypeScript files
  optimizeDeps: {
    exclude: []
  }
});
