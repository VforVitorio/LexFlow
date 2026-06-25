// Dev-only: verify AI-assisted drafting (#601). Opens the assistant, generates
// a (mock) grounded draft, and inserts it with its sources as typed citations.
// Requires a mock model temporarily flipped to available:true. Usage:
//   node scripts/shot-ai.mjs [theme]
import { chromium } from '@playwright/test';

const theme = process.argv[2] ?? 'light';
const OUT_PANEL = '/tmp/ai-panel.png';
const OUT_RESULT = '/tmp/ai-result.png';
const OUT_DRAFT = '/tmp/ai-draft.png';

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
  if (await btn.count()) { await btn.click().catch(() => {}); await page.waitForTimeout(400); }
}

const pm = page.locator('.ProseMirror');
await pm.click();
await page.keyboard.type('Texto de partida que el borrador sustituirá.');
await page.keyboard.press('Control+A');

// Open the assistant.
await page.locator('button[aria-label="Asistente de redacción IA"]').click();
await page.locator('aside[aria-label="Asistente de redacción"]').waitFor({ state: 'visible' });
await page.waitForTimeout(400);
await page.screenshot({ path: OUT_PANEL });
console.log('panel shot saved');

// Generate from a free-text instruction (mock streams a grounded reply + source).
await page.locator('textarea[placeholder*="cláusula" i]').fill('Redacta una cláusula de protección de datos.');
await page.locator('button:has-text("Generar")').click();
await page.locator('button:has-text("Insertar con")').waitFor({ state: 'visible', timeout: 12000 });
await page.waitForTimeout(300);
await page.screenshot({ path: OUT_RESULT });
console.log('result shot saved');

// Insert the draft with its sources as typed citations.
await page.locator('button:has-text("Insertar con")').click();
await page.waitForTimeout(500);
await page.screenshot({ path: OUT_DRAFT });
console.log('draft shot saved; editor text =', (await pm.innerText()).slice(0, 200));

await browser.close();
