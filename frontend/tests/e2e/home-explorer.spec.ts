/**
 * Golden path #1: Home → Explorer → click row → Law detail (#91).
 *
 * Runs against the mock backend (`VITE_USE_MOCK !== 'false'`), so the
 * mock catalog (mock-data.ts) populates the Explorer table
 * deterministically.
 */

import { test, expect } from './fixtures';

test('Home → Explorer → law detail', async ({ page }) => {
  await page.goto('/home');

  // Welcome gate didn't show because of the seeded localStorage flags;
  // we should land on the home screen content directly.
  await expect(page).toHaveURL(/\/home$/);

  // Jump to Explorer via the left rail (desktop). The rail has
  // `data-tour-id="left-rail"` since #116.
  const rail = page.getByRole('navigation', { name: 'Navegación principal' });
  await rail.getByRole('link', { name: 'Explorador' }).click();
  await expect(page).toHaveURL(/\/explorer$/);

  // Explorer table renders at least one mock law row. The mock catalog
  // ships several rows; we just need ONE clickable.
  const firstRow = page.locator('table tbody tr').first();
  await expect(firstRow).toBeVisible();
  await firstRow.click();

  // Law detail URL pattern: /laws/<BOE-id>.
  await expect(page).toHaveURL(/\/laws\/[A-Z0-9-]+/);
});
