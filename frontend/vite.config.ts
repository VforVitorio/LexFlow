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
    // #712 perf — split stable third-party deps into their own chunks so the
    // browser can cache them across app-code deploys (and they stay out of the
    // per-route chunks). App code splits per-route via React.lazy in App.tsx.
    rollupOptions: {
      output: {
        // rolldown-vite requires the function form (object form is rollup-only).
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (/[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/.test(id)) {
            return 'vendor-react';
          }
          if (/[\\/]node_modules[\\/](@tanstack[\\/]react-query|zustand)[\\/]/.test(id)) {
            return 'vendor-state';
          }
          return undefined;
        },
      },
    },
  },
});
