import React from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import './index.css';
import './lib/theme'; // side-effect: sync <html data-theme>
import './i18n'; // side-effect: initialize i18next before render

import { LandingPage } from './LandingPage';

// Single-page marketing landing. No router — every internal link is an
// in-page anchor (`#layers`, `#stack`, ...). React Query is used only by
// `useLatestRelease` to fetch the GitHub release tag.
//
// Hydration-aware mount: when react-snap has pre-rendered the page into
// static HTML (postbuild step), the <div id="root"> already has child
// nodes. In that case we call hydrateRoot so React attaches to the
// existing DOM without discarding it. In dev and in any browser that
// receives an empty shell, createRoot is used as normal.
//
// IMPORTANT — Framer Motion / animation caveat:
// RevealSection uses `whileInView` with `viewport: { once: true }`.
// During hydration Framer Motion will briefly replay the initial state
// (opacity: 0, y: 24) before snapping to the visible state. This is
// cosmetically acceptable for a static marketing page, but if it causes
// a flash reviewers should add `suppressHydrationWarning` to the
// animated element or guard animation start behind
// `typeof window !== "undefined"`. The i18next language-detector also
// runs client-side; SSR will always render the fallback language (es),
// which is fine since crawlers see the Spanish content we want indexed.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 30_000,
      retry: 1,
    },
  },
});

const app = (
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <LandingPage />
    </QueryClientProvider>
  </React.StrictMode>
);

const rootEl = document.getElementById('root')!;

if (rootEl.hasChildNodes()) {
  // Pre-rendered HTML from react-snap is present — hydrate instead of
  // replacing, so React preserves the existing DOM tree.
  hydrateRoot(rootEl, app);
} else {
  // Normal client-only render (dev server, or first deploy without snap).
  createRoot(rootEl).render(app);
}