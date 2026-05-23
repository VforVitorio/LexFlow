import { NavLink, useLocation } from 'react-router-dom';
import { Home, BookOpenText, Network, MessagesSquare, BarChart3, Settings, PanelLeft, PanelRightOpen } from 'lucide-react';
import { BrandMark } from '@/components/BrandMark';
import { Kbd } from '@/components/ui';
import { cn } from '@/lib/utils';
import { useUi } from '@/lib/store';
import { useLawsList } from '@/lib/queries';

interface NavItem { to: string; icon: React.ComponentType<{ className?: string }>; label: string; k: string; }

const NAV: NavItem[] = [
  { to: '/home',      icon: Home,           label: 'Inicio',     k: 'g h' },
  { to: '/explorer',  icon: BookOpenText,   label: 'Explorador', k: 'g e' },
  { to: '/graph',     icon: Network,        label: 'Grafo',      k: 'g g' },
  { to: '/chat',      icon: MessagesSquare, label: 'Chat',       k: 'g c' },
  { to: '/dashboards',icon: BarChart3,      label: 'Cuadros',    k: 'g d' },
];

export function LeftRail() {
  const expanded = useUi((s) => s.leftExpanded);
  const toggle = useUi((s) => s.toggleLeft);
  const { data: laws } = useLawsList({}, { staleTime: 60_000 });
  const recent = laws?.items.slice(0, 3) ?? [];

  return (
    <nav
      aria-label="Navegación principal"
      className={cn(
        'flex shrink-0 flex-col border-r border-border bg-surface transition-[width] duration-200 overflow-hidden',
        expanded ? 'w-[220px]' : 'w-[60px]',
      )}
    >
      {/* Brand */}
      <div className={cn('flex h-12 items-center gap-2.5 border-b border-border', expanded ? 'px-3.5' : 'justify-center')}>
        <BrandMark />
        {expanded && (
          <span className="font-display text-[15.5px] font-semibold tracking-tight">LexFlow</span>
        )}
      </div>

      {/* Nav items */}
      <div className="flex flex-col gap-0.5 p-2">
        {NAV.map((it) => (
          <NavLink
            key={it.to}
            to={it.to}
            title={!expanded ? it.label : undefined}
            className={({ isActive }) =>
              cn(
                'group relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] font-medium transition-colors',
                isActive
                  ? 'bg-primary-soft text-indigo-700 dark:text-indigo-200 font-semibold'
                  : 'text-fg hover:bg-surface-2',
                !expanded && 'justify-center px-0 py-2.5',
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-indigo-500" />}
                <it.icon className={cn('size-[17px]', isActive ? 'stroke-[2]' : 'stroke-[1.75]')} />
                {expanded && <span className="flex-1 text-left">{it.label}</span>}
                {expanded && <Kbd>{it.k}</Kbd>}
              </>
            )}
          </NavLink>
        ))}
      </div>

      {/* Recent */}
      {expanded && recent.length > 0 && (
        <div className="mt-auto border-t border-border px-3.5 py-3">
          <div className="label-caps mb-1.5">Reciente</div>
          <div className="flex flex-col gap-1">
            {recent.map((l) => (
              <NavLink
                key={l.id}
                to={`/laws/${l.id}`}
                className="flex items-center gap-2 truncate rounded px-1.5 py-1 text-[12.5px] hover:bg-surface-2"
              >
                <span className="size-1.5 shrink-0 rounded-full bg-indigo-500" />
                <span className="truncate">{l.short}</span>
              </NavLink>
            ))}
          </div>
        </div>
      )}

      {/* Bottom: settings + collapse */}
      <div className={cn('border-t border-border p-2 flex flex-col gap-0.5', !expanded && 'items-center')}>
        <NavLink
          to="/settings"
          title={!expanded ? 'Ajustes' : undefined}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] transition-colors',
              isActive ? 'text-fg bg-surface-2' : 'text-muted hover:bg-surface-2',
              !expanded && 'justify-center px-0 py-2.5',
            )
          }
        >
          <Settings className="size-[17px]" />
          {expanded && <span className="flex-1 text-left">Ajustes</span>}
          {expanded && <Kbd>g s</Kbd>}
        </NavLink>
        <button
          onClick={toggle}
          title={expanded ? 'Colapsar' : 'Expandir'}
          className={cn(
            'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] text-muted hover:bg-surface-2',
            !expanded && 'justify-center px-0 py-2.5',
          )}
        >
          {expanded ? <PanelLeft className="size-4" /> : <PanelRightOpen className="size-4" />}
          {expanded && <span className="flex-1 text-left">Colapsar</span>}
          {expanded && <Kbd>⌘ \\</Kbd>}
        </button>
      </div>
    </nav>
  );
}
