import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // GitHub Pages serves the site under /LexFlow/. CI sets VITE_BASE_PATH
  // before building; local dev keeps the default '/' so the proxy still works.
  base: process.env.VITE_BASE_PATH ?? '/',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    // FastAPI dev proxy. Set VITE_API_URL in .env to bypass and call directly.
    proxy: {
      '/api': {
        target: process.env.VITE_API_URL || 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    // No sourcemaps in the build: dist/ is destined for the desktop package
    // (#397), where the ~3.7 MB of .map files are dead weight (#555). Dev
    // debugging uses the dev server's own maps, not this build. Flip to true
    // (or gate on an env var) if a web-hosted, debuggable SPA build is ever
    // needed.
    sourcemap: false,
    target: 'es2020',
  },
});
