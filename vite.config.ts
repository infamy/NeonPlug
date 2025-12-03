import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const isSingleFile = mode === 'singlefile'
  
  return {
    plugins: [
      react(),
      // Only use single-file plugin when building for single-file mode
      ...(isSingleFile ? [viteSingleFile()] : []),
    ],
    build: {
      // Output to dist folder
      outDir: 'dist',
      // Generate source maps for debugging (set to false for smaller build)
      sourcemap: false,
      // Minify for production
      minify: 'esbuild',
      // Chunk size warning limit (in kbs)
      chunkSizeWarningLimit: isSingleFile ? 5000 : 1000, // Higher limit for single file
      // Rollup options for better bundling
      rollupOptions: isSingleFile ? undefined : {
        output: {
          // Manual chunk splitting for better caching (only for multi-file build)
          manualChunks: {
            'react-vendor': ['react', 'react-dom'],
            'zustand': ['zustand'],
          },
          // Ensure consistent file names
          entryFileNames: 'assets/[name].[hash].js',
          chunkFileNames: 'assets/[name].[hash].js',
          assetFileNames: 'assets/[name].[hash].[ext]',
        },
      },
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

