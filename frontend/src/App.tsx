import { Routes, Route, Navigate } from 'react-router-dom';
import { AppShell } from '@/components/shell/AppShell';
import { HomePage } from '@/pages/HomePage';
import { ExplorerPage } from '@/pages/ExplorerPage';
import { LawDetailPage } from '@/pages/LawDetailPage';
import { DiffPage } from '@/pages/DiffPage';
import { GraphPage } from '@/pages/GraphPage';
import { ChatPage } from '@/pages/ChatPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { SearchResultsPage } from '@/pages/SearchResultsPage';
import { OnboardingPage } from '@/pages/OnboardingPage';
import { NotFoundPage } from '@/pages/NotFoundPage';

export function App() {
  return (
    <Routes>
      {/* First-launch gate; nav to /onboarding from a host trigger when needed. */}
      <Route path="/onboarding" element={<OnboardingPage />} />

      <Route element={<AppShell />}>
        <Route index element={<HomePage />} />
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

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
