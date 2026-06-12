// Dev-only: verify the right-panel drag-resize (#594) on the graph page.
// node scripts/shot-rightrail.mjs <before.png> <after.png>
import { chromium } from '@playwright/test';

// Defaults use the `.shot-` prefix so they're covered by the single
// `.shot-*.png` .gitignore rule and never get committed accidentally.
const beforeOut = process.argv[2] ?? '.shot-panel-before.png';
const afterOut = process.argv[3] ?? '.shot-panel-after.png';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 820 } });
const page = await ctx.newPage();
await page.addInitScript(() => {
  localStorage.setItem('lexflow.welcomed', 'true');
  localStorage.setItem('lexflow.onboarded', '1');
  localStorage.setItem('lexflow.tutorial-completed', 'true');
  localStorage.setItem('lexflow.wizard-completed', 'true');
});
await page.goto('http://localhost:5173/graph', { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
await page.screenshot({ path: beforeOut });

const handle = page.getByRole('separator', { name: /Ajustar ancho del panel|Resize panel/ });
const box = await handle.boundingBox();
if (!box) throw new Error('right panel separator not found');
const startX = box.x + box.width / 2;
const y = box.y + box.height / 2;
await page.mouse.move(startX, y);
await page.mouse.down();
await page.mouse.move(startX - 90, y, { steps: 6 });
await page.mouse.move(startX - 170, y, { steps: 6 });
await page.mouse.up();
await page.waitForTimeout(400);
await page.screenshot({ path: afterOut });

await browser.close();
console.log('panel shots saved:', beforeOut, afterOut);
