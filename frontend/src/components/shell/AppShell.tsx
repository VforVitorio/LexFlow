import { Outlet, useNavigate } from 'react-router-dom';
import { LeftRail } from './LeftRail';
import { TopBar } from './TopBar';
import { CommandPalette } from './CommandPalette';
import { useUi } from '@/lib/store';
import { useHotkey, useGoToHotkey } from '@/lib/hotkeys';

export function AppShell() {
  const { togglePalette, toggleRight, toggleLeft, toggleTheme } = useUi();
  const navigate = useNavigate();

  useHotkey('mod+k', (e) => { e.preventDefault(); togglePalette(); });
  useHotkey('mod+/', (e) => { e.preventDefault(); toggleRight(); });
  useHotkey('mod+\\', (e) => { e.preventDefault(); toggleLeft(); });
  useHotkey('mod+.', (e) => { e.preventDefault(); toggleTheme(); });

  useGoToHotkey({
    h: () => navigate('/home'),
    e: () => navigate('/explorer'),
    g: () => navigate('/graph'),
    c: () => navigate('/chat'),
    d: () => navigate('/dashboards'),
    s: () => navigate('/settings'),
  });

  return (
    <div className="flex h-full w-full overflow-hidden bg-bg text-fg">
      <a href="#main" className="skip-link">Saltar al contenido principal</a>
      <LeftRail />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main id="main" tabIndex={-1} className="min-h-0 flex-1 overflow-hidden">
          <Outlet />
        </main>
      </div>
      <CommandPalette />
    </div>
  );
}
