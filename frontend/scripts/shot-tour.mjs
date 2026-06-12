// Dev-only: capture the guided tour spotlight + acrylic popover (#575).
// Advances to step 2 (left-rail) so the spotlight cut-out is visible.
// node scripts/shot-tour.mjs [out.png]
import { chromium } from '@playwright/test';

const out = process.argv[2] ?? '.shot-tour.png';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 820 } });
const page = await ctx.newPage();
await page.addInitScript(() => {
  // Welcome + wizard done, but NOT the tutorial → the auto-launcher opens it.
  localStorage.setItem('lexflow.welcomed', 'true');
  localStorage.setItem('lexflow.onboarded', '1');
  localStorage.setItem('lexflow.wizard-completed', 'true');
});
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
// Wait for the auto-launch (350ms) + open animation.
await page.waitForTimeout(1600);
await page.screenshot({ path: out.replace('.png', '-step1.png') });
// Advance to step 2 (left-rail spotlight).
await page.getByRole('button', { name: 'Siguiente' }).click({ timeout: 5000 });
await page.waitForTimeout(700);
await page.screenshot({ path: out });

await browser.close();
console.log('tour shots saved:', out);
