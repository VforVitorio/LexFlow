// Dev-only: verify the template system (#600). Types a template body with
// {{variables}}, saves it, then applies it — filling {{law.title}} from a corpus
// law pick and {{autor}} from free text — and screenshots each step.
// Usage: node scripts/shot-templates.mjs [theme]
import { chromium } from '@playwright/test';

const theme = process.argv[2] ?? 'light';
const OUT_LIST = '/tmp/tpl-list.png';
const OUT_FILL = '/tmp/tpl-fill.png';
const OUT_DRAFT = '/tmp/tpl-draft.png';

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
await page.keyboard.type('Conforme a {{law.title}}, el {{autor}} declara lo siguiente.');
await page.waitForTimeout(300);

// Save the current document as a template.
await page.locator('button[aria-label="Plantillas"]').click();
await page.locator('input[placeholder*="Guardar documento" i]').fill('Escrito tipo');
await page.locator('button:has-text("Guardar")').click();
await page.waitForTimeout(400);
await page.screenshot({ path: OUT_LIST });
console.log('list shot saved');

// Clear the editor so the applied draft is clean, then reopen + apply.
await page.keyboard.press('Escape');
await pm.click();
await page.keyboard.press('Control+A');
await page.keyboard.press('Delete');
await page.waitForTimeout(200);
await page.locator('button[aria-label="Plantillas"]').click();
await page.locator('button:has-text("Aplicar")').first().click();
await page.waitForTimeout(300);

// Fill {{law.title}} from a corpus law pick.
await page.locator('input[placeholder*="Buscar la ley" i]').fill('constitu');
await page.waitForTimeout(600);
await page.locator('button:has-text("Constituci")').first().click();
await page.waitForTimeout(700);
// Fill {{autor}} from free text.
await page.locator('input[placeholder*="autor" i]').fill('demandante');
await page.waitForTimeout(200);
await page.screenshot({ path: OUT_FILL });
console.log('fill shot saved');

// Apply → insert the filled draft.
await page.locator('button:has-text("Aplicar plantilla")').click();
await page.waitForTimeout(500);
await page.screenshot({ path: OUT_DRAFT });
console.log('draft shot saved; editor text =', (await pm.innerText()).slice(0, 160));

await browser.close();
