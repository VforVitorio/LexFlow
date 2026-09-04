// Dev-only: screenshot app-update notice states (#698). node scripts/shot-update.mjs
import { chromium } from '@playwright/test';

const availableOut = process.argv[2] ?? '.shot-update-available.png';
const downloadingOut = process.argv[3] ?? '.shot-update-downloading.png';
const readyOut = process.argv[4] ?? '.shot-update-ready.png';
const errorOut = process.argv[5] ?? '.shot-update-error.png';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
await page.addInitScript(() => {
  localStorage.setItem('lexflow.welcomed', 'true');
  localStorage.setItem('lexflow.onboarded', '1');
  localStorage.setItem('lexflow.tutorial-completed', 'true');
  localStorage.setItem('lexflow.wizard-completed', 'true');
  localStorage.setItem('lexflow.appUpdate.lastCheckAt', '0');
});
await page.goto('http://localhost:5173/home', { waitUntil: 'networkidle' });
await page.waitForTimeout(800);

await page.evaluate(() => window.__lexflowDev?.simulateAppUpdate?.('available'));
await page.waitForSelector('[role="dialog"]', { timeout: 8000 });
await page.waitForTimeout(400);
await page.screenshot({ path: availableOut });

const updateBtn = page.getByRole('button', { name: /actualizar ahora|update now/i });
await updateBtn.click({ timeout: 5000 });
await page.waitForTimeout(200);
await page.screenshot({ path: downloadingOut });

await page.waitForSelector('text=/descarga completada|download complete/i', { timeout: 15000 });
await page.waitForTimeout(400);
await page.screenshot({ path: readyOut });

await page.goto('http://localhost:5173/home', { waitUntil: 'networkidle' });
await page.evaluate(() => {
  localStorage.setItem('lexflow.appUpdate.lastCheckAt', '0');
});
await page.waitForTimeout(800);
await page.evaluate(() => window.__lexflowDev?.simulateAppUpdate?.('error-download'));
await page.waitForSelector('[role="dialog"]', { timeout: 8000 });
await page.getByRole('button', { name: /actualizar ahora|update now/i }).click();
await page.waitForSelector('text=/no se pudo|could not complete/i', { timeout: 15000 });
await page.waitForTimeout(400);
await page.screenshot({ path: errorOut });

await browser.close();
console.log('update shots saved:', availableOut, downloadingOut, readyOut, errorOut);
