/**
 * Vitest setup — runs once before each test file.
 *
 * * Imports `@testing-library/jest-dom` so matchers like
 *   `toBeInTheDocument` / `toHaveAttribute` are available globally.
 * * `afterEach(cleanup)` is wired by `@testing-library/react` v16+
 *   automatically when the `vitest` globals option is on (we set it
 *   in `vitest.config.ts`).
 */

import '@testing-library/jest-dom/vitest';
