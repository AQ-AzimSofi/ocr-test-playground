import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron';
import path from 'path';
import fs from 'fs';

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
                format: 'es',
                entryFileNames: '[name].mjs',
                chunkFileNames: '[name]-[hash].mjs'
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
                /^@img\/.*/, // Sharp's platform-specific native packages
                // PDF processing libraries (use dynamic requires, must stay external)
                'pdf-parse',
                'pdf2pic',
                'pdf2img-electron', // Electron-specific PDF to image converter
                'unpdf' // Modern PDF parser for page counting
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
                entryFileNames: '[name].cjs',
                inlineDynamicImports: true,
                // Fix ES export syntax to proper CommonJS
                plugins: [{
                  name: 'cjs-export-fix',
                  renderChunk(code) {
                    return code.replace(/^export default /m, 'module.exports = ');
                  }
                }]
              }
            }
          }
        }
      }
    ]),
    // Custom plugin to copy locale files to dist-electron for production builds
    {
      name: 'copy-locales',
      closeBundle() {
        const srcLocales = path.resolve(__dirname, 'src/locales');
        const destLocales = path.resolve(__dirname, 'dist-electron/locales');

        // Only copy in production builds
        if (process.env.NODE_ENV === 'production') {
          console.log('Copying locale files to dist-electron/locales...');

          // Create destination directory if it doesn't exist
          if (!fs.existsSync(destLocales)) {
            fs.mkdirSync(destLocales, { recursive: true });
          }

          // Copy locale directories
          const languages = fs.readdirSync(srcLocales);
          for (const lang of languages) {
            const srcLangPath = path.join(srcLocales, lang);
            const destLangPath = path.join(destLocales, lang);

            if (fs.statSync(srcLangPath).isDirectory()) {
              // Create language directory
              if (!fs.existsSync(destLangPath)) {
                fs.mkdirSync(destLangPath, { recursive: true });
              }

              // Copy all JSON files
              const files = fs.readdirSync(srcLangPath);
              for (const file of files) {
                if (file.endsWith('.json')) {
                  fs.copyFileSync(
                    path.join(srcLangPath, file),
                    path.join(destLangPath, file)
                  );
                }
              }
            }
          }

          console.log('Locale files copied successfully!');
        }
      }
    }
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
