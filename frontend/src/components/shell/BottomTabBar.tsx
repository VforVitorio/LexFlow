import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { NAV } from './nav-items';

/**
 * Mobile primary navigation. Replaces the desktop `LeftRail` below the `md`
 * breakpoint with a fixed-height bottom tab bar carrying the same five
 * destinations (see `nav-items`).
 *
 * Invariants:
 * - Rendered in the AppShell content column as an in-flow `shrink-0` element
 *   (not `position: fixed`), so `main` shrinks to fit and no page content
 *   ever hides behind the bar.
 * - `md:hidden` — desktop uses the LeftRail instead.
 * - Respects the iOS home-indicator safe area via `pb-[env(safe-area-inset-bottom)]`.
 */
export function BottomTabBar() {
  return (
    <nav
      aria-label="Navegación principal"
      className="flex shrink-0 items-stretch justify-around border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {NAV.map((it) => (
        <NavLink
          key={it.to}
          to={it.to}
          className={({ isActive }) =>
            cn(
              'flex flex-1 flex-col items-center justify-center gap-1 py-2 text-[10.5px] font-medium transition-colors',
              isActive ? 'text-indigo-600 dark:text-indigo-300' : 'text-muted hover:text-fg',
            )
          }
        >
          {({ isActive }) => (
            <>
              <it.icon className={cn('size-[22px]', isActive ? 'stroke-[2.25]' : 'stroke-[1.75]')} />
              <span>{it.label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
