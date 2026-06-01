/**
 * Vitest configuration (issue #90).
 *
 * Kept separate from `vite.config.ts` so the dev/build pipeline doesn't
 * carry test-runner config and vice-versa. The same `@/` path alias is
 * mirrored here so tests can import from `@/lib/...` like the app does.
 */

import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    // Loaded before every test file. Wires @testing-library/jest-dom matchers
    // so assertions like `toBeInTheDocument` are available without per-file
    // imports.
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    css: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // Coverage targets — pure functions + small components. Pages,
      // routing and store side-effects are exercised by Playwright (#91).
      include: [
        'src/lib/**/*.{ts,tsx}',
        'src/components/domain/**/*.{ts,tsx}',
      ],
      exclude: [
        'src/lib/**/*.test.{ts,tsx}',
        'src/lib/**/*.spec.{ts,tsx}',
        'src/lib/api.mock.ts',
        'src/lib/mock-data.ts',
        'src/lib/types.ts',
      ],
    },
  },
});
