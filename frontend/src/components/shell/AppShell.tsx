import { Outlet, useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { LeftRail } from './LeftRail';
import { BottomTabBar } from './BottomTabBar';
import { TopBar } from './TopBar';
import { CommandPalette } from './CommandPalette';
import { useUi } from '@/lib/store';
import { useHotkey, useGoToHotkey } from '@/lib/hotkeys';

export function AppShell() {
  const { togglePalette, toggleRight, toggleLeft, toggleTheme, setPaletteOpen } = useUi();
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
        {/* Mobile primary nav — in-flow so `main` shrinks above it. */}
        <BottomTabBar />
      </div>
      <CommandPalette />
      {/* Mobile-only floating search/command trigger (desktop uses the TopBar search). */}
      <button
        type="button"
        aria-label="Buscar (paleta de comandos)"
        onClick={() => setPaletteOpen(true)}
        className="fixed bottom-[68px] right-4 z-30 flex size-12 items-center justify-center rounded-full bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 hover:bg-indigo-500 md:hidden"
      >
        <Search className="size-5" />
      </button>
    </div>
  );
}
