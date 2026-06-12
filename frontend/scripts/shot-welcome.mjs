// Dev-only: capture the first-run welcome stroke-draw (#617) at several
// frames so the progressive draw can be eyeballed.
// node scripts/shot-welcome.mjs
import { chromium } from '@playwright/test';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1100, height: 760 } });
const page = await ctx.newPage();
// Fresh storage: do NOT set lexflow.welcomed, so the welcome actually runs.
// networkidle so the lazy WelcomeAnimation chunk + font are loaded before
// we start sampling frames (CodeRabbit #628).
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
// Wait for the splash/warmup to hand off to the welcome.
await page.waitForTimeout(2500);
await page.screenshot({ path: '.shot-welcome-1.png' });
await page.waitForTimeout(1200);
await page.screenshot({ path: '.shot-welcome-2.png' });
await page.waitForTimeout(1400);
await page.screenshot({ path: '.shot-welcome-3.png' });

await browser.close();
console.log('welcome shots saved');
