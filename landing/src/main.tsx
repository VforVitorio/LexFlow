import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import './index.css';
import './lib/theme'; // side-effect: sync <html data-theme>
import './i18n'; // side-effect: initialize i18next before render
import { LandingPage } from './LandingPage';

// Single-page marketing landing. No router — every internal link is an
// in-page anchor (`#layers`, `#stack`, ...). React Query is used only by
// `useLatestRelease` to fetch the GitHub release tag.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 30_000,
      retry: 1,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <LandingPage />
    </QueryClientProvider>
  </React.StrictMode>,
);
