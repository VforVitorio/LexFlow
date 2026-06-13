/**
 * Shared Playwright fixtures for the LexFlow e2e suite (#91).
 *
 * Every spec extends `test` from here instead of from `@playwright/test`
 * directly. The custom fixture seeds `localStorage` BEFORE the app
 * mounts so the welcome / wizard / tutorial gates never show — the
 * tests then exercise the real navigation surface, not the onboarding.
 *
 * Bootstrap keys mirror the constants from
 * `src/components/domain/{WelcomeFlow,ModelWizard,TutorialTour}.tsx`.
 * Keep in sync if those modules rename their flags.
 */

import { test as base, expect } from '@playwright/test';

/**
 * Drop the SPA's onboarding gates so every test lands on `/home`
 * without needing to click through the welcome flow. Set via an
 * `addInitScript` so the values are written BEFORE React mounts.
 */
async function seedOnboardingFlags(context: import('@playwright/test').BrowserContext) {
  await context.addInitScript(() => {
    try {
      localStorage.setItem('lexflow.welcomed', 'true');
      localStorage.setItem('lexflow.onboarded', '1');
      localStorage.setItem('lexflow.wizard-completed', 'true');
      localStorage.setItem('lexflow.tutorial-completed', 'true');
    } catch {
      /* private mode — tests will fail anyway. */
    }
  });
}

export const test = base.extend({
  context: async ({ context }, use) => {
    await seedOnboardingFlags(context);
    await use(context);
  },
});

export { expect };
