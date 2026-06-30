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
    sourcemap: false,
    // #739 — modern baseline (top-level await, class fields, etc.) so Vite
    // ships less transpiled/polyfilled output.
    target: 'es2022',
    rollupOptions: {
      output: {
        // #739 — split the stable React runtime out of the app entry so it
        // caches independently across deploys. Function form (not an object)
        // because Vite 8's rolldown bundler only accepts the function shape.
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) {
            return 'react-vendor';
          }
          return 'vendor';
        },
      },
    },
  },
});
