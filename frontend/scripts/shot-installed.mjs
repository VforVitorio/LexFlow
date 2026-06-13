// Dev-only: screenshot the Settings → Modelos "installed models" card (#597).
// node scripts/shot-installed.mjs [out.png]
import { chromium } from '@playwright/test';

const out = process.argv[2] ?? '.shot-installed.png';
const browser = await chromium.launch();
// Always close the browser, even if navigation / lookup / screenshot throws —
// otherwise a failed run leaks the Chromium process (CodeRabbit #629).
try {
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
  console.log('installed-models shot saved:', out);
} finally {
  await browser.close();
}
