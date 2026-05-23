import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// LexFlow marketing landing. Standalone static build that ships to GitHub
// Pages under https://VforVitorio.github.io/LexFlow/. Completely independent
// from ../frontend (the SPA) — different deps, different bundle, different
// deploy target.
//
// `VITE_BASE_PATH` is set by .github/workflows/deploy-landing.yml so the
// built assets resolve correctly under /LexFlow/. Local dev keeps '/'.
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE_PATH ?? '/',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5174,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    target: 'es2020',
  },
});
