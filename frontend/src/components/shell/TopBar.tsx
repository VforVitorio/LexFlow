import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ChevronRight, Search, Moon, Sun, SidebarOpen, SidebarClose } from 'lucide-react';
import { Avatar, Button, Kbd } from '@/components/ui';
import { useUi } from '@/lib/store';
import { useLawsList } from '@/lib/queries';
import { modKey } from '@/lib/utils';

export function TopBar() {
  const { theme, toggleTheme, rightOpen, toggleRight, setPaletteOpen } = useUi();
  const location = useLocation();
  const navigate = useNavigate();
  const params = useParams<{ lawId?: string }>();

  return (
    <header
      role="banner"
      className="flex h-12 shrink-0 items-center gap-3 border-b border-border bg-bg px-4"
    >
      <Breadcrumb path={location.pathname} lawId={params.lawId} navigate={navigate} />

      {/* Search trigger — desktop only; mobile uses the floating button in AppShell. */}
      <button
        onClick={() => setPaletteOpen(true)}
        data-tour-id="search-trigger"
        className="ml-auto hidden h-8 w-80 items-center gap-2.5 rounded-lg border border-border-strong bg-surface px-2.5 text-[13px] text-muted transition-colors hover:border-indigo-500/60 hover:text-fg md:inline-flex"
      >
        <Search className="size-3.5" />
        <span className="flex-1 text-left">Buscar leyes, artículos…</span>
        <Kbd>{modKey} K</Kbd>
      </button>

      <Button size="icon" variant="ghost" aria-label="Cambiar tema" onClick={toggleTheme} className="ml-auto md:ml-0">
        {theme === 'light' ? <Sun className="size-4" /> : <Moon className="size-4" />}
      </Button>
      <Button size="icon" variant="ghost" aria-label="Alternar panel derecho" onClick={toggleRight}>
        {rightOpen ? <SidebarClose className="size-4" /> : <SidebarOpen className="size-4" />}
      </Button>
      <Avatar initials="LV" size={28} />
    </header>
  );
}

function Breadcrumb({ path, lawId, navigate }: { path: string; lawId?: string; navigate: (to: string) => void }) {
  const { data } = useLawsList({}, { staleTime: 60_000, enabled: !!lawId });
  const law = lawId ? data?.items.find((l) => l.id === lawId) : null;

  const items: { label: string; onClick?: () => void; sub?: string }[] = [];
  if (path === '/') items.push({ label: 'Inicio' });
  else if (path === '/explorer') items.push({ label: 'Explorador' });
  else if (path.startsWith('/laws/') && path.endsWith('/diff')) {
    items.push({ label: 'Explorador', onClick: () => navigate('/explorer') });
    if (law) items.push({ label: law.short, onClick: () => navigate(`/laws/${law.id}`) });
    items.push({ label: 'Diff' });
  } else if (path.startsWith('/laws/')) {
    items.push({ label: 'Explorador', onClick: () => navigate('/explorer') });
    if (law) items.push({ label: law.short });
  } else if (path === '/graph') items.push({ label: 'Grafo' });
  else if (path === '/chat') items.push({ label: 'Chat', sub: 'Sesión: EIPD LOPDGDD' });
  else if (path === '/dashboards') items.push({ label: 'Cuadros', sub: 'Compliance' });
  else if (path === '/settings') items.push({ label: 'Ajustes' });
  else items.push({ label: path.slice(1) });

  return (
    <nav aria-label="Migas" className="flex min-w-0 items-center gap-1.5 text-[13px]">
      {items.map((it, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <ChevronRight className="size-3.5 text-muted" />}
          {it.onClick ? (
            <button onClick={it.onClick} className="text-muted hover:text-fg">{it.label}</button>
          ) : (
            <span className="font-semibold">{it.label}</span>
          )}
          {it.sub && <span className="text-muted">· {it.sub}</span>}
        </span>
      ))}
    </nav>
  );
}
