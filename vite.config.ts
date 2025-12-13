import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { execSync } from 'child_process'

// Get commit hash from environment or git
function getCommitHash(): string {
  // In CI/CD, use environment variable (VITE_ prefix for client-side access)
  if (process.env.VITE_COMMIT_HASH) {
    return process.env.VITE_COMMIT_HASH.substring(0, 7);
  }
  // For local builds, try to get from git
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return 'dev';
  }
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const isSingleFile = mode === 'singlefile'
  const commitHash = getCommitHash();
  const buildTime = new Date().toISOString();
  
  return {
    define: {
      __COMMIT_HASH__: JSON.stringify(commitHash),
      __BUILD_TIME__: JSON.stringify(buildTime),
    },
    plugins: [
      react(),
      // Only use single-file plugin when building for single-file mode
      ...(isSingleFile ? [viteSingleFile()] : []),
    ],
    build: {
      outDir: 'dist',
      sourcemap: false,
      minify: 'esbuild',
      chunkSizeWarningLimit: isSingleFile ? 5000 : 1000,
      rollupOptions: isSingleFile ? undefined : {
        output: {
          manualChunks: (id) => {
            // Split vendor libraries
            if (id.includes('node_modules')) {
              if (id.includes('react') || id.includes('react-dom')) {
                return 'react-vendor';
              }
              if (id.includes('zustand')) {
                return 'zustand';
              }
              if (id.includes('xlsx')) {
                return 'xlsx';
              }
              if (id.includes('@silevis/reactgrid')) {
                return 'reactgrid';
              }
              // Other node_modules go into vendor chunk
              return 'vendor';
            }
            // Split large protocol files
            if (id.includes('protocol/dm32uv/protocol')) {
              return 'protocol';
            }
            if (id.includes('protocol/dm32uv/structures')) {
              return 'structures';
            }
          },
          entryFileNames: 'assets/[name].[hash].js',
          chunkFileNames: 'assets/[name].[hash].js',
          assetFileNames: 'assets/[name].[hash].[ext]',
        },
      },
      // Optimize chunk size
      target: 'esnext',
      cssCodeSplit: true,
      // Reduce bundle size
      reportCompressedSize: true,
      // Improve tree shaking
      modulePreload: {
        polyfill: false,
      },
    },
    // Optimize dependencies
    optimizeDeps: {
      include: ['react', 'react-dom', 'zustand'],
      exclude: ['xlsx'], // Exclude xlsx from pre-bundling (lazy load when needed)
    },
    // Base path for deployment (empty for root)
    base: './',
    // Dev server configuration
    server: {
      // Allow access from all network interfaces (not just localhost)
      host: '0.0.0.0',
      // Port (default is 5173)
      port: 5173,
      // Enable strict port checking
      strictPort: false,
      // Allow any host (useful for ngrok, etc.)
      allowedHosts: true,
    },
  }
})

