/**
 * Post-build prerender for the single-page marketing landing (#689).
 *
 * Renders the built SPA with headless Chromium and writes the resulting HTML
 * back into `dist/` so AI crawlers + Googlebot see real body content instead of
 * an empty `<div id="root">`. A maintained, Vite-8-compatible alternative to
 * react-snap (which drags a 2019 puppeteer/express dependency tree) and to
 * vite-react-ssg (whose stable release does not yet support Vite 8).
 *
 * The client entry (`src/main.tsx`) is hydration-aware: it `hydrateRoot`s over
 * this pre-rendered markup. Locale is forced to es-ES so the indexed content is
 * Spanish (the primary audience), matching the static `<html lang="es">`.
 */
import { preview } from 'vite';
import { chromium } from '@playwright/test';
import { writeFileSync, copyFileSync } from 'node:fs';

// Must match the base the build used (vite.config reads the same env), so the
// preview serves assets at the same paths the built index.html references —
// otherwise assets 404, the JS never boots, and nothing renders. Locally base
// defaults to '/'; CI sets VITE_BASE_PATH=/LexFlow/.
const BASE = process.env.VITE_BASE_PATH ?? '/';
const PORT = 4188;

const server = await preview({ base: BASE, preview: { port: PORT, strictPort: true } });
const browser = await chromium.launch();

try {
  const page = await browser.newPage({ locale: 'es-ES' });
  await page.goto(`http://localhost:${PORT}${BASE}`, { waitUntil: 'networkidle' });
  // Wait until React has rendered into the root. Use `attached`, not the
  // default `visible`: the first section starts at opacity:0 (reveal
  // animation), so a visibility check would time out even though the DOM
  // is present — which is all we need for the static snapshot.
  await page.waitForSelector('#root > *', { state: 'attached', timeout: 20000 });
  await page.waitForTimeout(500);
  const html = '<!doctype html>\n' + (await page.evaluate(() => document.documentElement.outerHTML));
  writeFileSync('dist/index.html', html, 'utf8');
  copyFileSync('dist/index.html', 'dist/404.html');
  console.log(`Prerendered dist/index.html (${html.length} bytes) + dist/404.html`);
} finally {
  await browser.close();
}

// vite preview keeps the event loop alive; exit explicitly once we're done.
process.exit(0);
