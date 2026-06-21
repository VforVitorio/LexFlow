// Dev-only: verify the typed-legal-citation flow (#599). Opens /editor, types
// text, inserts a law citation + an article citation via the picker, screenshots
// the chips, then clicks a chip to confirm it navigates to the law.
// Usage: node scripts/shot-citation.mjs <out.png> [theme]
import { chromium } from '@playwright/test';

const out = process.argv[2] ?? 'shot-citation.png';
const theme = process.argv[3] ?? 'light';

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

await page.goto('http://localhost:5173/editor', { waitUntil: 'networkidle' });
await page.waitForTimeout(1000);

if (theme === 'dark') {
  const btn = page.locator('button[aria-label*="tema" i], button[aria-label*="theme" i]').first();
  if (await btn.count()) {
    await btn.click().catch(() => {});
    await page.waitForTimeout(500);
  }
}

async function insertCitation(query, shotOpen) {
  await page.locator('button[aria-label="Insertar cita legal"]').click();
  const input = page.locator('input[placeholder*="citar" i]');
  await input.waitFor({ state: 'visible' });
  await input.fill(query);
  await page.locator('[role="option"]').first().waitFor({ state: 'visible', timeout: 5000 });
  if (shotOpen) {
    await page.waitForTimeout(300);
    await page.screenshot({ path: shotOpen });
    console.log('open-picker shot saved:', shotOpen);
  }
  await page.locator('[role="option"]').first().click();
  await page.waitForTimeout(400);
}

// Type some document context, then weave in two citations.
const pm = page.locator('.ProseMirror');
await pm.click();
await page.keyboard.type('Como recoge la ');
await insertCitation('constitu', process.argv[4]);
await page.keyboard.type('en su ');
await insertCitation('igualdad');
await page.keyboard.type(', el principio de no discriminación es un derecho fundamental.');
await page.waitForTimeout(500);

const chipCount = await page.locator('button[data-legal-citation]').count();
console.log('citations inserted:', chipCount);

await page.screenshot({ path: out, fullPage: true });
console.log('shot saved:', out);

// Navigation check: clicking a chip should route to /laws/:lawId.
await page.locator('button[data-legal-citation]').first().click();
await page.waitForTimeout(800);
console.log('after chip click, url =', page.url());

await browser.close();
