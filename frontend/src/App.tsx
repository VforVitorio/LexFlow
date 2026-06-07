import { Suspense, lazy, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AppShell } from '@/components/shell/AppShell';
import { HomePage } from '@/pages/HomePage';
import { ExplorerPage } from '@/pages/ExplorerPage';
import { LawDetailPage } from '@/pages/LawDetailPage';
import { SearchResultsPage } from '@/pages/SearchResultsPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { Skeleton } from '@/components/domain/Skeleton';
import { usePageViewTelemetry } from '@/lib/telemetry';

const ONBOARDED_STORAGE_KEY = 'lexflow.onboarded';

/**
 * Audit #471 — first-launch gate. The OnboardingPage was registered on
 * the router but unreachable: nothing redirected to it on a fresh
 * install. We now check ``localStorage[ONBOARDED_STORAGE_KEY]`` on
 * every navigation and push the user to ``/onboarding`` until they
 * complete it (which writes the flag in ``OnboardingPage.finish()``).
 * Subsequent loads short-circuit because the flag is set.
 */
function useFirstLaunchGate(): void {
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    if (location.pathname === '/onboarding') return;
    let done = false;
    try {
      done = localStorage.getItem(ONBOARDED_STORAGE_KEY) === '1';
    } catch {
      // Private-mode browsers may throw on localStorage access. Treat
      // that as "already onboarded" so we don't trap the user in a
      // redirect loop they can't escape.
      done = true;
    }
    if (!done) navigate('/onboarding', { replace: true });
  }, [location.pathname, navigate]);
}

// Audit #409 perf: the SPA used to eagerly import every page, so the
// initial bundle dragged the chat stack, react-flow, the model wizard,
// the MCP servers section and the dashboards charts into the cold-start
// payload. We now lazy-load anything that doesn't render on the Home
// route. HomePage, ExplorerPage and LawDetailPage stay eager because
// they're the most common landing surfaces; SearchResultsPage stays
// because Cmd-K can land there at any moment.
const DiffPage = lazy(() => import('@/pages/DiffPage').then((m) => ({ default: m.DiffPage })));
const GraphPage = lazy(() => import('@/pages/GraphPage').then((m) => ({ default: m.GraphPage })));
const ChatPage = lazy(() => import('@/pages/ChatPage').then((m) => ({ default: m.ChatPage })));
const DashboardPage = lazy(() => import('@/pages/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const SettingsPage = lazy(() => import('@/pages/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const OnboardingPage = lazy(() => import('@/pages/OnboardingPage').then((m) => ({ default: m.OnboardingPage })));

function PageFallback() {
  return (
    <div className="flex h-full items-center justify-center p-12">
      <Skeleton className="h-8 w-32" />
    </div>
  );
}

// The marketing landing lives in a completely separate Vite project under
// ../landing — it has its own build, deps and GitHub Pages deploy. The SPA
// owns only the application surface; `/` redirects to the home dashboard.
export function App() {
  // Page-view telemetry — no-op unless both gates (operator env +
  // user Zustand consent) are on. Lives inside ``BrowserRouter`` so
  // ``useLocation`` resolves.
  usePageViewTelemetry();
  // Audit #471 — redirect first-launch users to ``/onboarding`` until
  // they complete it.
  useFirstLaunchGate();
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route path="/" element={<Navigate to="/home" replace />} />

        {/* First-launch gate; nav to /onboarding from a host trigger when needed. */}
        <Route path="/onboarding" element={<OnboardingPage />} />

        <Route element={<AppShell />}>
          <Route path="home" element={<HomePage />} />
          <Route path="explorer" element={<ExplorerPage />} />
          <Route path="laws/:lawId" element={<LawDetailPage />} />
          <Route path="laws/:lawId/diff" element={<DiffPage />} />
          <Route path="graph" element={<GraphPage />} />
          <Route path="chat" element={<ChatPage />} />
          <Route path="chat/:threadId" element={<ChatPage />} />
          <Route path="dashboards" element={<DashboardPage />} />
          <Route path="dashboards/:preset" element={<DashboardPage />} />
          <Route path="search" element={<SearchResultsPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="settings/:section" element={<SettingsPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/home" replace />} />
      </Routes>
    </Suspense>
  );
}
