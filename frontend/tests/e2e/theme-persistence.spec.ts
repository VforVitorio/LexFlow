/**
 * Golden path #3: Settings → Apariencia → theme toggle → persist on reload (#91).
 *
 * Verifies that the theme choice survives a hard reload — a regression
 * here would mean Zustand's `persist` middleware broke or the
 * `lib/store` `subscribe`-to-html-attribute side effect stopped firing.
 */

import { test, expect } from './fixtures';

test('Settings → theme toggle persists after reload', async ({ page }) => {
  await page.goto('/settings');

  // Click the "Apariencia" section in the sidebar.
  await page.getByRole('button', { name: 'Apariencia' }).click();
  await expect(page.getByRole('heading', { name: 'Apariencia' })).toBeVisible();

  // The theme picker exposes two big buttons ("Claro" / "Oscuro").
  // Detect current theme from <html data-theme="..."> and flip to the
  // opposite. Default theme is light per the project's persisted
  // store default, but we don't hard-code that — we just verify the
  // flip survives reload.
  const html = page.locator('html');
  const before = await html.getAttribute('data-theme');
  const targetButton = before === 'dark' ? /^Claro$/ : /^Oscuro$/;
  const expectedAfter = before === 'dark' ? 'light' : 'dark';

  await page.getByRole('button', { name: targetButton }).click();
  await expect(html).toHaveAttribute('data-theme', expectedAfter);

  // Reload — the theme must come back as the chosen one.
  await page.reload();
  await expect(html).toHaveAttribute('data-theme', expectedAfter);
});
