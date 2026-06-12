// Dev-only: screenshot the Settings → Modelos "installed models" card (#597).
// node scripts/shot-installed.mjs [out.png]
import { chromium } from '@playwright/test';

const out = process.argv[2] ?? '.shot-installed.png';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1180, height: 900 } });
const page = await ctx.newPage();
await page.addInitScript(() => {
  localStorage.setItem('lexflow.welcomed', 'true');
  localStorage.setItem('lexflow.onboarded', '1');
  localStorage.setItem('lexflow.tutorial-completed', 'true');
  localStorage.setItem('lexflow.wizard-completed', 'true');
});
await page.goto('http://localhost:5173/settings/models', { waitUntil: 'networkidle' });
await page.waitForTimeout(900);
await page.getByText('Modelos instalados').scrollIntoViewIfNeeded();
await page.waitForTimeout(400);
await page.screenshot({ path: out });

await browser.close();
console.log('installed-models shot saved:', out);
