// Dev-only: verify a11y #714 surfaces — command palette (P0 focus trap),
// the new ConfirmDialog (replaces window.confirm), and inline thread rename.
// Usage: node scripts/shot-a11y-714.mjs [theme] [outDir]
import { chromium } from '@playwright/test';

const theme = process.argv[2] ?? 'light';
const outDir = process.argv[3] ?? '.';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
await page.addInitScript((t) => {
  localStorage.setItem('lexflow.welcomed', 'true');
  localStorage.setItem('lexflow.onboarded', '1');
  localStorage.setItem('lexflow.wizard-completed', 'true');
  localStorage.setItem('lexflow.tutorial-completed', 'true');
  localStorage.setItem('lexflow.theme', t);
}, theme);

// 1) Command palette (P0 focus-trap surface).
await page.goto('http://localhost:5173/chat', { waitUntil: 'networkidle' });
await page.waitForTimeout(900);
await page.keyboard.press('Control+k');
await page.waitForTimeout(400);
await page.locator('[role="dialog"][aria-label="Paleta de comandos"]').waitFor({ state: 'visible' });
await page.keyboard.type('art');
await page.waitForTimeout(500);
await page.screenshot({ path: `${outDir}/a11y-palette.png` });
console.log('palette shot saved');
await page.keyboard.press('Escape');
await page.waitForTimeout(300);

// 2) ConfirmDialog from a thread delete.
const del = page.locator('button[aria-label^="Eliminar"]').first();
await del.click({ force: true });
await page.locator('[role="alertdialog"]').waitFor({ state: 'visible' });
await page.waitForTimeout(300);
await page.screenshot({ path: `${outDir}/a11y-confirm.png` });
console.log('confirm shot saved; active element =', await page.evaluate(() => document.activeElement?.textContent));
await page.keyboard.press('Escape');
await page.waitForTimeout(300);

// 3) Inline rename.
const rename = page.locator('button[aria-label^="Renombrar"]').first();
await rename.click({ force: true });
await page.waitForTimeout(300);
await page.screenshot({ path: `${outDir}/a11y-rename.png` });
console.log('rename shot saved; input focused =', await page.evaluate(() => document.activeElement?.tagName));

await browser.close();
