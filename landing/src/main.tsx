import React from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import './index.css';
import './lib/theme'; // side-effect: sync <html data-theme> (SSR-guarded)
import './i18n'; // side-effect: initialize i18next before render

import { LandingPage } from './LandingPage';

// Single-page marketing landing. No router — every internal link is an in-page
// anchor (`#layers`, `#stack`, ...). React Query is used only by
// `useLatestRelease` to fetch the GitHub release tag.
//
// Hydration-aware mount: the `prerender` build step (scripts/prerender.mjs)
// renders this page with headless Chromium and writes the resulting HTML into
// `dist/index.html`, so crawlers + Googlebot get real body content. On that
// pre-rendered HTML `<div id="root">` already has children, so we `hydrateRoot`
// to attach without discarding the DOM. In dev (and any empty shell) we fall
// back to `createRoot`.
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

// Mark that the client bundle actually booted, which unlocks the scroll-reveal
// animation (index.css gates `.reveal` behind `html.js`). Doing it here — not in
// a blocking <head> script — means a run where the bundle never executes leaves
// the reveal blocks in their visible baseline instead of hidden. The prerender
// strips this class so the shipped static HTML ships visible.
document.documentElement.classList.add('js');

const rootEl = document.getElementById('root')!;

if (rootEl.childElementCount > 0) {
  hydrateRoot(rootEl, app);
} else {
  createRoot(rootEl).render(app);
}
