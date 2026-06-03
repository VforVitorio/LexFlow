/**
 * Playwright config for golden-path e2e tests (#91).
 *
 * Runs against the production build served by `vite preview` so we
 * exercise the same bundle the user runs — not the dev server with HMR
 * shims. Mock mode is enabled (`VITE_USE_MOCK !== 'false'`) so the suite
 * never talks to FastAPI; that keeps CI lean and deterministic.
 *
 * Browsers: just Chromium today. Adding Firefox/WebKit is a one-line
 * extension to `projects` below; we hold the line at one browser until
 * the test surface earns the extra runtime.
 *
 * --- WHERE TO CHANGE IF X CHANGES ---
 * * Add a test file       → drop a `*.spec.ts` under `tests/e2e/`.
 * * Bump browsers         → extend `projects`.
 * * Touch FastAPI in CI   → extend `webServer` to spawn `uv run python
 *                           main.py` in parallel + set `VITE_USE_MOCK=false`.
 */

import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  // Each spec runs in a fresh page; specs themselves can serialise
  // their own steps.
  fullyParallel: true,
  // Single retry on CI absorbs transient WebKit/Chromium quirks
  // without hiding real flakiness — two retries would mask it.
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    // `preview:ci` pins port 4173 + strictPort so the server fails
    // loudly if something else is squatting it (cleaner than the
    // default reuse-existing-server behaviour).
    command: 'npm run preview:ci',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
