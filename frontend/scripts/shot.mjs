// Dev-only screenshot harness: launch chromium, skip the first-run
// onboarding via localStorage, navigate, and save a PNG the agent can read.
// Usage: node scripts/shot.mjs <url> <out.png> [theme]
import { chromium } from '@playwright/test';

const url = process.argv[2] ?? 'http://localhost:5173/dashboards';
const out = process.argv[3] ?? 'shot.png';
const theme = process.argv[4] ?? 'dark';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
await page.addInitScript((t) => {
  // Skip welcome / onboarding / wizard / tour so the target page renders
  // unobstructed (keys verified against the gate components).
  localStorage.setItem('lexflow.welcomed', 'true');
  localStorage.setItem('lexflow.onboarded', '1');
  localStorage.setItem('lexflow.wizard-completed', 'true');
  localStorage.setItem('lexflow.tutorial-completed', 'true');
  localStorage.setItem('lexflow.theme', t);
}, theme);
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
// Toggle to dark if requested (the theme button lives in the top bar).
if (theme === 'dark') {
  const btn = page.locator('button[aria-label*="tema" i], button[aria-label*="theme" i]').first();
  if (await btn.count()) {
    await btn.click().catch(() => {});
    await page.waitForTimeout(600);
  }
}
await page.waitForTimeout(800);
await page.screenshot({ path: out, fullPage: true });
await browser.close();
console.log('shot saved:', out);
