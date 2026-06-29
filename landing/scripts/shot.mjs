/**
 * Dev-only landing screenshot harness (not part of the build).
 *
 * Usage:  node scripts/shot.mjs [baseUrl] [outDir] [theme]
 *   node scripts/shot.mjs                       # localhost:5174, ./shots, both themes
 *   node scripts/shot.mjs http://localhost:5174 ./shots dark
 *
 * Captures the full landing page (light + dark), a nav crop, and the mobile
 * nav menu (closed + open) so motion/a11y changes can be eyeballed without a
 * backend (the landing is fully static — no mock mode needed).
 */
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const BASE = process.argv[2] ?? 'http://localhost:5174/';
const OUT = process.argv[3] ?? './shots';
const ONLY = process.argv[4]; // optional single theme
const THEMES = ONLY ? [ONLY] : ['light', 'dark'];
const THEME_KEY = 'lexflow.landing.theme'; // zustand-persist blob, not a raw value

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();

// Sections fade in via IntersectionObserver (RevealSection). A fullPage shot
// alone never scrolls, so everything below the fold stays at opacity 0 — walk
// the page in steps to trip every observer, then return to the top.
async function revealAll(page) {
  await page.evaluate(async () => {
    const step = Math.round(window.innerHeight * 0.8);
    for (let y = 0; y <= document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 120));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(400);
}

for (const theme of THEMES) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.addInitScript(([k, t]) => {
    try { localStorage.setItem(k, JSON.stringify({ state: { theme: t }, version: 0 })); } catch {}
  }, [THEME_KEY, theme]);
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await revealAll(page);
  await page.screenshot({ path: `${OUT}/desktop-${theme}.png`, fullPage: true });
  const nav = await page.$('header.nav');
  if (nav) await nav.screenshot({ path: `${OUT}/nav-${theme}.png` });
  // Crop the features section (holds the SPA preview cards) for a closer look.
  for (const id of ['layers', 'faq', 'downloads']) {
    const el = await page.$(`#${id}`);
    if (el) await el.screenshot({ path: `${OUT}/${id}-${theme}.png` });
  }
  await ctx.close();
}

// Reduced-motion content check: reveals show immediately, animations are off.
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.addInitScript(([k]) => {
    try { localStorage.setItem(k, JSON.stringify({ state: { theme: 'dark' }, version: 0 })); } catch {}
  }, [THEME_KEY]);
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await revealAll(page);
  await page.screenshot({ path: `${OUT}/desktop-reduced-motion.png`, fullPage: true });
  await ctx.close();
}

{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const page = await ctx.newPage();
  await page.addInitScript((k) => {
    try { localStorage.setItem(k, JSON.stringify({ state: { theme: 'dark' }, version: 0 })); } catch {}
  }, THEME_KEY);
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/mobile-closed.png` });
  const burger = await page.$('.nav-burger');
  if (burger) {
    await burger.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/mobile-open.png` });
  } else {
    console.log('WARN: .nav-burger not found');
  }
  await ctx.close();
}

await browser.close();
console.log('shots written to', OUT);
