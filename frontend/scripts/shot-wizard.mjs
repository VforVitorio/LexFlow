// Dev-only: open the model wizard and advance to step 2 ("Elige un modelo"),
// then screenshot. node scripts/shot-wizard.mjs <out.png>
import { chromium } from '@playwright/test';

const out = process.argv[2] ?? 'wizard.png';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 } });
const page = await ctx.newPage();
await page.addInitScript(() => {
  // Skip welcome/onboarding/tour but LEAVE the wizard so its gate shows it.
  localStorage.setItem('lexflow.welcomed', 'true');
  localStorage.setItem('lexflow.onboarded', '1');
  localStorage.setItem('lexflow.tutorial-completed', 'true');
});
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
// Step 1 → 2: click the footer "Continuar".
const next = page.getByRole('button', { name: /Continuar|Continue/ }).first();
await next.click({ timeout: 5000 }).catch(() => {});
await page.waitForTimeout(900);
await page.screenshot({ path: out });
await browser.close();
console.log('wizard shot saved:', out);
