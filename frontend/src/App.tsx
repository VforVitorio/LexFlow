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
 * In-memory sentinel for environments where localStorage is entirely
 * unavailable (e.g. strict-privacy incognito modes that throw on any
 * storage access). Set to true the first time the gate dispatches a
 * redirect to /onboarding so that, if OnboardingPage.finish() cannot
 * persist the flag either (because setItem also throws), the gate does
 * not loop: we treat "user has already seen onboarding this session"
 * as sufficient even when we cannot durably record "user has completed
 * onboarding".
 *
 * WHY module-level rather than a ref: the hook lives inside the App
 * component; a ref would reset on every unmount/remount cycle, whereas a
 * module variable persists for the lifetime of the JS module (one page
 * load). That lifetime is exactly what we need.
 */
let _onboardingRedirectDispatched = false;

/**
 * Read the onboarding flag from the best available source.
 *
 * Returns true ONLY when:
 *   - localStorage[ONBOARDED_STORAGE_KEY] === '1' (durable, normal case), OR
 *   - the gate has already redirected the user to /onboarding this session
 *     (in-memory, covers blocked-storage environments to prevent a loop).
 *
 * An inaccessible OR empty localStorage is treated as "not yet onboarded"
 * — the safe default that always shows first-run onboarding.
 */
function isOnboarded(): boolean {
  if (_onboardingRedirectDispatched) return true;
  try {
    return localStorage.getItem(ONBOARDED_STORAGE_KEY) === '1';
  } catch {
    // localStorage is blocked (strict-privacy / sandboxed iframe).
    // _onboardingRedirectDispatched is already false here (checked above),
    // so return false → the gate will redirect and set the sentinel.
    return false;
  }
}

/**
 * Audit #471 — first-launch gate. The OnboardingPage was registered on
 * the router but unreachable: nothing redirected to it on a fresh
 * install. We now check ``localStorage[ONBOARDED_STORAGE_KEY]`` on
 * every navigation and push the user to ``/onboarding`` until they
 * complete it (which writes the flag in ``OnboardingPage.finish()``).
 * Subsequent loads short-circuit because the flag is set.
 *
 * Bug fix #674: the original catch block silently defaulted to
 * ``done = true`` when storage access threw, causing the gate to be
 * skipped in strict-privacy/incognito contexts where localStorage is
 * blocked. The correct unknown-state default is "not onboarded" (show
 * the gate). The ``_onboardingRedirectDispatched`` sentinel prevents the
 * redirect loop that would otherwise occur when OnboardingPage.finish()
 * cannot write the flag because storage is blocked: once we have sent the
 * user to /onboarding once this session, we consider the gate satisfied
 * for the rest of that session.
 */
function useFirstLaunchGate(): void {
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    if (location.pathname === '/onboarding') return;
    if (!isOnboarded()) {
      _onboardingRedirectDispatched = true;
      navigate('/onboarding', { replace: true });
    }
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
// Milestone 14 — document editor (TipTap). Lazy-loaded because the TipTap
// + ProseMirror bundle is non-trivial and the editor is an opt-in surface.
const EditorPage = lazy(() => import('@/pages/EditorPage').then((m) => ({ default: m.EditorPage })));

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
          <Route path="editor" element={<EditorPage />} />
          <Route path="editor/:docId" element={<EditorPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/home" replace />} />
      </Routes>
    </Suspense>
  );
}
