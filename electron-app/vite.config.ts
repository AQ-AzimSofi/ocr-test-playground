import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        // Main process entry point
        entry: 'src/main/index.ts',
        onstart(options) {
          options.startup();
        },
        vite: {
          build: {
            outDir: 'dist-electron/main',
            target: 'es2022',
            rollupOptions: {
              output: {
                format: 'cjs'
              },
              external: [
                // Electron
                'electron',
                // Node.js built-in modules
                'crypto',
                'fs',
                'path',
                'http',
                'https',
                'stream',
                'zlib',
                'util',
                'url',
                'net',
                'tls',
                'os',
                'events',
                'buffer',
                'querystring',
                'dns',
                'child_process',
                // Node.js built-in modules with node: prefix (ESM standard)
                'node:crypto',
                'node:fs',
                'node:path',
                'node:http',
                'node:https',
                'node:stream',
                'node:zlib',
                'node:util',
                'node:url',
                'node:net',
                'node:tls',
                'node:os',
                'node:events',
                'node:buffer',
                'node:querystring',
                'node:dns',
                'node:child_process',
                // Azure SDK packages (keep in node_modules, don't bundle)
                /^@azure\/.*/,
                /^@typespec\/.*/, // Azure SDK dependency that uses crypto
                // Google Cloud SDK packages (keep in node_modules, don't bundle)
                /^@google-cloud\/.*/,
                /^@google\/.*/,
                // Native modules with .node bindings (keep external for dynamic loading)
                'sharp',
                /^@img\/.*/ // Sharp's platform-specific native packages
              ]
            }
          }
        }
      },
      {
        // Preload script (CommonJS required for sandboxed Electron preload)
        entry: 'src/main/preload.ts',
        vite: {
          build: {
            outDir: 'dist-electron/preload',
            target: 'es2020',
            rollupOptions: {
              output: {
                format: 'cjs',
                entryFileNames: '[name].js',
                inlineDynamicImports: true
              }
            }
          }
        }
      }
    ])
  ],
  resolve: {
    alias: {
      '@main': path.resolve(__dirname, './src/main'),
      '@renderer': path.resolve(__dirname, './src/renderer'),
      '@shared': path.resolve(__dirname, './src/shared')
    }
  },
  server: {
    port: 5174
  },
  build: {
    outDir: 'dist',
    target: 'es2022'
  }
});
