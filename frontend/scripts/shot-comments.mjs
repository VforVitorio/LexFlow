// Dev-only: verify inline comments (#602). Selects text, comments it, writes a
// note, screenshots the highlight + panel, then resolves it.
// Usage: node scripts/shot-comments.mjs [theme]
import { chromium } from '@playwright/test';

const theme = process.argv[2] ?? 'light';
const OUT_ACTIVE = '/tmp/cmt-active.png';
const OUT_RESOLVED = '/tmp/cmt-resolved.png';

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
await page.keyboard.type('El responsable del tratamiento adoptará medidas de seguridad adecuadas.');
await page.keyboard.press('Control+A');

// Comment the selection.
await page.locator('button[aria-label="Comentar la selección"]').click();
await page.locator('aside[aria-label="Comentarios del documento"]').waitFor({ state: 'visible' });
await page.waitForTimeout(300);
const note = page.locator('aside[aria-label="Comentarios del documento"] textarea').first();
await note.fill('Revisar esta cláusula con el DPO antes de publicar.');
await page.waitForTimeout(300);
await page.screenshot({ path: OUT_ACTIVE });
console.log('active shot saved; comment marks =', await pm.locator('[data-comment-id]').count());

// Resolve it.
await page.locator('aside[aria-label="Comentarios del documento"] button:has-text("Resolver")').first().click();
await page.waitForTimeout(400);
await page.screenshot({ path: OUT_RESOLVED });
console.log('resolved shot saved; resolved marks =', await pm.locator('[data-comment-id][data-resolved="true"]').count());

await browser.close();
