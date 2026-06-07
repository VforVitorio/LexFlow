import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Search, Moon, Sun, SidebarOpen, SidebarClose } from 'lucide-react';
import { Avatar, Button, Kbd } from '@/components/ui';
import { useUi } from '@/lib/store';
import { useLaw } from '@/lib/queries';
import { modKey } from '@/lib/utils';

export function TopBar() {
  const { t } = useTranslation();
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
        <span className="flex-1 text-left">{t('shell.searchPlaceholder')}</span>
        <Kbd>{modKey} K</Kbd>
      </button>

      <Button size="icon" variant="ghost" aria-label={t('shell.toggleTheme')} onClick={toggleTheme} className="ml-auto md:ml-0">
        {theme === 'light' ? <Sun className="size-4" /> : <Moon className="size-4" />}
      </Button>
      <Button size="icon" variant="ghost" aria-label={t('shell.toggleRightPanel')} onClick={toggleRight}>
        {rightOpen ? <SidebarClose className="size-4" /> : <SidebarOpen className="size-4" />}
      </Button>
      <Avatar initials="LV" size={28} />
    </header>
  );
}

function Breadcrumb({ path, lawId, navigate }: { path: string; lawId?: string; navigate: (to: string) => void }) {
  const { t } = useTranslation();
  // Audit #409 perf: previously fetched the full paginated /laws list
  // (one row per law) just to extract one row's ``short`` name. Now we
  // hit ``/laws/{id}`` directly via ``useLaw`` — single-row payload,
  // dedupes with LawDetailPage's query.
  const { data: law } = useLaw(lawId);

  const items: { label: string; onClick?: () => void; sub?: string }[] = [];
  if (path === '/') items.push({ label: t('nav.home') });
  else if (path === '/explorer') items.push({ label: t('nav.explorer') });
  else if (path.startsWith('/laws/') && path.endsWith('/diff')) {
    items.push({ label: t('nav.explorer'), onClick: () => navigate('/explorer') });
    if (law) items.push({ label: law.short, onClick: () => navigate(`/laws/${encodeURIComponent(law.id)}`) });
    items.push({ label: t('shell.diff') });
  } else if (path.startsWith('/laws/')) {
    items.push({ label: t('nav.explorer'), onClick: () => navigate('/explorer') });
    if (law) items.push({ label: law.short });
  } else if (path === '/graph') items.push({ label: t('nav.graph') });
  // Audit #409 — the hardcoded 'Sesión: EIPD LOPDGDD' / 'Compliance'
  // sub-labels are gone. Real per-thread / per-preset labels need a
  // dedicated lookup that we don't have wired here yet; we drop the
  // sub-label rather than lying.
  else if (path === '/chat') items.push({ label: t('nav.chat') });
  else if (path === '/dashboards') items.push({ label: t('nav.dashboards') });
  else if (path === '/settings') items.push({ label: t('nav.settings') });
  else items.push({ label: path.slice(1) });

  return (
    <nav aria-label={t('shell.breadcrumb')} className="flex min-w-0 items-center gap-1.5 text-[13px]">
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
