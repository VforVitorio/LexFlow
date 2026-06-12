// Dev-only: screenshot the redesigned semantic-search card (#578) and its
// "¿Qué es esto?" dialog. node scripts/shot-semantic.mjs <card.png> <dialog.png>
import { chromium } from '@playwright/test';

const cardOut = process.argv[2] ?? 'semantic-card.png';
const dialogOut = process.argv[3] ?? 'semantic-dialog.png';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
await page.addInitScript(() => {
  localStorage.setItem('lexflow.welcomed', 'true');
  localStorage.setItem('lexflow.onboarded', '1');
  localStorage.setItem('lexflow.tutorial-completed', 'true');
  localStorage.setItem('lexflow.wizard-completed', 'true');
});
await page.goto('http://localhost:5173/settings/models', { waitUntil: 'networkidle' });
await page.waitForTimeout(1000);
await page.screenshot({ path: cardOut });

const explain = page.getByRole('button', { name: /¿Qué es esto\?|What's this\?/ });
await explain.click({ timeout: 5000 }).catch(() => {});
await page.waitForTimeout(600);
await page.screenshot({ path: dialogOut });

await browser.close();
console.log('semantic shots saved:', cardOut, dialogOut);
