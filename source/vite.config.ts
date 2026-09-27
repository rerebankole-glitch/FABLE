import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  // relative base: the bundle deploys to GitHub Pages under /FABLE/ and to the repo root alike
  base: './',
  // classic (IIFE) worker: module workers from blob: URLs are refused when the build is opened via file://
  worker: { format: 'iife' },
  // split build: index.html + cached ./assets/*.js/css/woff2 (the old single-file build re-downloaded
  // ~1.3 MB on every deploy; now the browser caches each asset between releases)
  build: { target: 'es2022', chunkSizeWarningLimit: 4000, cssCodeSplit: false },
  server: { host: '0.0.0.0', port: 5173, allowedHosts: true },
  preview: { host: '0.0.0.0', port: 4173, allowedHosts: true },
});
