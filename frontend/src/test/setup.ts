/**
 * Vitest setup — runs once before each test file.
 *
 * * Imports `@testing-library/jest-dom` so matchers like
 *   `toBeInTheDocument` / `toHaveAttribute` are available globally.
 * * Initialises i18n and pins the language to `es` so component tests
 *   that render translated chrome assert against the Spanish strings
 *   deterministically (the browser language detector would otherwise
 *   pick jsdom's `en-US`).
 * * `afterEach(cleanup)` is wired by `@testing-library/react` v16+
 *   automatically when the `vitest` globals option is on (we set it
 *   in `vitest.config.ts`).
 */

import '@testing-library/jest-dom/vitest';

import i18n from '../i18n';

void i18n.changeLanguage('es');
