// Dev-only: verify the left-rail drag-resize (#594). Screenshots the rail
// at its default width, then drags the separator right and screenshots again.
// node scripts/shot-resize.mjs <before.png> <after.png>
import { chromium } from '@playwright/test';

const beforeOut = process.argv[2] ?? 'rail-before.png';
const afterOut = process.argv[3] ?? 'rail-after.png';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 820 } });
const page = await ctx.newPage();
await page.addInitScript(() => {
  localStorage.setItem('lexflow.welcomed', 'true');
  localStorage.setItem('lexflow.onboarded', '1');
  localStorage.setItem('lexflow.tutorial-completed', 'true');
  localStorage.setItem('lexflow.wizard-completed', 'true');
});
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
await page.screenshot({ path: beforeOut });

// Grab the resize separator and drag it +130px to the right.
const handle = page.getByRole('separator', { name: /Ajustar ancho|Resize sidebar/ });
const box = await handle.boundingBox();
if (!box) throw new Error('resize separator not found');
const startX = box.x + box.width / 2;
const y = box.y + box.height / 2;
await page.mouse.move(startX, y);
await page.mouse.down();
await page.mouse.move(startX + 65, y, { steps: 6 });
await page.mouse.move(startX + 130, y, { steps: 6 });
await page.mouse.up();
await page.waitForTimeout(400);
await page.screenshot({ path: afterOut });

await browser.close();
console.log('rail shots saved:', beforeOut, afterOut);
